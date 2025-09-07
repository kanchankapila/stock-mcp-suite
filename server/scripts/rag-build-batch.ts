import 'dotenv/config';
// Build HNSW store for all symbols using existing DB news
process.env.RAG_STORE = process.env.RAG_STORE || 'hnsw';
process.env.RAG_DIR = process.env.RAG_DIR || 'server/.rag';

import db from '../src/db.js';
import { indexNamespace } from '../src/rag/langchain.js';
import { resolveTicker } from '../src/utils/ticker.js';
import { loadStocklist } from '../src/utils/stocklist.js';
import { logger } from '../src/utils/logger.js';

function uniq<T>(arr: T[]) { return Array.from(new Set(arr)); }

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.find(a=>/^--days=/.test(a));
  const days = daysArg ? Number(daysArg.split('=')[1]) : 60;
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 60) * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const entries = loadStocklist();
  const ySymbols = uniq(entries.map(e => { try { return resolveTicker(String(e.symbol||e.mcsymbol||e.name||''), 'yahoo'); } catch { return ''; } }).filter(Boolean));
  let total = 0, namespaces = 0;
  for (const ns of ySymbols) {
    try {
      const rows = db.prepare(`SELECT date, title, summary, url FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 1000`).all(ns, cutoff) as Array<{date:string,title:string,summary:string,url:string}>;
      if (!rows.length) continue;
      const texts = rows.map(r => ({ text: `${r.title?.trim()||''}. ${r.summary?.trim()||''}`.trim(), metadata: { date: String(r.date||'').slice(0,10), source: 'news', url: r.url||'' } })).filter(t => t.text);
      if (!texts.length) continue;
      const out = await indexNamespace(ns, { texts });
      total += out.added; namespaces += 1;
      logger.info({ ns, added: out.added }, 'rag_build_ns_done');
    } catch (err:any) {
      logger.warn({ err, ns }, 'rag_build_ns_failed');
    }
  }
  console.log(JSON.stringify({ ok: true, namespaces, added: total, cutoff }));
}

main().catch(err => { console.error(err); process.exit(1); });

