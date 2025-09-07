import 'dotenv/config';
import { logger } from '../src/utils/logger.js';
import db from '../src/db.js';
import { resolveTicker } from '../src/utils/ticker.js';
import fetch from 'node-fetch';
import { tlAdvTechnical } from '../src/providers/trendlyne.js';
import { fetchMcTech } from '../src/providers/moneycontrol.js';

function parseArgs(argv: string[]) {
  const out: Record<string, string|boolean|number> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v === undefined) out[k] = true; else if (/^\d+$/.test(v)) out[k] = Number(v); else out[k] = v;
    } else if (!out._) out._ = a; else out.__ = a;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Prefer SQLite store for script-driven reindex to avoid hnsw native deps
  if (!process.env.RAG_STORE || process.env.RAG_STORE === 'hnsw') {
    process.env.RAG_STORE = 'sqlite';
  }
  const symbol = String((args._ ?? args.symbol ?? '').toString() || '').toUpperCase();
  if (!symbol) {
    console.error('Usage: npm run rag:reindex -- <SYMBOL> [--days=60] [--includeTl=true] [--includeYahoo=true] [--includeMc=true]');
    process.exit(1);
  }
  const days = Number(args.days ?? 60);
  const includeTl = String(args.includeTl ?? 'true').toLowerCase() === 'true';
  const includeYahoo = String(args.includeYahoo ?? 'true').toLowerCase() === 'true';
  const includeMc = String(args.includeMc ?? 'true').toLowerCase() === 'true';
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 60) * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const texts: Array<{ text: string, metadata: any }> = [];

  // Recent news from DB
  try {
    const rows = db.prepare(`SELECT date, title, summary, url, id FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 1000`).all(symbol, cutoff) as Array<{date:string,title:string,summary:string,url:string,id:string}>;
    for (const r of rows) {
      const text = `${r.title?.trim() || ''}. ${r.summary?.trim() || ''}`.trim();
      if (!text) continue;
      const source = r.id?.startsWith('mc:insights') ? 'mc' : 'news';
      if ((source === 'news' && !includeYahoo) || (source === 'mc' && !includeMc)) continue;
      texts.push({ text, metadata: { date: String(r.date||'').slice(0,10), source, url: r.url || '' } });
    }
  } catch (e) { logger.warn({ err: e, symbol }, 'rag_reindex_db_news_failed'); }

  // Trendlyne Adv-Tech summaries (best effort)
  if (includeTl) {
    try {
      const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
      let tlid = '';
      try { tlid = resolveTicker(base, 'trendlyne'); } catch {}
      if (tlid) {
        const lb = days <= 15 ? 12 : days <= 90 ? 24 : 48;
        let adv: any = null;
        try { adv = await tlAdvTechnical(tlid, lb); } catch {}
        if (!adv) {
          const url = `https://trendlyne.com/equity/api/stock/adv-technical-analysis/${encodeURIComponent(tlid)}/${encodeURIComponent(String(lb))}/`;
          try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*', 'Referer': 'https://trendlyne.com/' } as any });
            if (resp.ok) adv = await resp.json().catch(()=>null);
          } catch {}
        }
        if (adv) {
          const parts: string[] = [];
          try { const s = adv?.summary || adv?.text || adv?.meta?.summary; if (s) parts.push(String(s)); } catch {}
          try { const rsi = adv?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value; if (isFinite(Number(rsi))) parts.push(`RSI=${Number(rsi).toFixed(2)}`); } catch {}
          const text = parts.filter(Boolean).join(' | ').trim();
          if (text) texts.push({ text, metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne' } });
        }
      }
    } catch (e) { logger.warn({ err: e, symbol }, 'rag_reindex_tl_failed'); }
  }

  // Optional MC tech short summaries (D, W, M)
  if (includeMc) {
    try {
      const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
      let mcs = '';
      try { mcs = resolveTicker(base, 'mc'); } catch {}
      if (mcs) {
        for (const f of ['D','W','M'] as const) {
          const tech: any = await fetchMcTech(mcs, f).catch(()=>null);
          if (!tech) continue;
          const parts: string[] = [];
          try { const rsi = tech?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value; if (isFinite(Number(rsi))) parts.push(`RSI=${Number(rsi).toFixed(2)}`); } catch {}
          try { const piv = tech?.pivot_level || tech?.pivots || {}; const pv = piv?.pivot ?? piv?.pivot_point ?? piv?.PIVOT ?? null; if (isFinite(Number(pv))) parts.push(`Pivot=${Number(pv).toFixed(2)}`); } catch {}
          try { const score = tech?.score ?? tech?.stockScore; if (isFinite(Number(score))) parts.push(`Score=${Number(score).toFixed(2)}`); } catch {}
          const summary = parts.length ? `MC Tech (${f}): ${parts.join(', ')}` : `MC Tech (${f}) fetched.`;
          texts.push({ text: summary, metadata: { date: new Date().toISOString().slice(0,10), source: 'mc', mcsymbol: mcs, freq: f } });
        }
      }
    } catch (e) { logger.warn({ err: e, symbol }, 'rag_reindex_mc_failed'); }
  }

  if (!texts.length) {
    logger.info({ symbol, cutoff }, 'rag_reindex_no_texts');
    console.log(JSON.stringify({ ok: true, added: 0, cutoff, note: 'no_recent_rows' }));
    return;
  }
  const { indexNamespace } = await import('../src/rag/langchain.js');
  const out = await indexNamespace(symbol, { texts });
  logger.info({ symbol, added: out.added, cutoff }, 'rag_reindex_done');
  console.log(JSON.stringify({ ok: true, added: out.added, cutoff }));
}

main().catch(err => { console.error(err); process.exit(1); });
