import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchYahooQuotesBatch, fetchYahooDaily, parseYahooDaily } from './yahoo.js';
import { fetchStooqDaily } from './stooq.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { fetchYahooFin } from '../providers/yahooFin.js';
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

            // Optional: yahoo_fin profile & KPIs -> news sentiment + RAG
            try {
              const doYf = String(process.env.PREFETCH_YFIN_ENABLE || 'true').toLowerCase() === 'true';
              if (doYf) {
                const yfin = await fetchYahooFin(ysym, '1y', '1d').catch(()=>null);
                if (yfin && yfin.ok !== false) {
                  const qt = (yfin as any).quote_table || {};
                  const info = (yfin as any).info || {};
                  const sector = info.sector || info.Sector || '';
                  const industry = info.industry || info.Industry || '';
                  const website = info.website || info.Website || '';
                  const summary = info.longBusinessSummary || info.long_business_summary || '';
                  const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
                  const pe = qt['PE Ratio (TTM)'] || '';
                  const eps = qt['EPS (TTM)'] || '';
                  const kpiText = `Sector: ${sector}. Industry: ${industry}. Market Cap: ${mcap}. PE: ${pe}. EPS: ${eps}. ${summary}`.trim();
                  if (kpiText) {
                    const id = `yfin:profile:${ysym}`;
                    const date = new Date().toISOString();
                    const s = sentimentScore([kpiText]);
                    insertNewsRow({ id, symbol: ysym, date, title: 'Yahoo Profile & KPIs', summary: kpiText.slice(0, 960), url: website || 'https://finance.yahoo.com/', sentiment: s });
                    try {
                      const enableRag = String(process.env.PREFETCH_RAG_INDEX_ENABLE || 'false').toLowerCase() === 'true';
                      if (enableRag) await indexNamespace(ysym, { texts: [{ text: kpiText, metadata: { date: date.slice(0,10), source: 'yahoo_fin', url: website || '' } }] });
                    } catch {}
                  }
                }
              }
            } catch (e) {
              logger.warn({ err: e, symbol: ysym }, 'prefetch_yahoo_fin_failed');
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

  // Separate scheduler: yahoo_fin KPIs and financials (default daily)
  (function startYahooFinScheduler() {
    const ENABLE = String(process.env.PREFETCH_YFIN_ENABLE || 'true').toLowerCase() === 'true';
    if (!ENABLE) return;
    const YFIN_BATCH = Number(process.env.PREFETCH_YFIN_BATCH || 25);
    const YFIN_INTERVAL_MS = Number(process.env.PREFETCH_YFIN_INTERVAL_MS || 86_400_000); // 24 hours
    const YFIN_COOLDOWN_MS = Number(process.env.PREFETCH_YFIN_COOLDOWN_MS || 60_000);
    let yidx = 0;

    function makeFinancialSummary(yfin: any): string {
      try {
        const info = yfin?.info || {};
        const qt = yfin?.quote_table || {};
        const sector = info.sector || info.Sector || '';
        const industry = info.industry || info.Industry || '';
        const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
        // Revenue trend
        const isObj = yfin?.income_statement || {};
        const revMap = isObj?.totalRevenue || isObj?.TotalRevenue || null;
        let revSummary = '';
        if (revMap && typeof revMap === 'object') {
          const entries = Object.entries(revMap)
            .filter(([k,_]) => /(\d{4}(-\d{2}-\d{2})?)/.test(String(k)))
            .sort((a,b)=> String(a[0]) < String(b[0]) ? -1 : 1);
          const nums = entries.map(([,v]) => Number(v)).filter(n=> Number.isFinite(n));
          if (nums.length >= 2) {
            const first = nums[0], last = nums[nums.length-1];
            const pct = first !== 0 ? ((last-first)/Math.abs(first))*100 : 0;
            revSummary = `Revenue ${pct>=0? 'increased':'decreased'} ${Math.abs(pct).toFixed(1)}% over ${entries.length} periods.`;
          }
        }
        // Operating Cash Flow trend
        const cfObj = yfin?.cash_flow || {};
        const ocfMap = (cfObj?.totalCashFromOperatingActivities) || (cfObj?.TotalCashFromOperatingActivities) || null;
        let ocfSummary = '';
        if (ocfMap && typeof ocfMap === 'object') {
          const entries = Object.entries(ocfMap)
            .filter(([k,_]) => /(\d{4}(-\d{2}-\d{2})?)/.test(String(k)))
            .sort((a,b)=> String(a[0]) < String(b[0]) ? -1 : 1);
          const nums = entries.map(([,v]) => Number(v)).filter(n=> Number.isFinite(n));
          if (nums.length >= 2) {
            const first = nums[0], last = nums[nums.length-1];
            const pct = first !== 0 ? ((last-first)/Math.abs(first))*100 : 0;
            ocfSummary = `Operating cash flow ${pct>=0? 'increased':'decreased'} ${Math.abs(pct).toFixed(1)}% over ${entries.length} periods.`;
          }
        }
        // Margins (profit/operating)
        let marginsSummary = '';
        try {
          const statsArr: Array<any> = Array.isArray(yfin?.stats) ? yfin.stats : [];
          const findAttr = (name: string) => {
            const row = (statsArr || []).find((r: any) => new RegExp(name, 'i').test(String(r?.Attribute || r?.attribute || '')));
            return row ? (row?.Value ?? row?.value ?? '') : '';
          };
          const pm = String(findAttr('Profit Margin'));
          const om = String(findAttr('Operating Margin')) || String(findAttr('Operating Margin (ttm)'));
          const pmNum = (()=>{ const m = pm.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; })();
          const omNum = (()=>{ const m = om.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; })();
          const parts = [] as string[];
          if (Number.isFinite(pmNum)) parts.push(`Profit margin ${pmNum.toFixed(1)}%`);
          if (Number.isFinite(omNum)) parts.push(`Operating margin ${omNum.toFixed(1)}%`);
          if (parts.length) marginsSummary = parts.join(', ') + '.';
        } catch {}
        // EPS trend
        const epsArr: Array<any> = yfin?.earnings_history || [];
        let epsSummary = '';
        if (Array.isArray(epsArr) && epsArr.length >= 2) {
          const vals = epsArr.map(r => Number(r?.epsactual ?? r?.epsActual ?? r?.eps_estimate)).filter(n=>Number.isFinite(n));
          if (vals.length >= 2) {
            const first = vals[0], last = vals[vals.length-1];
            const delta = last-first;
            epsSummary = `EPS ${delta>=0? 'rose':'fell'} by ${Math.abs(delta).toFixed(2)} (${vals.length} reports).`;
          }
        }
        // Options bias via open interest if available
        let optSummary = '';
        try {
          const opt = yfin?.options || null;
          const calls: Array<any> = Array.isArray(opt?.calls) ? opt.calls : [];
          const puts: Array<any> = Array.isArray(opt?.puts) ? opt.puts : [];
          const sum = (arr: Array<any>, key: string) => arr.reduce((a, r)=> a + (Number(r?.[key]) || 0), 0);
          const callOi = sum(calls, 'Open Interest') || sum(calls, 'openInterest') || sum(calls, 'open_interest');
          const putOi = sum(puts, 'Open Interest') || sum(puts, 'openInterest') || sum(puts, 'open_interest');
          if (callOi > 0 || putOi > 0) {
            const pcr = (callOi + putOi) > 0 ? (putOi / Math.max(1, callOi)) : 0;
            // Simple bias from OI distribution
            const bias = (callOi + putOi) > 0 ? ((callOi - putOi) / (callOi + putOi)) : 0; // [-1,1]
            optSummary = `Options OI PCR=${(putOi/Math.max(1,callOi)).toFixed(2)}, bias=${bias.toFixed(2)}`;
          }
        } catch {}

        const s = [`Sector: ${sector}`, `Industry: ${industry}`, `Mcap: ${mcap}`, revSummary, ocfSummary, marginsSummary, epsSummary, optSummary]
          .filter(Boolean).join('. ');
        return s;
      } catch { return ''; }
    }

    const runYfin = async () => {
      try {
        const end = Math.min(yidx + YFIN_BATCH, tickers.length);
        const slice = tickers.slice(yidx, end);
        if (!slice.length) { yidx = 0; return; }
        for (const ysym of slice) {
          try {
            const yfin = await fetchYahooFin(ysym, '1y', '1d').catch(()=>null);
            if (!yfin || yfin.ok === false) { await sleep(YFIN_COOLDOWN_MS); continue; }
            const profileParts = (()=>{
              const info = yfin?.info || {}; const qt = yfin?.quote_table || {};
              const sector = info.sector || info.Sector || '';
              const industry = info.industry || info.Industry || '';
              const website = info.website || info.Website || '';
              const summary = info.longBusinessSummary || info.long_business_summary || '';
              const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
              const pe = qt['PE Ratio (TTM)'] || '';
              const eps = qt['EPS (TTM)'] || '';
              return { sector, industry, website, summary, mcap, pe, eps };
            })();
            const kpiText = `Sector: ${profileParts.sector}. Industry: ${profileParts.industry}. Market Cap: ${profileParts.mcap}. PE: ${profileParts.pe}. EPS: ${profileParts.eps}. ${profileParts.summary}`.trim();
            const finText = makeFinancialSummary(yfin);
            const date = new Date().toISOString();
            const texts: Array<{ text: string; metadata: any }> = [];
            if (kpiText) {
              const sid = `yfin:profile:${ysym}`;
              const s = sentimentScore([kpiText]);
              insertNewsRow({ id: sid, symbol: ysym, date, title: 'Yahoo Profile & KPIs', summary: kpiText.slice(0, 960), url: profileParts.website || 'https://finance.yahoo.com/', sentiment: s });
              texts.push({ text: kpiText, metadata: { date: date.slice(0,10), source: 'yahoo_fin', url: profileParts.website || '' } });
            }
            if (finText) {
              const fid = `yfin:financials:${ysym}`;
              const s2 = sentimentScore([finText]);
              insertNewsRow({ id: fid, symbol: ysym, date, title: 'Yahoo Financials Summary', summary: finText.slice(0, 960), url: 'https://finance.yahoo.com/', sentiment: s2 });
              texts.push({ text: finText, metadata: { date: date.slice(0,10), source: 'yahoo_fin_financials', url: '' } });
            }
            const enableRag = String(process.env.PREFETCH_RAG_INDEX_ENABLE || 'false').toLowerCase() === 'true';
            if (enableRag && texts.length) {
              try { await indexNamespace(ysym, { texts }); } catch {}
            }

            // Store options metrics (bias) into options_metrics
            try {
              const opt = (yfin as any)?.options || null;
              const calls: Array<any> = Array.isArray(opt?.calls) ? opt.calls : [];
              const puts: Array<any> = Array.isArray(opt?.puts) ? opt.puts : [];
              const sum = (arr: Array<any>, key: string) => arr.reduce((a, r)=> a + (Number(r?.[key]) || 0), 0);
              const callOi = sum(calls, 'Open Interest') || sum(calls, 'openInterest') || sum(calls, 'open_interest');
              const putOi = sum(puts, 'Open Interest') || sum(puts, 'openInterest') || sum(puts, 'open_interest');
              const callVol = sum(calls, 'Volume') || sum(calls, 'volume');
              const putVol = sum(puts, 'Volume') || sum(puts, 'volume');
              let pcr: number | null = null, pvr: number | null = null, bias: number | null = null;
              if ((callOi + putOi) > 0) { pcr = putOi / Math.max(1, callOi); bias = (callOi - putOi) / (callOi + putOi); }
              if ((callVol + putVol) > 0) { pvr = putVol / Math.max(1, callVol); }
              const now = new Date().toISOString().slice(0,10);
              // Upsert via DB helper
              try { const { upsertOptionsMetrics } = await import('../db.js'); (upsertOptionsMetrics as any)({ symbol: ysym, date: now, pcr, pvr, bias }); } catch {}
            } catch (e) {
              logger.warn({ err: e, symbol: ysym }, 'yfin_options_metrics_failed');
            }
          } catch (e) {
            logger.warn({ err: e, symbol: ysym }, 'yfin_prefetch_symbol_failed');
          }
          await sleep(Math.max(100, BASE_DELAY_MS));
        }
        yidx = end;
      } catch (err) {
        logger.warn({ err }, 'yfin_prefetch_failed');
      }
    };

    // initial kick then schedule
    runYfin().catch(()=>{});
    setInterval(runYfin, YFIN_INTERVAL_MS);
  })();
}
