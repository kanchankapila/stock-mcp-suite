import db from '../db.js';
import { listPrices, listNews, latestFeature, listOptionsMetrics } from '../db.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';
import { retrieve } from '../rag/langchain.js';

export interface AgentIntents { wantSentiment: boolean; wantPrediction: boolean; wantBacktest: boolean; wantTopPicks: boolean; wantStats: boolean; }
export interface AgentStatsRaw {
  usedSymbol: string;
  latest: any;
  previous: any;
  change: number | null;
  changePct: number | null;
  ret5: number | null;
  ret20: number | null;
  avgVol20: number | null;
  sentiment: number | null;
  options: any;
  rsi: number | null;
  prediction: number | null;
  predictionChange: number | null;
  predictionPct: number | null;
}

// ------------ Intent + symbol inference helpers -------------
export function detectIntents(q: string): AgentIntents {
  const wantSentiment = /sentiment|feel|mood/i.test(q);
  const wantPrediction = /predict|forecast|target|price target/i.test(q);
  const wantBacktest = /backtest|strategy test/i.test(q);
  const wantTopPicks = /top picks|top\s+stocks|recommend/i.test(q);
  const wantStats = /stat|today|latest|performance|price|move|summary/i.test(q);
  return { wantSentiment, wantPrediction, wantBacktest, wantTopPicks, wantStats };
}

let _symbolCache: string[] | null = null;
function loadSymbolCache() {
  try {
    const rows = db.prepare(`SELECT DISTINCT symbol FROM prices LIMIT 15000`).all() as Array<{symbol:string}>;
    _symbolCache = rows.map(r=>String(r.symbol));
  } catch { _symbolCache = []; }
}
function fuzzyMatchSymbol(token: string): string | undefined {
  if (!_symbolCache) loadSymbolCache();
  if (!_symbolCache) return undefined;
  const up = token.toUpperCase();
  // Exact then variants
  return _symbolCache.find(s => s.toUpperCase() === up)
    || _symbolCache.find(s => s.toUpperCase().startsWith(up + '.'))
    || _symbolCache.find(s => s.toUpperCase().startsWith(up))
    || _symbolCache.find(s => s.toUpperCase().includes(up));
}

export function inferSymbolFromQuery(q: string): string | undefined {
  try {
    const explicit = /(for|about|on|regarding|of)\s+([A-Za-z]{2,10})(?:\b|$)/gi;
    let m: RegExpExecArray | null; const explicitCandidates: string[] = [];
    while ((m = explicit.exec(q)) !== null) { explicitCandidates.push(m[2]); }
    const stop = new Set(['FOR','AND','THE','OF','ON','TO','WITH','TODAY','TODAYS','PROVIDE','GIVE','SHOW','LATEST','STATISTICS','STATS','PRICE','PERFORMANCE','PLEASE','CURRENT']);
    function scoreToken(tok: string): string | undefined {
      const up = tok.toUpperCase(); if (stop.has(up)) return undefined; if (up.length < 2 || up.length > 8) return undefined;
      const row = db.prepare('SELECT 1 FROM prices WHERE symbol=? LIMIT 1').get(up);
      if (row) return up;
      return fuzzyMatchSymbol(up);
    }
    for (const tok of explicitCandidates.slice().reverse()) { const hit = scoreToken(tok); if (hit) return hit; }
    const tokens = (q.toUpperCase().match(/[A-Z]{2,10}/g) || []).filter(t => !stop.has(t));
    for (const tok of tokens.slice().reverse()) { const hit = scoreToken(tok); if (hit) return hit; }
  } catch {}
  return undefined;
}

// ------------ Formatting helpers -------------
function formatPct(v: number | null | undefined) { return (v === null || v === undefined || !Number.isFinite(v)) ? 'n/a' : `${(v*100).toFixed(2)}%`; }
function formatNum(v: number | null | undefined, d=2) { return (v === null || v === undefined || !Number.isFinite(v)) ? 'n/a' : v.toFixed(d); }
function classifySentiment(s: number | null | undefined) {
  if (s === null || s === undefined || !Number.isFinite(s)) return 'n/a';
  if (s > 0.15) return 'positive';
  if (s < -0.15) return 'negative';
  return 'neutral';
}

// ------------ Price + analytics stats (with cache) -------------
interface CacheEntry { date: string; stats: { summary: string; raw: AgentStatsRaw }; }
const statsCache = new Map<string, CacheEntry>();

function getPricesForSymbol(base: string) {
  const tried: string[] = [];
  function tryList(sym: string) { tried.push(sym); return listPrices(sym, 260) as Array<{date:string; close:number; volume:number}>; }
  let prices = tryList(base);
  let resolved = base;
  if (!prices.length && base.includes('.')) {
    const root = base.split('.')[0];
    prices = tryList(root); if (prices.length) resolved = root;
  }
  const altSuffixes = ['.NS', '.NSE', '.BSE'];
  if (!prices.length && !base.includes('.')) {
    for (const suf of altSuffixes) { const sym = base + suf; prices = tryList(sym); if (prices.length) { resolved = sym; break; } }
  }
  if (!prices.length) {
    const fm = fuzzyMatchSymbol(base); if (fm) { prices = tryList(fm); if (prices.length) resolved = fm; }
  }
  return { prices, resolvedSymbol: resolved, attempted: tried };
}

export function buildStats(symbol: string) {
  const { prices, resolvedSymbol } = getPricesForSymbol(symbol);
  if (!prices.length) return { summary: 'No price data available.', raw: { usedSymbol: resolvedSymbol } } as any;
  const last = prices[prices.length-1];
  const prev = prices.length>1 ? prices[prices.length-2] : last;
  const change = last.close - prev.close;
  const changePct = prev.close ? change / prev.close : 0;
  function ret(days: number) { if (prices.length <= days) return null; const past = prices[prices.length-1 - days]; return past.close ? (last.close / past.close - 1) : null; }
  const ret5 = ret(5); const ret20 = ret(20);
  const volumes = prices.slice(-20).map(p=>p.volume).filter(v=>Number.isFinite(v));
  const avgVol20 = volumes.length ? volumes.reduce((a,b)=>a+b,0)/volumes.length : null;
  const news = listNews(resolvedSymbol, 15) as Array<{title:string; summary:string; sentiment:number}>;
  const sent = news.length ? sentimentScore(news.map(n=>`${n.title}. ${n.summary}`)) : null;
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
  summaryLines.push(`News Sentiment: ${sent !== null ? sent.toFixed(3) : 'n/a'} (${classifySentiment(sent)}) from ${news.length} articles`);
  if (optLatest) summaryLines.push(`Options PCR: ${formatNum(optLatest.pcr)} • PVR: ${formatNum(optLatest.pvr)} • Bias: ${formatNum(optLatest.bias)}`);
  if (featRsi) summaryLines.push(`RSI (${featRsi.date}): ${featRsi.rsi !== null ? featRsi.rsi.toFixed(2) : 'n/a'}`);
  if (prediction !== null) summaryLines.push(`Next Close Pred: ${prediction.toFixed(2)} (${predDiff!==null? (predDiff>=0?'+':'-')+Math.abs(predDiff).toFixed(2):'n/a'}, ${formatPct(predPct)})`);
  const raw: AgentStatsRaw = { usedSymbol: resolvedSymbol, latest: last, previous: prev, change, changePct, ret5, ret20, avgVol20, sentiment: sent, options: optLatest, rsi: featRsi?.rsi ?? null, prediction, predictionChange: predDiff, predictionPct: predPct };
  return { summary: summaryLines.join('\n'), raw };
}

function cacheKey(symbol: string, date: string) { return `${symbol}::${date}`; }

function getCachedStats(symbol: string): { summary: string; raw: AgentStatsRaw } | null {
  try {
    const { prices } = getPricesForSymbol(symbol);
    if (!prices.length) return null;
    const lastDate = prices[prices.length-1].date;
    const key = cacheKey(symbol, lastDate);
    const hit = statsCache.get(key);
    if (hit) return hit.stats as any;
    const s = buildStats(symbol);
    statsCache.set(key, { date: lastDate, stats: s as any });
    return s as any;
  } catch { return null; }
}

export interface AgentAnswerResult { answer: string; intents: AgentIntents; data?: AgentStatsRaw & { docs?: Array<{ excerpt: string; date?: string|null; source?: string|null; score?: number }> }; }

export async function buildAnswer(question: string, symbol?: string): Promise<AgentAnswerResult> {
  const intents = detectIntents(question);
  if (!symbol) { const inferred = inferSymbolFromQuery(question); if (inferred) symbol = inferred; }
  let stats: { summary: string; raw: AgentStatsRaw } | null = null;
  if (symbol && intents.wantStats) { stats = getCachedStats(symbol) || null; }
  // RAG retrieval (namespace = symbol). Guardrails: limit chars per doc & total.
  let docsSummary: string[] = [];
  const docMeta: Array<{ excerpt: string; date?: string|null; source?: string|null; score?: number }> = [];
  if (symbol) {
    try {
      const docs = await retrieve(symbol, question, 6).catch(()=>[]);
      let totalChars = 0;
      for (const d of docs) {
        const meta: any = d.metadata || {};
        const raw = String(d.pageContent||'');
        if (!raw) continue;
        const excerpt = raw.slice(0, 400).replace(/\s+/g,' ').trim();
        if (docMeta.some(x => x.excerpt === excerpt)) continue; // dedupe
        if (totalChars + excerpt.length > 1600) break; // global guardrail
        totalChars += excerpt.length;
        docsSummary.push(excerpt);
        docMeta.push({ excerpt, date: meta.date || null, source: meta.source || null, score: meta._score });
      }
    } catch {}
  }
  const parts: string[] = [];
  if (symbol) parts.push(`Symbol: ${symbol}${stats ? (stats.raw.usedSymbol!==symbol?` (resolved→${stats.raw.usedSymbol})`: '') : ''}`);
  parts.push(`Query: ${question}`);
  const intentLabels = Object.entries(intents).filter(([_,v])=>v).map(([k])=>k.replace(/^want/,'').toLowerCase());
  if (intentLabels.length) parts.push(`Intents: ${intentLabels.join(', ')}`);
  if (stats) { parts.push('--- Stats ---'); parts.push(stats.summary); }
  if (docsSummary.length) { parts.push('--- RAG Context ---'); parts.push(docsSummary.join('\n\n')); }
  if (!stats && !docsSummary.length) parts.push('(No stats or context available)');
  return { answer: parts.join('\n'), intents, data: stats ? { ...stats.raw, docs: docMeta } : (symbol ? { usedSymbol: symbol, docs: docMeta } as any : undefined) };
}
