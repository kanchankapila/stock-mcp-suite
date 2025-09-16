import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { fetchJson } from '../utils/http.js';
import { resolveTicker } from '../utils/ticker.js';

export type McInsight = {
  scId: string;
  type: string; // usually 'c'
  shortDesc?: string;
  longDesc?: string;
  stockScore?: number;
  name?: string;
};

export async function fetchMcInsights(scId: string, type: string = 'c'): Promise<McInsight | null> {
  const id = scId.toUpperCase();
  const url = `https://api.moneycontrol.com//mcapi//v1//extdata//mc-insights?scId=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
  try {
    logger.info({ url }, 'mc_fetch_insights_start');
    const json: any = await fetchJson(url, { headers: { 'Accept': 'application/json,*/*' }, timeoutMs: 8000, retries: 2, retryDelayMs: 300 });
    logger.info({ url }, 'mc_fetch_insights_ok');
    const cls = json?.data?.classification || {};
    const out: McInsight = {
      scId: id,
      type,
      shortDesc: cls.shortDesc || '',
      longDesc: cls.longDesc || '',
      stockScore: Number(cls.stockScore ?? 0),
      name: cls.name || ''
    };
    return out;
  } catch (err) {
    logger.error({ err, scId: id }, 'moneycontrol_insights_failed');
    return null;
  }
}

// Convenience: accept any user input (name/symbol/yahoo like BEL.NS) and resolve to mcsymbol from stocklist.ts
export async function fetchMcInsightsForInput(input: string, type: string = 'c'): Promise<McInsight | null> {
  try {
    const base = String(input || '').toUpperCase();
    // Use resolver configured for provider 'mc' which defaults to stocklist mcsymbol
    const mcid = resolveTicker(base.includes('.') ? base.split('.')[0] : base, 'mc');
    if (!mcid) return null;
    return await fetchMcInsights(mcid, type);
  } catch (err) {
    logger.error({ err, input }, 'moneycontrol_resolve_or_fetch_failed');
    return null;
  }
}

// Moneycontrol Technical Indicator API
// Example: https://priceapi.moneycontrol.com//pricefeed//techindicator//D//BE03
export type McTech = {
  scId: string;
  freq: 'D'|'W'|'M';
  reqDate?: string;
  open?: number; high?: number; low?: number; close?: number; volume?: number;
  sentiments?: { indication?: string; totalBearish?: number; totalBullish?: number; totalNeutral?: number };
  indicators?: Array<{ id: string; displayName: string; value: any; indication?: string }>;
  pivotLevels?: Array<{ key: string; pivotLevel: { pivotPoint?: string; r1?: string; r2?: string; r3?: string; s1?: string; s2?: string; s3?: string } }>;
  sma?: Array<{ key: string; value: string; indication?: string }>;
  ema?: Array<{ key: string; value: string; indication?: string }>;
  crossover?: Array<{ key?: string; displayValue?: string; indication?: string; period?: string }>;
};

export async function fetchMcTech(scId: string, freq: 'D'|'W'|'M'='D'): Promise<McTech | null> {
  const id = scId.toUpperCase();
  const f = (String(freq || 'D').toUpperCase() as 'D'|'W'|'M');
  const url = `https://priceapi.moneycontrol.com//pricefeed//techindicator//${encodeURIComponent(f)}//${encodeURIComponent(id)}`;
  try {
    logger.info({ url }, 'mc_fetch_tech_start');
    const json: any = await fetchJson(url, { headers: { 'Accept': 'application/json,*/*' }, timeoutMs: 8000, retries: 2, retryDelayMs: 300 });
    logger.info({ url }, 'mc_fetch_tech_ok');
    const d = json?.data || {};
    const out: McTech = {
      scId: id,
      freq: f,
      reqDate: d.reqDate,
      open: Number(d.open ?? 0),
      high: Number(d.high ?? 0),
      low: Number(d.low ?? 0),
      close: Number(d.close ?? 0),
      volume: Number(d.volume ?? 0),
      sentiments: d?.sentiments ? {
        indication: d.sentiments.indication,
        totalBearish: Number(d.sentiments.totalBearish ?? 0),
        totalBullish: Number(d.sentiments.totalBullish ?? 0),
        totalNeutral: Number(d.sentiments.totalNeutral ?? 0),
      } : undefined,
      indicators: Array.isArray(d.indicators) ? d.indicators.map((x:any)=>({ id: String(x.id||''), displayName: String(x.displayName||''), value: x.value, indication: x.indication })) : [],
      pivotLevels: Array.isArray(d.pivotLevels) ? d.pivotLevels.map((p:any)=>({ key: String(p.key||''), pivotLevel: { pivotPoint: p.pivotLevel?.pivotPoint, r1: p.pivotLevel?.r1, r2: p.pivotLevel?.r2, r3: p.pivotLevel?.r3, s1: p.pivotLevel?.s1, s2: p.pivotLevel?.s2, s3: p.pivotLevel?.s3 } })) : [],
      sma: Array.isArray(d.sma) ? d.sma.map((s:any)=>({ key: String(s.key||''), value: String(s.value||''), indication: s.indication })) : [],
      ema: Array.isArray(d.ema) ? d.ema.map((s:any)=>({ key: String(s.key||''), value: String(s.value||''), indication: s.indication })) : [],
      crossover: Array.isArray(d.crossover) ? d.crossover.map((c:any)=>({ key: c.key, displayValue: c.displayValue, indication: c.indication, period: c.period })) : [],
    };
    return out;
  } catch (err) {
    logger.error({ err, scId: id, freq: f }, 'moneycontrol_tech_failed');
    return null;
  }
}

export async function fetchMcTechForInput(input: string, freq: 'D'|'W'|'M'='D'): Promise<McTech | null> {
  try {
    const base = String(input || '').toUpperCase();
    const mcid = resolveTicker(base.includes('.') ? base.split('.')[0] : base, 'mc');
    if (!mcid) return null;
    return await fetchMcTech(mcid, freq);
  } catch (err) {
    logger.error({ err, input, freq }, 'moneycontrol_tech_resolve_or_fetch_failed');
    return null;
  }
}

export type McQuote = {
  scId: string; price?: number; change?: number; changePct?: number; dayHigh?: number; dayLow?: number; prevClose?: number; volume?: number; value?: number; updatedAt?: string;
};

export type McFutures = { scId: string; expiry: string; lastPrice?: number; change?: number; changePct?: number; oi?: number; oiChangePct?: number; volume?: number; underlying?: number };
export type McOption = { scId: string; expiry: string; type: string; strike: number; lastPrice?: number; change?: number; changePct?: number; iv?: number; oi?: number; oiChangePct?: number; volume?: number };
export type McRatings = { scId: string; period: 'D'|'W'; duration: string; shortDesc?: string; longDesc?: string; rating?: string; score?: number };
export type McVwap = { scId: string; vwap?: number; date?: string };
export type McFinancialOverview = { scId: string; data?: any };
export type McEstimates = { scId: string; priceForecast?: any; consensus?: any; analystRating?: any; earningForecast?: any; valuation?: any; hitsMisses?: any };
export type McSeasonality = { month?: string; year?: string; items?: any[] };
export type McIndicesList = { indices?: any[] };

export type McExtended = {
  scId: string;
  quote?: McQuote | null;
  futures?: McFutures[];
  options?: McOption[];
  strikes?: number[];
  ratings?: McRatings[];
  vwap?: McVwap | null;
  techSummary?: any | null;
  movingAverage?: any | null;
  techIndicator?: any | null;
  maCrossovers?: any | null;
  pivotLevels?: any | null;
  financialOverview?: McFinancialOverview | null;
  estimates?: McEstimates | null;
  seasonality?: McSeasonality | null;
  indicesList?: McIndicesList | null;
};

// Global cache controls for extended (seasonality + indices list)
const MC_CACHE_ENABLED = String(process.env.MC_EXTENDED_GLOBAL_CACHE_ENABLED || 'true').toLowerCase() === 'true';
const MC_CACHE_TTL_MS = Number(process.env.MC_EXTENDED_GLOBAL_CACHE_TTL_MS || 60 * 60 * 1000); // 1h default
let _cachedSeasonality: { key:string; data: McSeasonality; ts:number } | null = null;
let _cachedIndices: { data: McIndicesList; ts:number } | null = null;

async function mcFetchJson(url: string, label: string, opts: { timeoutMs?: number } = {}): Promise<any|null> {
  try {
    logger.info({ url }, `${label}_start`);
    const json: any = await fetchJson(url, { headers: { 'Accept': 'application/json,*/*' }, timeoutMs: opts.timeoutMs ?? 8000, retries: 2, retryDelayMs: 300 });
    logger.info({ url }, `${label}_ok`);
    return json;
  } catch (err) {
    logger.debug({ url, err: (err as any)?.message }, `${label}_fail`);
    return null;
  }
}

export async function fetchMcQuote(scId: string): Promise<McQuote|null> {
  const id = scId.toUpperCase();
  const url = `https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/${encodeURIComponent(id)}`;
  const json = await mcFetchJson(url, 'mc_quote');
  const d = json?.data;
  if (!d) return null;
  return {
    scId: id,
    price: Number(d.price || d.lastprice || d.ltp || 0) || undefined,
    change: Number(d.change || d.pricechange || 0) || undefined,
    changePct: Number(d.pChange || d.pricepercentchange || 0) || undefined,
    dayHigh: Number(d.high || 0) || undefined,
    dayLow: Number(d.low || 0) || undefined,
    prevClose: Number(d.y_close || d.prevclose || 0) || undefined,
    volume: Number(d.total_volume || d.volume || 0) || undefined,
    value: Number(d.value || 0) || undefined,
    updatedAt: d.lastupd || d.lastupdate || undefined
  };
}

export async function fetchMcFutures(scId: string): Promise<McFutures[]> {
  const id = scId.toUpperCase();
  // First get expiries
  const expJson = await mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/fno/futures/getExpDts?id=${encodeURIComponent(id)}`, 'mc_fut_exps');
  const expiries: string[] = Array.isArray(expJson?.data) ? expJson.data.map((x:any)=> String(x.expirydate||x.expiryDate||'')).filter(Boolean) : [];
  const out: McFutures[] = [];
  for (const exp of expiries.slice(0,3)) { // limit to 3 expiries for now
    const futUrl = `https://api.moneycontrol.com/mcapi/v1/fno/futures/getFuturesData?fut=FUTSTK&id=${encodeURIComponent(id)}&expirydate=${encodeURIComponent(exp)}`;
    const fjson = await mcFetchJson(futUrl, 'mc_fut');
    const d = fjson?.data; if (!d) continue;
    out.push({ scId: id, expiry: exp, lastPrice: num(d?.lastPrice||d?.ltp), change: num(d?.ch||d?.change), changePct: num(d?.chp||d?.changePct), oi: num(d?.oi), oiChangePct: num(d?.oiChgPct||d?.oiChangePct), volume: num(d?.volume), underlying: num(d?.underlying) });
  }
  return out;
}

export async function fetchMcOptions(scId: string): Promise<{ options: McOption[]; strikes: number[] }> {
  const id = scId.toUpperCase();
  // Use nearest expiry from futures list if available
  const futs = await fetchMcFutures(id);
  const nearest = futs[0]?.expiry;
  const strikesUrl = nearest ? `https://api.moneycontrol.com/mcapi/v1/fno/options/getStrikePrice?id=${encodeURIComponent(id)}&expirydate=${encodeURIComponent(nearest)}&optiontype=CE` : '';
  const strikesJson = nearest ? await mcFetchJson(strikesUrl, 'mc_opt_strikes') : null;
  const strikes: number[] = Array.isArray(strikesJson?.data) ? strikesJson.data.map((s:any)=> num(s?.strikeprice || s)) .filter(n=> n!==null) as number[] : [];
  // Sample a subset of strikes around ATM (price from quote)
  let atm: number | null = null;
  try { const q = await fetchMcQuote(id); atm = q?.price ?? null; } catch {}
  const selected = atm ? pickClosest(strikes, atm, 5) : strikes.slice(0,5);
  const options: McOption[] = [];
  for (const strike of selected) {
    for (const typ of ['CE','PE']) {
      if (!nearest) continue;
      const optUrl = `https://api.moneycontrol.com/mcapi/v1/fno/options/getOptionsData?opt=OPTSTK&id=${encodeURIComponent(id)}&expirydate=${encodeURIComponent(nearest)}&optiontype=${typ}&strikeprice=${strike.toFixed(2)}`;
      const ojson = await mcFetchJson(optUrl, 'mc_option');
      const d = ojson?.data; if (!d) continue;
      options.push({ scId: id, expiry: nearest, type: typ, strike, lastPrice: num(d?.ltp||d?.lastPrice), change: num(d?.ch), changePct: num(d?.chp), iv: num(d?.iv), oi: num(d?.oi), oiChangePct: num(d?.oiChgPct), volume: num(d?.volume) });
    }
  }
  return { options, strikes };
}

export async function fetchMcRatings(scId: string): Promise<McRatings[]> {
  const id = scId.toUpperCase();
  const periods: ('D'|'W')[] = ['D','W'];
  const out: McRatings[] = [];
  for (const p of periods) {
    const url = `https://www.moneycontrol.com/mc/widget/historicalrating/ratingPro?classic=true&type=gson&sc_did=${encodeURIComponent(id)}&period=${p}&dur=6m`;
    const json = await mcFetchJson(url, 'mc_rating');
    const d = json?.data || json; // sometimes raw gson
    if (d) out.push({ scId: id, period: p, duration: '6m', shortDesc: d?.shortDesc||d?.summary, longDesc: d?.longDesc||d?.details, rating: d?.rating, score: num(d?.score) || undefined });
  }
  return out;
}

export async function fetchMcVwap(scId: string): Promise<McVwap|null> {
  const id = scId.toUpperCase();
  const url = `https://www.moneycontrol.com/stocks/company_info/get_vwap_chart_data.php?classic=true&sc_did=${encodeURIComponent(id)}`;
  const json = await mcFetchJson(url, 'mc_vwap');
  if (!json) return null;
  try {
    // API seems to return array or object; attempt to map
    const v = Array.isArray(json) ? json[json.length-1] : json?.data || json;
    return { scId: id, vwap: num(v?.vwap)||undefined, date: v?.date || v?.dt };
  } catch { return null; }
}

export async function fetchMcTechnicalWidgets(scId: string): Promise<{ summary:any; ma:any; indicators:any; crossovers:any; pivot:any }> {
  const id = scId.toUpperCase();
  const summary = await mcFetchJson(`https://www.moneycontrol.com/mc/widget/pricechart_technicals/technical_rating_summary?sc_did=${id}&page=mc_technicals&period=D&classic=true&period=W`, 'mc_tech_summary');
  const ma = await mcFetchJson(`https://www.moneycontrol.com/mc/widget/pricechart_technicals/moving_average?sc_did=${id}&page=mc_technicals&period=D&classic=true&period=W`, 'mc_tech_ma');
  const indicators = await mcFetchJson(`https://www.moneycontrol.com/mc/widget/pricechart_technicals/technical_indicator?sc_did=${id}&page=mc_technicals&period=D&classic=true&period=W`, 'mc_tech_ind');
  const crossovers = await mcFetchJson(`https://www.moneycontrol.com/mc/widget/pricechart_technicals/moving_average_crossovers?sc_did=${id}&page=mc_technicals&period=D&classic=true&period=W`, 'mc_tech_x');
  const pivot = await mcFetchJson(`https://www.moneycontrol.com/mc/widget/pricechart_technicals/pivot_level?sc_did=${id}&page=mc_technicals&classic=true&period=W`, 'mc_tech_pivot');
  return { summary, ma, indicators, crossovers, pivot };
}

export async function fetchMcFinancialOverview(scId: string): Promise<McFinancialOverview|null> {
  const id = scId.toUpperCase();
  const url = `https://api.moneycontrol.com/mcapi/v1/stock/financial-historical/overview?scId=${id}&ex=N`;
  const json = await mcFetchJson(url, 'mc_fin_overview');
  if (!json) return null; return { scId: id, data: json?.data || json };
}

export async function fetchMcEstimates(scId: string): Promise<McEstimates|null> {
  const id = scId.toUpperCase();
  const [pf, cons, ar, ef, val, hm] = await Promise.all([
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/price-forecast?scId=${id}&ex=N&deviceType=W`, 'mc_est_price_forecast'),
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/consensus?scId=${id}&ex=N&deviceType=W`, 'mc_est_consensus'),
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/analyst-rating?deviceType=W&scId=${id}&ex=N`, 'mc_est_analyst_rating'),
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/earning-forecast?scId=${id}&ex=N&deviceType=W&frequency=12&financialType=C`, 'mc_est_earning_forecast'),
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/valuation?deviceType=W&scId=${id}&ex=N&financialType=C`, 'mc_est_valuation'),
    mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/stock/estimates/hits-misses?deviceType=W&scId=${id}&ex=N&type=eps&financialType=C`, 'mc_est_hits_misses')
  ]);
  return { scId: id, priceForecast: pf?.data||pf, consensus: cons?.data||cons, analystRating: ar?.data||ar, earningForecast: ef?.data||ef, valuation: val?.data||val, hitsMisses: hm?.data||hm };
}

export async function fetchMcSeasonality(year: number, month: number): Promise<McSeasonality|null> {
  const url = `https://api.moneycontrol.com/mcapi/v1/market/seasonality-analysis/get-best-month-stocks?ex=N&id=7&month=${String(month).padStart(2,'0')}&year=${year}&tab=bus&limit=5`;
  const json = await mcFetchJson(url, 'mc_seasonality');
  if (!json) return null; return { month: String(month).padStart(2,'0'), year: String(year), items: json?.data || json };
}

export async function fetchMcIndicesList(): Promise<McIndicesList|null> {
  const json = await mcFetchJson(`https://api.moneycontrol.com/mcapi/v1/indices/get-indices-list?appVersion=136`, 'mc_indices');
  if (!json) return null; return { indices: json?.data || json };
}

export async function fetchMcExtended(scId: string): Promise<McExtended|null> {
  const id = scId.toUpperCase();
  const [quote, techWidgets, ratings, vwap, fin, estimates] = await Promise.all([
    fetchMcQuote(id),
    fetchMcTechnicalWidgets(id),
    fetchMcRatings(id),
    fetchMcVwap(id),
    fetchMcFinancialOverview(id),
    fetchMcEstimates(id)
  ]);
  const futs = await fetchMcFutures(id);
  const { options, strikes } = await fetchMcOptions(id);
  // Added: seasonality (current month) & indices list (global) – cached by env flags
  let seasonality: McSeasonality | null = null; let indicesList: McIndicesList | null = null;
  const now = new Date();
  const month = now.getMonth()+1; const year = now.getFullYear();
  const seasonKey = `${year}-${String(month).padStart(2,'0')}`;
  try {
    if (MC_CACHE_ENABLED && _cachedSeasonality && _cachedSeasonality.key === seasonKey && (Date.now()-_cachedSeasonality.ts) < MC_CACHE_TTL_MS) {
      seasonality = _cachedSeasonality.data;
    } else {
      seasonality = await fetchMcSeasonality(year, month);
      if (seasonality && MC_CACHE_ENABLED) _cachedSeasonality = { key: seasonKey, data: seasonality, ts: Date.now() };
    }
  } catch {}
  try {
    if (MC_CACHE_ENABLED && _cachedIndices && (Date.now()-_cachedIndices.ts) < MC_CACHE_TTL_MS) {
      indicesList = _cachedIndices.data;
    } else {
      indicesList = await fetchMcIndicesList();
      if (indicesList && MC_CACHE_ENABLED) _cachedIndices = { data: indicesList, ts: Date.now() };
    }
  } catch {}
  return {
    scId: id,
    quote,
    futures: futs,
    options,
    strikes,
    ratings,
    vwap,
    techSummary: techWidgets.summary,
    movingAverage: techWidgets.ma,
    techIndicator: techWidgets.indicators,
    maCrossovers: techWidgets.crossovers,
    pivotLevels: techWidgets.pivot,
    financialOverview: fin,
    estimates,
    seasonality,
    indicesList
  };
}

export function buildMcDocs(symbol: string, ext: McExtended): { text:string; metadata:any }[] {
  const docs: { text:string; metadata:any }[] = [];
  if (ext.quote) {
    const q = ext.quote;
    docs.push({ text: `Moneycontrol Quote for ${symbol}: price ${q.price} change ${q.change} (${q.changePct}%) high ${q.dayHigh} low ${q.dayLow} volume ${q.volume}.`, metadata: { section: 'quote', source: 'moneycontrol' } });
  }
  if (ext.futures && ext.futures.length) {
    const lines = ext.futures.map(f=> `Exp ${f.expiry}: ${f.lastPrice} ch ${f.change}(${f.changePct}%) OI ${f.oi} OI% ${f.oiChangePct}`).join('\n');
    docs.push({ text: `Moneycontrol Futures Snapshot for ${symbol}:\n${lines}`, metadata: { section:'futures', source:'moneycontrol' } });
  }
  if (ext.options && ext.options.length) {
    const firstFew = ext.options.slice(0,8).map(o=> `${o.type}${o.strike}@${o.lastPrice} ch ${o.change} OI ${o.oi}`).join(', ');
    docs.push({ text: `Moneycontrol Options (sample) for ${symbol} (nearest expiry): ${firstFew}`, metadata: { section:'options', source:'moneycontrol' } });
  }
  if (ext.ratings && ext.ratings.length) {
    for (const r of ext.ratings) {
      docs.push({ text: `Moneycontrol Rating ${r.period} ${r.duration} for ${symbol}: ${r.shortDesc||''} ${r.longDesc||''}`.trim(), metadata: { section:'rating', period:r.period, source:'moneycontrol' } });
    }
  }
  if (ext.estimates) {
    const e = ext.estimates;
    const pf = e.priceForecast?.data || e.priceForecast;
    const tgt = pf?.priceTarget || pf?.avgPriceTarget || pf?.average;
    docs.push({ text: `Moneycontrol Estimates for ${symbol}: price target ${tgt}; consensus ${(JSON.stringify(e.consensus?.summary || e.consensus?.data || e.consensus)||'').slice(0,400)}`, metadata: { section:'estimates', source:'moneycontrol' } });
  }
  if (ext.financialOverview?.data) {
    docs.push({ text: `Moneycontrol Financial Overview for ${symbol}: ${JSON.stringify(ext.financialOverview.data).slice(0,800)}`, metadata: { section:'financial_overview', source:'moneycontrol' } });
  }
  // Added: seasonality summary
  if (ext.seasonality?.items && ext.seasonality.items.length) {
    const top = ext.seasonality.items.slice(0,5).map((it:any)=> {
      const name = it?.company || it?.name || it?.symbol || '';
      const perf = it?.returns || it?.avgReturn || it?.performance || '';
      return `${name}:${perf}`; }).join(', ');
    docs.push({ text: `Moneycontrol Seasonality (month ${ext.seasonality.month}/${ext.seasonality.year}) sample: ${top}`, metadata: { section:'seasonality', source:'moneycontrol', month: ext.seasonality.month, year: ext.seasonality.year } });
  }
  // Added: indices list summary (global) – include a few index names
  if (ext.indicesList?.indices && Array.isArray(ext.indicesList.indices) && ext.indicesList.indices.length) {
    const idxSample = ext.indicesList.indices.slice(0,8).map((i:any)=> i?.name || i?.indexName || i?.symbol).filter(Boolean).join(', ');
    docs.push({ text: `Moneycontrol Indices List sample: ${idxSample}`, metadata: { section:'indices_list', source:'moneycontrol' } });
  }
  return docs;
}

function num(v:any): number|undefined|null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function pickClosest(arr:number[], target:number, count:number): number[] {
  return arr.map(s=> ({ s, d: Math.abs(s-target) })).sort((a,b)=> a.d-b.d).slice(0,count).map(x=>x.s);
}
