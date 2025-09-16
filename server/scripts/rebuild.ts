import fs from 'fs';
import path from 'path';
import '../src/utils/logger.js';
// Do not import db at top-level; we will import after deleting files
type DbModule = typeof import('../src/db.js');
let dbMod: DbModule;
import { fetchYahooDaily, parseYahooDaily } from '../src/providers/yahoo.js';
import { loadStocklist } from '../src/utils/stocklist.js';
import { resolveTicker } from '../src/utils/ticker.js';
import { fetchNews, parseNews } from '../src/providers/news.js';
import { sentimentScore } from '../src/analytics/sentiment.js';
import { fetchMcInsights, fetchMcTech } from '../src/providers/moneycontrol.js';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const explicit = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());
  const max = Number(process.env.REBUILD_MAX || (all ? Infinity : 20));
  const withNews = String(process.env.REBUILD_WITH_NEWS || 'true') === 'true';
  const withMc = String(process.env.REBUILD_WITH_MC || 'true') === 'true';

  // Remove existing DB files safely
  const dbPath = path.resolve(process.cwd(), 'stock.db');
  const wal = dbPath + '-wal';
  const shm = dbPath + '-shm';
  [dbPath, wal, shm].forEach(p => { try { if (fs.existsSync(p)) fs.rmSync(p); } catch {} });

  // Now import DB module to create a fresh database + schema
  dbMod = await import('../src/db.js');
  const { default: db, upsertStock, insertPriceRow, insertNewsRow, upsertMcTech } = dbMod;
  try { db.pragma?.('journal_mode = WAL'); } catch {}

  // Build symbol list
  let yahooSymbols: string[] = [];
  if (explicit.length) {
    yahooSymbols = explicit.map(sym => resolveTicker(sym, 'yahoo'));
  } else {
    const list = loadStocklist();
    // Prefer NSE .NS mapping as used in /stocks/list
    yahooSymbols = list.map(e => `${String(e.symbol || '').toUpperCase()}.NS`).filter(Boolean);
  }
  // De-dupe and cap
  const uniq = Array.from(new Set(yahooSymbols.filter(Boolean)));
  const symbols = uniq.slice(0, isFinite(max) ? max : uniq.length);

  console.log(`[rebuild] Recreating DB and ingesting ${symbols.length} symbol(s)`);
  let ok = 0, fail = 0;
  for (const y of symbols) {
    try {
      const chart = await fetchYahooDaily(y, '1y', '1d');
      const rows = parseYahooDaily(y, chart);
      if (!rows.length) { throw new Error('No rows'); }
      rows.forEach(r => insertPriceRow(r));
      upsertStock(y, y);
      // News ingest (optional; uses sample if no NEWS_API_KEY)
      if (withNews && process.env.NEWS_API_KEY) {
        const NA = process.env.NEWS_API_KEY;
        const base = y.includes('.') ? y.split('.')[0] : y;
        const newsQuery = resolveTicker(base, 'news');
        try {
          const json = await fetchNews(newsQuery, NA);
          const news = parseNews(y, json);
          for (const n of news) {
            const s = sentimentScore([`${n.title}. ${n.summary}`]);
            insertNewsRow({ id: n.id, symbol: y, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
          }
        } catch (err) {
          console.warn(`[rebuild] News failed for ${y}:`, (err as any)?.message || String(err));
        }
      }
      // Moneycontrol quick cache (insights + tech) optional
      if (withMc) {
        try {
          const base = y.includes('.') ? y.split('.')[0] : y;
          const mcid = resolveTicker(base, 'mc');
          if (mcid) {
            const insight = await fetchMcInsights(mcid, 'c');
            if (insight) {
              const title = insight.shortDesc ? `MC Insights: ${insight.shortDesc}` : `MC Insights (${insight.scId})`;
              const summary = insight.longDesc ? `${insight.longDesc} (Score: ${insight.stockScore ?? 0})` : `Score: ${insight.stockScore ?? 0}`;
              const date = new Date().toISOString();
              const id = `mc:insights:${insight.scId}`;
              const sent = sentimentScore([`${title}. ${summary}`]);
              insertNewsRow({ id, symbol: y, date, title, summary, url: 'https://www.moneycontrol.com/', sentiment: sent });
            }
            // Technicals cache for D/W/M
            const [tD, tW, tM] = await Promise.all([
              fetchMcTech(mcid, 'D').catch(()=>null),
              fetchMcTech(mcid, 'W').catch(()=>null),
              fetchMcTech(mcid, 'M').catch(()=>null),
            ]);
            if (tD) upsertMcTech(y, 'D', tD);
            if (tW) upsertMcTech(y, 'W', tW);
            if (tM) upsertMcTech(y, 'M', tM);
          }
        } catch (err) {
          console.warn(`[rebuild] MC cache failed for ${y}:`, (err as any)?.message || String(err));
        }
      }
      ok++;
      // small delay to be polite
      await sleep(100);
      console.log(`[rebuild] Ingested ${y} (${rows.length} rows)`);
    } catch (err) {
      fail++;
      console.warn(`[rebuild] Failed ${y}:`, (err as any)?.message || String(err));
    }
  }
  console.log(`[rebuild] Complete. ok=${ok} fail=${fail}`);
}

main().catch(err => { console.error('[rebuild] Fatal:', err); process.exitCode = 1; });
