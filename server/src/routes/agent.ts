import express from 'express';
import { ResponseUtils } from '../shared/utils/response.utils.js';
import { listPrices, listNews, latestPrice, listOptionsMetrics, latestFeature } from '../db.js';
import db from '../db.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';

export const router = express.Router();

// Simple heuristic intent extraction (extended)
function detectIntents(q: string) {
  const wantSentiment = /sentiment|feel|mood/i.test(q);
  const wantPrediction = /predict|forecast|target|price target/i.test(q);
  const wantBacktest = /backtest|strategy test/i.test(q);
  const wantTopPicks = /top picks|top\s+stocks|recommend/i.test(q);
  const wantStats = /stat|today|latest|performance|price|move|summary/i.test(q);
  return { wantSentiment, wantPrediction, wantBacktest, wantTopPicks, wantStats };
}

function formatPct(v: number | null | undefined) { return (v === null || v === undefined || !Number.isFinite(v)) ? 'n/a' : `${(v*100).toFixed(2)}%`; }
function formatNum(v: number | null | undefined, d=2) { return (v === null || v === undefined || !Number.isFinite(v)) ? 'n/a' : v.toFixed(d); }
function classifySentiment(s: number | null | undefined) {
  if (s === null || s === undefined || !Number.isFinite(s)) return 'n/a';
  if (s > 0.15) return 'positive';
  if (s < -0.15) return 'negative';
  return 'neutral';
}

let _symbolCache: string[] | null = null;
function loadSymbolCache() {
  try {
    const rows = db.prepare(`SELECT DISTINCT symbol FROM prices LIMIT 10000`).all() as Array<{symbol:string}>;
    _symbolCache = rows.map(r=>String(r.symbol));
  } catch { _symbolCache = []; }
}
function fuzzyMatchSymbol(token: string): string | undefined {
  if (!_symbolCache) loadSymbolCache();
  if (!_symbolCache) return undefined;
  const up = token.toUpperCase();
  // Exact first
  let hit = _symbolCache.find(s => s.toUpperCase() === up);
  if (hit) return hit;
  // Prefix before dot (e.g., BEL matches BEL.NS)
  hit = _symbolCache.find(s => s.toUpperCase().startsWith(up + '.'));
  if (hit) return hit;
  // Prefix generic
  hit = _symbolCache.find(s => s.toUpperCase().startsWith(up));
  if (hit) return hit;
  // Contains (last resort)
  hit = _symbolCache.find(s => s.toUpperCase().includes(up));
  return hit;
}

function getPricesForSymbol(base: string) {
  const tried: string[] = [];
  function tryList(sym: string) { tried.push(sym); return listPrices(sym, 260) as Array<{date:string; close:number; volume:number}>; }
  let prices = tryList(base);
  let resolved = base;
  if (!prices.length) {
    if (base.includes('.')) {
      const root = base.split('.')[0];
      prices = tryList(root);
      if (prices.length) resolved = root;
    }
  }
  const altSuffixes = ['.NS', '.NSE', '.BSE'];
  if (!prices.length && !base.includes('.')) {
    for (const suf of altSuffixes) {
      const sym = base + suf;
      prices = tryList(sym);
      if (prices.length) { resolved = sym; break; }
    }
  }
  if (!prices.length) {
    // Fuzzy cache search
    const fm = fuzzyMatchSymbol(base);
    if (fm) {
      prices = tryList(fm);
      if (prices.length) resolved = fm;
    }
  }
  if (!prices.length) {
    try {
      const row = db.prepare(`SELECT symbol FROM prices WHERE UPPER(symbol)=? LIMIT 1`).get(base.toUpperCase()) as {symbol:string}|undefined;
      if (row) {
        const sym = row.symbol;
        const p2 = tryList(sym);
        if (p2.length) { prices = p2; resolved = sym; }
      }
    } catch {}
  }
  return { prices, resolvedSymbol: resolved, attempted: tried };
}

function buildStats(symbol: string) {
  const { prices, resolvedSymbol } = getPricesForSymbol(symbol);
  if (!prices.length) return { summary: 'No price data available.', raw: { usedSymbol: resolvedSymbol } };
  const last = prices[prices.length-1];
  const prev = prices.length>1 ? prices[prices.length-2] : last;
  const change = last.close - prev.close;
  const changePct = prev.close ? change / prev.close : 0;
  // 5 / 20 day returns (use earliest available if not enough)
  function ret(days: number) {
    if (prices.length <= days) return null;
    const past = prices[prices.length-1 - days];
    return past.close ? (last.close / past.close - 1) : null;
  }
  const ret5 = ret(5);
  const ret20 = ret(20);
  const volumes = prices.slice(-20).map(p=>p.volume).filter(v=>Number.isFinite(v));
  const avgVol20 = volumes.length ? volumes.reduce((a,b)=>a+b,0)/volumes.length : null;
  const news = listNews(resolvedSymbol, 15) as Array<{title:string; summary:string; sentiment:number}>; // use resolved symbol for news linkage
  const sent = news.length ? sentimentScore(news.map(n=>`${n.title}. ${n.summary}`)) : null;
  const sentClass = classifySentiment(sent);
  const optHist = listOptionsMetrics(resolvedSymbol, { days: 10, limit: 10 }) as Array<{ date:string; pcr:number|null; pvr:number|null; bias:number|null }>;
  const optLatest = optHist.length ? optHist[optHist.length-1] : null;
  const featRsi = latestFeature(resolvedSymbol);
  const closes = prices.map(p=>p.close);
  const prediction = closes.length >= 10 ? predictNextClose(closes, 10) : null;
  const predDiff = (prediction && Number.isFinite(prediction)) ? (prediction - last.close) : null;
  const predPct = (predDiff !== null && last.close) ? predDiff / last.close : null;

  const summaryLines: string[] = [];
  summaryLines.push(`Latest close ${formatNum(last.close)} (${change>=0?'+':'-'}${Math.abs(change).toFixed(2)}, ${formatPct(changePct)}) on ${last.date}`);
  summaryLines.push(`5d: ${formatPct(ret5)} • 20d: ${formatPct(ret20)}`);
  summaryLines.push(`Avg Vol(20): ${avgVol20 ? Math.round(avgVol20).toLocaleString() : 'n/a'} • Latest Vol: ${Number.isFinite(last.volume) ? last.volume.toLocaleString() : 'n/a'}`);
  summaryLines.push(`News Sentiment: ${sent !== null ? sent.toFixed(3) : 'n/a'} (${sentClass}) from ${news.length} articles`);
  if (optLatest) summaryLines.push(`Options PCR: ${formatNum(optLatest.pcr)} • PVR: ${formatNum(optLatest.pvr)} • Bias: ${formatNum(optLatest.bias)}`);
  if (featRsi) summaryLines.push(`RSI (${featRsi.date}): ${featRsi.rsi !== null ? featRsi.rsi.toFixed(2) : 'n/a'}`);
  if (prediction !== null) summaryLines.push(`Next Close Pred: ${prediction.toFixed(2)} (${predDiff!==null? (predDiff>=0?'+':'-')+Math.abs(predDiff).toFixed(2):'n/a'}, ${formatPct(predPct)})`);
  return {
    summary: summaryLines.join('\n'),
    raw: {
      usedSymbol: resolvedSymbol,
      latest: last,
      previous: prev,
      change, changePct,
      ret5, ret20,
      avgVol20,
      sentiment: sent,
      options: optLatest,
      rsi: featRsi?.rsi ?? null,
      prediction,
      predictionChange: predDiff,
      predictionPct: predPct
    }
  };
}

function inferSymbolFromQuery(q: string): string | undefined {
  try {
    // Explicit pattern: phrases like "for BEL" / "about BEL" / "on BEL"
    const explicit = /(for|about|on|regarding|of)\s+([A-Za-z]{2,10})(?:\b|$)/gi;
    let m: RegExpExecArray | null; const explicitCandidates: string[] = [];
    while ((m = explicit.exec(q)) !== null) { explicitCandidates.push(m[2]); }
    const stop = new Set(['FOR','AND','THE','OF','ON','TO','WITH','TODAY','TODAYS','PROVIDE','GIVE','SHOW','LATEST','STATISTICS','STATS','PRICE','PERFORMANCE','PLEASE','CURRENT']);
    function scoreToken(tok: string): string | undefined {
      const up = tok.toUpperCase(); if (stop.has(up)) return undefined; if (up.length < 2 || up.length > 8) return undefined;
      const stmt = db.prepare('SELECT 1 FROM prices WHERE symbol=? LIMIT 1');
      const row = stmt.get(up);
      if (row) return up;
      return fuzzyMatchSymbol(up);
    }
    // 1) Try explicit context matches first (in reverse order – last mentioned more likely)
    for (const tok of explicitCandidates.slice().reverse()) {
      const hit = scoreToken(tok); if (hit) return hit; }
    // 2) General token scan (reverse order so trailing token like BEL wins over FOR)
    const tokens = (q.toUpperCase().match(/[A-Z]{2,10}/g) || []).filter(t => !stop.has(t));
    for (const tok of tokens.slice().reverse()) { const hit = scoreToken(tok); if (hit) return hit; }
  } catch {}
  return undefined;
}

function buildAnswer(q: string, symbol?: string) {
  const intents = detectIntents(q);
  if (!symbol) {
    const inferred = inferSymbolFromQuery(q);
    if (inferred) symbol = inferred;
  }
  let stats: ReturnType<typeof buildStats> | null = null;
  if (symbol && intents.wantStats) {
    try { stats = buildStats(symbol); } catch { stats = null; }
  }
  const parts: string[] = [];
  if (symbol) {
    const inferredTag = inferSymbolFromQuery(q) === symbol ? ' (inferred)' : '';
    const resolvedTag = (stats && (stats as any).raw?.usedSymbol && (stats as any).raw.usedSymbol !== symbol) ? ` (resolved→${(stats as any).raw.usedSymbol})` : '';
    parts.push(`Context symbol${inferredTag}${resolvedTag}: ${symbol}`);
  }
  parts.push(`Query: "${q}"`);
  const intentLabels = Object.entries(intents).filter(([k,v])=>v).map(([k])=>k.replace(/^want/,'').toLowerCase());
  if (intentLabels.length) parts.push(`Detected intents: ${intentLabels.join(', ')}`);
  if (stats && (stats as any).raw?.latest) {
    parts.push('--- Daily Statistics ---');
    parts.push(stats.summary);
  } else if (stats) {
    parts.push('No price data found for requested symbol (tried variants).');
  } else {
    parts.push('This is a placeholder agent response. (Enhance by integrating RAG + analytics services)');
  }
  return { answer: parts.join('\n'), intents, data: stats ? stats.raw : undefined };
}

// GET /api/agent?q=...&symbol=...
router.get('/agent', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json(ResponseUtils.error('missing_q'));
    const symbolRaw = String(req.query.symbol || '').trim();
    const symbol = symbolRaw ? symbolRaw.toUpperCase() : undefined;
    const result = buildAnswer(q, symbol);
    return res.json(ResponseUtils.success(result));
  } catch (err:any) {
    return res.status(500).json(ResponseUtils.internalError());
  }
});

// POST /api/agent/ask { prompt, symbol }
router.post('/agent/ask', (req, res) => {
  try {
    const q = String(req.body?.prompt || req.body?.q || '').trim();
    if (!q) return res.status(400).json(ResponseUtils.error('missing_prompt'));
    const symbolRaw = String(req.body?.symbol || '').trim();
    const symbol = symbolRaw ? symbolRaw.toUpperCase() : undefined;
    const result = buildAnswer(q, symbol);
    return res.json(ResponseUtils.success(result));
  } catch (err:any) {
    return res.status(500).json(ResponseUtils.internalError());
  }
});
