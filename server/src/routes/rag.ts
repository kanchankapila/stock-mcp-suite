import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { indexNamespace, retrieve as lcRetrieve, answer as lcAnswer, answerSSE, ragStatsAll, ragStatsDetail } from '../rag/langchain.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker } from '../utils/ticker.js';
import db from '../db.js';
import fetch from 'node-fetch';
import { tlAdvTechnical } from '../providers/trendlyne.js';
import { fetchYahooQuoteSummary } from '../providers/yahoo.js';
import { fetchMcTech } from '../providers/moneycontrol.js';

export const router = Router();

router.post('/index', asyncHandler(async (req, res) => {
  const { namespace, urls, texts } = req.body || {};
  if (!namespace) return res.status(400).json({ ok:false, error: 'namespace required' });
  // Stricter validation for texts with metadata.date (must be ISO YYYY-MM-DD)
  if (Array.isArray(texts)) {
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i] || {};
      if (!t.text || typeof t.text !== 'string') return res.status(400).json({ ok:false, error:'invalid_text', index: i });
      const md = t.metadata || {};
      if (md.date !== undefined) {
        const dstr = String(md.date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dstr)) return res.status(400).json({ ok:false, error:'invalid_metadata_date_format', index: i, value: dstr });
        const d = new Date(dstr + 'T00:00:00Z');
        if (!isFinite(d.getTime())) return res.status(400).json({ ok:false, error:'invalid_metadata_date_value', index: i, value: dstr });
      }
    }
  }
  const result = await indexNamespace(String(namespace), { urls, texts });
  res.json({ ok:true, ...result });
}));

router.post('/query', asyncHandler(async (req, res) => {
  const { namespace, query, k, withAnswer, dateCutoff } = req.body || {};
  if (!namespace || !query) return res.status(400).json({ ok:false, error: 'namespace and query required' });
  try {
    if (withAnswer) {
      const out = await lcAnswer(String(namespace), String(query), Number(k||5), { dateCutoff: dateCutoff ? String(dateCutoff) : undefined });
      return res.json({ ok:true, ...out });
    }
    const docs = await lcRetrieve(String(namespace), String(query), Number(k||5), { dateCutoff: dateCutoff ? String(dateCutoff) : undefined });
    return res.json({ ok:true, hits: docs.map(d=>({ text: d.pageContent, metadata: d.metadata })) });
  } catch (err: any) {
    // Return a 400 with detail to aid debugging instead of a masked 500
    return res.status(400).json({ ok:false, error: String(err?.message || err) });
  }
}));

// SSE streaming answer
router.post('/stream', asyncHandler(async (req, res) => {
  const { namespace, query, k } = req.body || {};
  if (!namespace || !query) return res.status(400).json({ ok:false, error: 'namespace and query required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (ev: string, data: any) => { res.write(`event: ${ev}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
  await answerSSE(String(namespace), String(query), Number(k||5), ({type, data}) => send(type, data));
  res.end();
}));

// Reindex recent sources for a symbol (namespace = Yahoo symbol)
router.post('/reindex/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const days = req.query.days ? Number(req.query.days) : (req.body?.days ? Number(req.body.days) : 60);
  const cutoff = new Date(Date.now() - Math.max(1, isFinite(days) ? days : 60) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Collect recent news (includes MC insight rows stored in news)
  const rows = db.prepare(`SELECT date, title, summary, url, id FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 1000`).all(symbol, cutoff) as Array<{date:string,title:string,summary:string,url:string,id:string}>;
  const texts: Array<{ text: string; metadata: any }> = rows.map(r => ({
    text: `${r.title?.trim() || ''}. ${r.summary?.trim() || ''}`.trim(),
    metadata: { date: String(r.date || '').slice(0,10), source: r.id?.startsWith('mc:insights') ? 'mc' : 'news', url: r.url || '' }
  })).filter(t => t.text);
  // Also fetch Trendlyne Adv-Tech longtexts live (best effort)
  try {
    const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    let tlid = '';
    try { tlid = resolveTicker(base, 'trendlyne'); } catch {}
    if (tlid) {
      // Map days to a reasonable lookback bucket
      const lb = days <= 15 ? 12 : days <= 90 ? 24 : 48;
      let adv: any = null;
      try { adv = await tlAdvTechnical(tlid, lb); } catch {}
      if (!adv) {
        // Fallback unauthenticated public endpoint
        const url = `https://trendlyne.com/equity/api/stock/adv-technical-analysis/${encodeURIComponent(tlid)}/${encodeURIComponent(String(lb))}/`;
        try {
          const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*', 'Referer': 'https://trendlyne.com/' } as any });
          if (resp.ok) adv = await resp.json().catch(()=>null);
        } catch {}
      }
      if (adv && adv.body) {
        const body: any = adv.body;
        // Pivot insight
        const pivotLong = body?.parameters?.pivot_level?.insight?.longtext || body?.parameters?.pivot_level?.insight?.shorttext || '';
        if (pivotLong) texts.push({ text: String(pivotLong), metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
        // SMA/EMA insights
        const ms = body?.parameters?.ma_signal || body?.ma_signal || {};
        if (ms?.sma_insight) texts.push({ text: String(ms.sma_insight), metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
        if (ms?.ema_insight) texts.push({ text: String(ms.ema_insight), metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
        // SMA/EMA numeric values
        try {
          const sparams = Array.isArray(body?.parameters?.sma_parameters) ? body.parameters.sma_parameters : [];
          if (sparams.length) {
            const parts = sparams.map((p:any)=> `${p?.name || ''}=${Number(p?.value ?? NaN).toFixed(2)}`).slice(0,12).join(', ');
            if (parts) texts.push({ text: `TL SMA values: ${parts}`, metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
          }
        } catch {}
        try {
          const eparams = Array.isArray(body?.parameters?.ema_parameters) ? body.parameters.ema_parameters : [];
          if (eparams.length) {
            const parts = eparams.map((p:any)=> `${p?.name || ''}=${Number(p?.value ?? NaN).toFixed(2)}`).slice(0,12).join(', ');
            if (parts) texts.push({ text: `TL EMA values: ${parts}`, metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
          }
        } catch {}
        // Oscillator descriptions
        const oscillators = body?.parameters?.oscillator_parameter || [];
        if (Array.isArray(oscillators)) {
          for (const o of oscillators) {
            const name = String(o?.name || '');
            const desc = String(o?.description || o?.insight?.longtext || o?.insight?.shorttext || '');
            if (desc) texts.push({ text: `${name}: ${desc}`, metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
            const val = o?.value ?? null;
            if (val !== null && val !== undefined && isFinite(Number(val))) texts.push({ text: `TL Oscillator ${name}=${Number(val).toFixed(2)}`, metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
          }
        }
        // Momentum insight
        const momentum = body?.momentum || {};
        const mlong = momentum?.insight?.longtext || momentum?.insight?.shorttext || '';
        if (mlong) texts.push({ text: String(mlong), metadata: { date: new Date().toISOString().slice(0,10), source: 'trendlyne', tlid, url: '' } });
      }
    }
  } catch {}
  // Yahoo summary details (price, 52w range, PE, beta, mcap, dividend)
  try {
    const mods = ['price','summaryDetail','defaultKeyStatistics','financialData'];
    const sum: any = await fetchYahooQuoteSummary(symbol, mods).catch(()=>null);
    const r = (sum?.result?.[0]) || sum?.result?.length===0 ? null : sum;
    const obj: any = (sum?.result?.[0]) || {};
    const price = obj?.price?.regularMarketPrice?.raw ?? obj?.price?.regularMarketPrice ?? obj?.price?.regularMarketPrice ?? null;
    const low = obj?.summaryDetail?.fiftyTwoWeekLow?.raw ?? obj?.summaryDetail?.fiftyTwoWeekLow ?? null;
    const high = obj?.summaryDetail?.fiftyTwoWeekHigh?.raw ?? obj?.summaryDetail?.fiftyTwoWeekHigh ?? null;
    const pe = obj?.summaryDetail?.trailingPE?.raw ?? obj?.summaryDetail?.trailingPE ?? null;
    const beta = obj?.summaryDetail?.beta?.raw ?? obj?.summaryDetail?.beta ?? null;
    const mcap = obj?.price?.marketCap?.raw ?? obj?.price?.marketCap ?? obj?.summaryDetail?.marketCap?.raw ?? null;
    const div = obj?.summaryDetail?.dividendYield?.raw ?? obj?.summaryDetail?.dividendYield ?? null;
    const parts: string[] = [];
    if (isFinite(Number(price))) parts.push(`price=${Number(price).toFixed(2)}`);
    if (isFinite(Number(low)) && isFinite(Number(high))) parts.push(`52w=${Number(low).toFixed(2)}-${Number(high).toFixed(2)}`);
    if (isFinite(Number(pe))) parts.push(`PE=${Number(pe).toFixed(2)}`);
    if (isFinite(Number(beta))) parts.push(`beta=${Number(beta).toFixed(2)}`);
    if (isFinite(Number(mcap))) parts.push(`mcap=${Number(mcap)}`);
    if (isFinite(Number(div))) parts.push(`divYield=${Number(div).toFixed(4)}`);
    if (parts.length) texts.push({ text: `Yahoo Summary: ${parts.join(', ')}`, metadata: { date: new Date().toISOString().slice(0,10), source: 'yahoo', url: '' } });
  } catch {}
  // Moneycontrol technicals quick summary (D)
  try {
    const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    let mcs = '';
    try { mcs = resolveTicker(base, 'mc'); } catch {}
    if (mcs) {
      const tech: any = await fetchMcTech(mcs, 'D').catch(()=>null);
      if (tech) {
        // Try to extract a few salient values if present
        const parts: string[] = [];
        try { const rsi = tech?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value; if (isFinite(Number(rsi))) parts.push(`RSI=${Number(rsi).toFixed(2)}`); } catch {}
        try { const piv = tech?.pivot_level || tech?.pivots || {}; if (isFinite(Number(piv?.pivot))) parts.push(`Pivot=${Number(piv.pivot).toFixed(2)}`); } catch {}
        try { const score = tech?.score ?? tech?.stockScore; if (isFinite(Number(score))) parts.push(`Score=${Number(score).toFixed(2)}`); } catch {}
        const summary = parts.length ? `MC Tech (D): ${parts.join(', ')}` : `MC Tech (D) fetched.`;
        texts.push({ text: summary, metadata: { date: new Date().toISOString().slice(0,10), source: 'mc', mcsymbol: mcs, url: '' } });
      }
    }
  } catch {}
  // Optionally add Weekly/Monthly MC summaries (in addition to existing Daily)
  try {
    const includeMc = String(req.query.includeMc ?? req.body?.includeMc ?? 'true').toLowerCase() === 'true';
    if (includeMc) {
      const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
      let mcs = '';
      try { mcs = resolveTicker(base, 'mc'); } catch {}
      if (mcs) {
        for (const f of ['W','M'] as Array<'W'|'M'>) {
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
    }
  } catch {}

  // Apply include toggles by source
  try {
    const includeTl = String(req.query.includeTl ?? req.body?.includeTl ?? 'true').toLowerCase() === 'true';
    const includeYahoo = String(req.query.includeYahoo ?? req.body?.includeYahoo ?? 'true').toLowerCase() === 'true';
    const includeMc = String(req.query.includeMc ?? req.body?.includeMc ?? 'true').toLowerCase() === 'true';
    const filtered = texts.filter(t => {
      const src = String((t.metadata as any)?.source || '');
      if (src === 'trendlyne' && !includeTl) return false;
      if (src === 'yahoo' && !includeYahoo) return false;
      if (src === 'mc' && !includeMc) return false;
      return true;
    });
    texts.length = 0; texts.push(...filtered);
  } catch {}

  if (!texts.length) return res.json({ ok:true, added: 0, note: 'no_recent_rows' });
  const out = await indexNamespace(symbol, { texts });
  res.json({ ok:true, added: out.added, cutoff });
}));

// List RAG docs for a namespace
router.get('/docs/:ns', asyncHandler(async (req, res) => {
  const ns = String(req.params.ns || '').toUpperCase();
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const withText = String(req.query.withText ?? 'false').toLowerCase() === 'true';
  const rows = db.prepare(`SELECT id, text, metadata FROM rag_embeddings WHERE ns=? ORDER BY id DESC LIMIT ?`).all(ns, Math.max(1, Math.min(1000, limit))) as Array<{id:string, text?:string, metadata:string}>;
  const data = rows.map(r => { try { const md = JSON.parse(r.metadata||'{}'); const excerpt = withText ? String(r.text||'').slice(0,160) : undefined; return { id: r.id, date: md?.date || null, source: md?.source || null, excerpt }; } catch { return { id: r.id, date: null, source: null }; } });
  res.json({ ok:true, data });
}));

// URL status list per namespace
router.get('/url-status/:ns', asyncHandler(async (req, res) => {
  const ns = String(req.params.ns || '').toUpperCase();
  const rows = db.prepare(`SELECT url,last_indexed,status,note FROM rag_url_status WHERE ns=? ORDER BY last_indexed DESC`).all(ns) as Array<{url:string,last_indexed:string,status:string,note:string}>;
  res.json({ ok:true, data: rows });
}));

// Reset namespace: delete all embeddings and URL status for this ns
router.delete('/ns/:ns', asyncHandler(async (req, res) => {
  const ns = String(req.params.ns || '').toUpperCase();
  try {
    const delE = db.prepare(`DELETE FROM rag_embeddings WHERE ns=?`);
    const delU = db.prepare(`DELETE FROM rag_url_status WHERE ns=?`);
    const e = delE.run(ns);
    const u = delU.run(ns);
    res.json({ ok:true, deleted: { embeddings: e.changes ?? 0, urlStatus: u.changes ?? 0 } });
  } catch (err:any) {
    res.status(400).json({ ok:false, error: String(err?.message || err) });
  }
}));

// Admin: Batch build HNSW/Vector store for all symbols from stocklist (guarded by env flag)
router.post('/admin/build-batch', asyncHandler(async (req, res) => {
  if (String(process.env.RAG_ADMIN_ENABLE || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ ok:false, error: 'RAG admin disabled' });
  }
  const days = req.body?.days ? Number(req.body.days) : (req.query.days ? Number(req.query.days) : 60);
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 60) * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const entries = loadStocklist();
  const seen = new Set<string>();
  let namespaces = 0, added = 0;
  for (const e of entries) {
    try {
      const base = String(e.symbol || e.mcsymbol || e.name || '').toUpperCase();
      if (!base) continue;
      const ns = resolveTicker(base, 'yahoo');
      if (!ns || seen.has(ns)) continue;
      seen.add(ns);
      const rows = db.prepare(`SELECT date, title, summary, url FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 1000`).all(ns, cutoff) as Array<{date:string,title:string,summary:string,url:string}>;
      const texts = rows.map(r => ({ text: `${r.title?.trim()||''}. ${r.summary?.trim()||''}`.trim(), metadata: { date: String(r.date||'').slice(0,10), source: 'news', url: r.url||'' } })).filter(t => t.text);
      if (!texts.length) continue;
      const out = await indexNamespace(ns, { texts });
      namespaces += 1; added += out.added;
    } catch (err) {
      // skip individual symbol errors
    }
  }
  res.json({ ok:true, namespaces, added, cutoff });
}));

// Admin: Migrate existing SQLite embeddings to current RAG store (e.g., HNSW)
router.post('/admin/migrate', asyncHandler(async (_req, res) => {
  if (String(process.env.RAG_ADMIN_ENABLE || 'false').toLowerCase() !== 'true') {
    return res.status(403).json({ ok:false, error: 'RAG admin disabled' });
  }
  try {
    const nss = db.prepare(`SELECT DISTINCT ns FROM rag_embeddings ORDER BY ns`).all() as Array<{ns:string}>;
    let migrated = 0, namespaces = 0;
    for (const r of nss) {
      const ns = String(r.ns || '').toUpperCase();
      const rows = db.prepare(`SELECT text, metadata FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{text:string, metadata:string}>;
      if (!rows.length) continue;
      const texts = rows.map(rw=>{ let md:any={}; try{ md=JSON.parse(rw.metadata||'{}'); } catch{} return { text: rw.text, metadata: md }; }).filter(t=>t.text);
      if (!texts.length) continue;
      const out = await indexNamespace(ns, { texts });
      migrated += out.added; namespaces += 1;
    }
    res.json({ ok:true, namespaces, migrated });
  } catch (err:any) {
    res.status(400).json({ ok:false, error: String(err?.message || err) });
  }
}));

// RAG stats: list namespaces with counts, and optional per-namespace detail
router.get('/stats', asyncHandler(async (_req, res) => {
  try {
    const rows = await ragStatsAll();
    res.json({ ok:true, data: rows });
  } catch (err:any) {
    res.status(400).json({ ok:false, error: String(err?.message || err) });
  }
}));

router.get('/stats/:ns', asyncHandler(async (req, res) => {
  const ns = String(req.params.ns || '').toUpperCase();
  try {
    const d = await ragStatsDetail(ns);
    res.json({ ok:true, data: d });
  } catch (err:any) {
    res.status(400).json({ ok:false, error: String(err?.message || err) });
  }
}));
