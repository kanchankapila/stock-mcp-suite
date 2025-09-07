import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchYahooQuotesBatch, fetchYahooDaily, parseYahooDaily } from './yahoo.js';
import { fetchStooqDaily } from './stooq.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { insertPriceRow, upsertStock, insertNewsRow, upsertMcTech } from '../db.js';
import { indexNamespace } from '../rag/langchain.js';
import { logger } from '../utils/logger.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker } from '../utils/ticker.js';

function extractSymbolsFromStocklist(filePath: string): string[] {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    // Extract occurrences like symbol:'BEL' or symbol:"BEL" but NOT mcsymbol
    const regex = /(?:^|[\s,{])symbol\s*:\s*['\"]([A-Za-z0-9\-.]+)['\"]/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(txt))) {
      const s = m[1].toUpperCase();
      if (s && s !== '#N/A') set.add(s);
    }
    return Array.from(set);
  } catch (err) {
    logger.error({ err, filePath }, 'stocklist_parse_failed');
    return [];
  }
}

function toYahoo(symbol: string): string { return resolveTicker(symbol, 'yahoo'); }

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function resolveStocklistPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.STOCKLIST_PATH && path.resolve(String(process.env.STOCKLIST_PATH)),
    // When running from server folder
    path.resolve(process.cwd(), 'stocklist.ts'),
    // When running from repo root
    path.resolve(process.cwd(), 'server', 'stocklist.ts'),
    // Relative to this file compiled location (dist/providers)
    path.resolve(here, '..', '..', 'stocklist.ts'),
    // Safety: repoRoot/server/stocklist.ts from compiled location
    path.resolve(here, '..', '..', '..', 'server', 'stocklist.ts')
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function startYahooPrefetchFromStocklist() {
  if (String(process.env.PREFETCH_DISABLED || 'false') === 'true') {
    logger.warn('prefetch_disabled_by_env_var');
    return;
  }
  const stocklistPath = resolveStocklistPath();
  if (!stocklistPath) {
    logger.error('stocklist_not_found');
    return;
  }
  const baseSymbols = extractSymbolsFromStocklist(stocklistPath);
  if (!baseSymbols.length) {
    logger.warn({ stocklistPath }, 'prefetch_no_symbols');
    return;
  }

  const tickers = baseSymbols.map(toYahoo);
  const newsMap = new Map<string, string>(); // yahoo -> news query (usually name)
  const mcMap = new Map<string, string>();   // yahoo -> mcsymbol
  for (const b of baseSymbols) {
    try {
      const y = toYahoo(b);
      newsMap.set(y, resolveTicker(b, 'news'));
      mcMap.set(y, resolveTicker(b, 'mc'));
    } catch {}
  }
  const BATCH = Number(process.env.PREFETCH_BATCH || 100);
  const INTERVAL_MS = Number(process.env.PREFETCH_INTERVAL_MS || 60_000); // 1 min
  const BASE_DELAY_MS = Number(process.env.PREFETCH_PER_REQ_DELAY_MS || 200);
  const QUOTE_BATCH = Number(process.env.PREFETCH_QUOTE_BATCH_SIZE || 25);
  const BACKOFF_MULT = Number(process.env.PREFETCH_BACKOFF_MULT || 2);
  const BACKOFF_MAX_MS = Number(process.env.PREFETCH_BACKOFF_MAX_MS || 10_000);
  const BACKOFF_DECAY_MS = Number(process.env.PREFETCH_BACKOFF_DECAY_MS || 200);
  const USE_CHART_FALLBACK = String(process.env.PREFETCH_USE_CHART_FALLBACK || 'true') === 'true';

  logger.info({ count: tickers.length, BATCH, INTERVAL_MS }, 'prefetch_start');

  let idx = 0;
  let currentDelay = BASE_DELAY_MS;
  const runBatch = async () => {
    const end = Math.min(idx + BATCH, tickers.length);
    const slice = tickers.slice(idx, end);
    if (!slice.length) {
      idx = 0; // wrap around
      return;
    }
    logger.debug({ from: idx, to: end, size: slice.length, quoteBatch: QUOTE_BATCH }, 'prefetch_batch');
    for (let i = 0; i < slice.length; i += QUOTE_BATCH) {
      const chunk = slice.slice(i, i + QUOTE_BATCH);
      try {
        const quotes = await fetchYahooQuotesBatch(chunk);
        for (const q of quotes) {
          const date = new Date(q.time).toISOString().slice(0, 10);
          const row = { symbol: q.symbol, date, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 };
          insertPriceRow(row);
          upsertStock(q.symbol, q.symbol);
        }
        // success: decay delay towards base
        if (currentDelay > BASE_DELAY_MS) {
          currentDelay = Math.max(BASE_DELAY_MS, currentDelay - BACKOFF_DECAY_MS);
        }
      } catch (err) {
        logger.error({ err, symbols: chunk.join(',') }, 'prefetch_quote_failed');
        // Optional per-symbol fallback via chart API (slower, but resilient)
        if (USE_CHART_FALLBACK) {
          for (const s of chunk) {
            try {
              const chart = await fetchYahooDaily(s, '1d', '30m');
              const rows = parseYahooDaily(s, chart);
              const last = rows[rows.length - 1];
              if (last) {
                insertPriceRow(last);
                upsertStock(s, s);
              }
              await sleep(Math.max(200, BASE_DELAY_MS));
            } catch (e) {
              logger.error({ err: e, symbol: s }, 'prefetch_chart_fallback_failed');
              // Optional second fallback to Stooq daily last row
              try {
                if (String(process.env.PREFETCH_USE_STOOQ_FALLBACK || 'true') === 'true') {
                  const rows = await fetchStooqDaily(s);
                  const last = rows[rows.length - 1];
                  if (last) {
                    insertPriceRow(last);
                    upsertStock(s, s);
                  }
                }
              } catch (e2) {
                logger.error({ err: e2, symbol: s }, 'prefetch_stooq_fallback_failed');
              }
            }
          }
        }
        // backoff: increase delay
        currentDelay = Math.min(BACKOFF_MAX_MS, Math.max(BASE_DELAY_MS, currentDelay * BACKOFF_MULT));
      }
      await sleep(currentDelay);
    }
    idx = end;
  };

  // Kick an immediate small batch to warm cache
  runBatch().catch(()=>{});
  // Schedule periodic batches
  setInterval(runBatch, INTERVAL_MS);

  // Optional: Prefetch news using company names mapped from stocklist
  if (String(process.env.PREFETCH_NEWS_ENABLE || 'true') === 'true') {
    const NA = process.env.NEWS_API_KEY;
    if (!NA) {
      logger.warn('prefetch_news_disabled_no_api_key');
    } else {
      const NEWS_BATCH = Number(process.env.PREFETCH_NEWS_BATCH || 10);
      const NEWS_INTERVAL_MS = Number(process.env.PREFETCH_NEWS_INTERVAL_MS || 300_000); // 5 min
      const NEWS_COOLDOWN_MS = Number(process.env.PREFETCH_NEWS_COOLDOWN_MS || 900_000); // 15 min on 429
      let NEWS_COOLDOWN_UNTIL = 0;
      let nidx = 0;
      const runNews = async () => {
        // backoff window if rate limited earlier
        if (Date.now() < NEWS_COOLDOWN_UNTIL) {
          logger.warn({ until: new Date(NEWS_COOLDOWN_UNTIL).toISOString() }, 'prefetch_news_cooldown_active');
          return;
        }
        const end = Math.min(nidx + NEWS_BATCH, tickers.length);
        const slice = tickers.slice(nidx, end);
        if (!slice.length) { nidx = 0; return; }
        for (const ysym of slice) {
          try {
            const q = newsMap.get(ysym) || ysym;
            const json = await fetchNews(q, NA);
            const news = parseNews(ysym, json);
            const textsForIndex: Array<{ text: string; metadata: Record<string, unknown> }> = [];
            for (const n of news) {
              const s = sentimentScore([`${n.title}. ${n.summary}`]);
              insertNewsRow({ id: n.id, symbol: ysym, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
              const t = `${n.title?.trim() || ''}. ${n.summary?.trim() || ''}`.trim();
              if (t) textsForIndex.push({ text: t, metadata: { date: String(n.date || '').slice(0,10), source: 'news', url: n.url || '' } });
            }
            // Moneycontrol insights per symbol
            const mcid = mcMap.get(ysym);
            if (mcid) {
              const mc = await fetchMcInsights(mcid, 'c');
              if (mc) {
                const title = mc.shortDesc ? `MC Insights: ${mc.shortDesc}` : `MC Insights (${mc.scId})`;
                const summary = mc.longDesc ? `${mc.longDesc} (Score: ${mc.stockScore ?? 0})` : `Score: ${mc.stockScore ?? 0}`;
                const id = `mc:insights:${mc.scId}`;
                const date = new Date().toISOString();
                const sent = sentimentScore([`${title}. ${summary}`]);
                insertNewsRow({ id, symbol: ysym, date, title, summary, url: 'https://www.moneycontrol.com/', sentiment: sent });
                const mt = `${title.trim()}. ${summary.trim()}`.trim();
                if (mt) textsForIndex.push({ text: mt, metadata: { date: date.slice(0,10), source: 'mc', url: '' } });
              }
              // Moneycontrol technicals (optional prefetch)
              if (String(process.env.PREFETCH_MC_TECH_ENABLE || 'true') === 'true') {
                try {
                  const [td, tw, tm] = await Promise.all([
                    fetchMcTech(mcid, 'D'), fetchMcTech(mcid, 'W'), fetchMcTech(mcid, 'M')
                  ]);
                  if (td) upsertMcTech(ysym, 'D', td);
                  if (tw) upsertMcTech(ysym, 'W', tw);
                  if (tm) upsertMcTech(ysym, 'M', tm);
                } catch (e3) {
                  logger.warn({ err: e3, symbol: ysym }, 'prefetch_mc_tech_failed');
                }
              }
            }
            // Optional: push into RAG vector index per symbol
            try {
              const enable = String(process.env.PREFETCH_RAG_INDEX_ENABLE || 'false').toLowerCase() === 'true';
              if (enable && textsForIndex.length) {
                await indexNamespace(ysym, { texts: textsForIndex });
              }
            } catch (e) {
              logger.warn({ err: e, symbol: ysym }, 'prefetch_rag_index_failed');
            }
          } catch (err) {
            const msg = String((err as any)?.message || err);
            if (/429/.test(msg)) {
              NEWS_COOLDOWN_UNTIL = Date.now() + NEWS_COOLDOWN_MS;
              logger.warn({ symbol: ysym, err: msg, cooldownMs: NEWS_COOLDOWN_MS }, 'prefetch_news_rate_limited');
              break; // break out of the inner loop; cooldown will skip upcoming runs
            } else {
              logger.error({ err, symbol: ysym }, 'prefetch_news_failed');
            }
          }
          await sleep(Math.max(100, BASE_DELAY_MS));
        }
        nidx = end;
      };
      runNews().catch(()=>{});
      setInterval(runNews, NEWS_INTERVAL_MS);
    }
  }
}
