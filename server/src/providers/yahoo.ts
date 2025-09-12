import fetch from 'node-fetch';
import yahooFinance from 'yahoo-finance2';
import { logger } from '../utils/logger.js';
// Removed unused import fetchWithRetry
import { recordFetchMetric } from '../utils/metrics.js';

const Y_BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const Y_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com'
};

// Added explicit union types for stronger typing and to satisfy yahoo-finance2 overloads
export type YahooInterval = '1m'|'2m'|'5m'|'15m'|'30m'|'60m'|'90m'|'1h'|'1d'|'5d'|'1wk'|'1mo'|'3mo';
const VALID_INTERVALS: YahooInterval[] = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'];

export type QuoteSummaryModule =
  | 'assetProfile' | 'balanceSheetHistory' | 'balanceSheetHistoryQuarterly'
  | 'calendarEvents' | 'cashflowStatementHistory' | 'cashflowStatementHistoryQuarterly'
  | 'defaultKeyStatistics' | 'earnings' | 'earningsHistory' | 'earningsTrend'
  | 'financialData' | 'fundOwnership' | 'fundPerformance' | 'fundProfile'
  | 'incomeStatementHistory' | 'incomeStatementHistoryQuarterly' | 'indexTrend'
  | 'industryTrend' | 'insiderHolders' | 'insiderTransactions' | 'institutionOwnership'
  | 'majorDirectHolders' | 'majorHoldersBreakdown' | 'netSharePurchaseActivity'
  | 'price' | 'quoteType' | 'recommendationTrend' | 'secFilings' | 'sectorTrend'
  | 'summaryDetail' | 'summaryProfile' | 'topHoldings' | 'upgradeDowngradeHistory';

const DEFAULT_QUOTE_MODULES: QuoteSummaryModule[] = ['price','summaryDetail','assetProfile','financialData','defaultKeyStatistics'];
const ALLOWED_QUOTE_MODULES: Set<QuoteSummaryModule> = new Set([
  'assetProfile','balanceSheetHistory','balanceSheetHistoryQuarterly','calendarEvents','cashflowStatementHistory','cashflowStatementHistoryQuarterly','defaultKeyStatistics','earnings','earningsHistory','earningsTrend','financialData','fundOwnership','fundPerformance','fundProfile','incomeStatementHistory','incomeStatementHistoryQuarterly','indexTrend','industryTrend','insiderHolders','insiderTransactions','institutionOwnership','majorDirectHolders','majorHoldersBreakdown','netSharePurchaseActivity','price','quoteType','recommendationTrend','secFilings','sectorTrend','summaryDetail','summaryProfile','topHoldings','upgradeDowngradeHistory'
]);

const RANGE_OFFSETS: Record<string, number> = {
  '1d': 1, '5d': 5, '1wk': 7, '1mo': 30, '3mo': 90, '6mo': 182, '1y': 365, '2y': 730, '5y': 1825, '10y': 3650
};
function computePeriod1(range: string): Date {
  if (range === 'max') return new Date(0);
  if (range === 'ytd') { const d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0); return d; }
  const days = RANGE_OFFSETS[range] ?? 365; // default 1y
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function fetchWithFallback(path: string) {
  let lastErr: any;
  for (const base of Y_BASES) {
    const url = `${base}${path}`;
    try {
      logger.info({ url }, 'yahoo_fetch_start');
      const res = await fetch(url, { headers: Y_HEADERS });
      if (res.ok) { logger.info({ url, status: res.status }, 'yahoo_fetch_ok'); return res; }
      // If unauthorized/forbidden, try next base
      if (res.status === 401 || res.status === 403) {
        lastErr = new Error(`Yahoo error: ${res.status}`);
        logger.warn({ url, status: res.status }, 'yahoo_fetch_unauthorized');
        continue;
      }
      // other errors: throw immediately
      logger.error({ url, status: res.status }, 'yahoo_fetch_failed');
      throw new Error(`Yahoo error: ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Yahoo request failed');
}

// New implementation using yahoo-finance2 with graceful fallback to legacy HTTP calls
export async function fetchYahooDaily(symbol: string, range: string = '1y', interval: YahooInterval = '1d') {
  try {
    const iv: YahooInterval = VALID_INTERVALS.includes(interval) ? interval : '1d';
    const period1 = computePeriod1(range);
    const period2 = new Date();
    const chart = await yahooFinance.chart(symbol, { interval: iv, period1, period2 });
    if (!chart || !Array.isArray((chart as any).quotes) || (chart as any).quotes.length === 0) throw new Error('Empty chart');
    const quotes: any[] = (chart as any).quotes;
    recordFetchMetric('yahoo', 'ok', 0);
    return { timestamp: quotes.map((q:any)=> Math.floor(new Date(q.date).getTime()/1000)), indicators: { quote: [{ open: quotes.map((q:any)=>q.open), high: quotes.map((q:any)=>q.high), low: quotes.map((q:any)=>q.low), close: quotes.map((q:any)=>q.close), volume: quotes.map((q:any)=>q.volume) }] } };
  } catch (err) {
    // Fallback to legacy endpoint fetch if library call fails
    try {
      const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
      const res = await fetchWithFallback(path);
      if (!res.ok) throw new Error(`Yahoo chart error: ${res.status}`);
      const json: any = await res.json();
      if (!json?.chart?.result?.[0]) {
        const e = json?.chart?.error?.description || 'No result';
        throw new Error(`Yahoo chart error: ${e}`);
      }
      recordFetchMetric('yahoo', 'retry', 0); // treat fallback success as retry metric
      return json.chart.result[0];
    } catch (e) {
      recordFetchMetric('yahoo', 'error', 0);
      throw e;
    }
  }
}

export function parseYahooDaily(symbol: string, chartResult: any) {
  const ts: number[] = chartResult.timestamp || [];
  const ind = chartResult.indicators?.quote?.[0] || {};
  const opens: number[] = ind.open || [];
  const highs: number[] = ind.high || [];
  const lows: number[] = ind.low || [];
  const closes: number[] = ind.close || [];
  const volumes: number[] = ind.volume || [];
  const rows = ts.map((t, i) => {
    const date = new Date(t * 1000).toISOString().slice(0, 10);
    return {
      symbol,
      date,
      open: Number(opens[i] ?? closes[i] ?? 0),
      high: Number(highs[i] ?? closes[i] ?? 0),
      low: Number(lows[i] ?? closes[i] ?? 0),
      close: Number(closes[i] ?? 0),
      volume: Number(volumes[i] ?? 0)
    };
  }).filter(r => Number.isFinite(r.close) && r.close > 0);
  return rows;
}

export async function fetchYahooQuote(symbol: string) {
  try {
    const q: any = await yahooFinance.quote(symbol);
    if (!q || q.regularMarketPrice == null) throw new Error('No quote');
    recordFetchMetric('yahoo', 'ok', 0);
    return { symbol: q.symbol, price: Number(q.regularMarketPrice), time: new Date((q.regularMarketTime || Math.floor(Date.now()/1000))*1000).toISOString() };
  } catch (err) {
    // Fallback original batch method
    const res = await fetchYahooQuotesBatch([symbol]);
    if (!res.length) throw err;
    recordFetchMetric('yahoo', 'retry', 0);
    return res[0];
  }
}

export async function fetchYahooQuotesBatch(symbols: string[]) {
  const uniq = Array.from(new Set(symbols.map(s => s.toUpperCase()).filter(Boolean)));
  if (!uniq.length) return [] as Array<{symbol:string, price:number, time:string}>;
  try {
    const quotes: any[] = await yahooFinance.quote(uniq as any);
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const out = arr.map((q: any) => ({ symbol: q.symbol, price: Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0), time: new Date((q.regularMarketTime || Math.floor(Date.now()/1000))*1000).toISOString() })).filter(x=> Number.isFinite(x.price) && x.price>0);
    recordFetchMetric('yahoo', 'ok', 0);
    return out;
  } catch (err) {
    try {
      const res = await fetchWithFallback(`/v7/finance/quote?symbols=${encodeURIComponent(uniq.join(','))}`);
      const json: any = await res.json();
      const arr: any[] = json?.quoteResponse?.result || [];
      recordFetchMetric('yahoo', 'retry', 0);
      return arr.map((q: any) => ({
        symbol: q.symbol,
        price: Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0),
        time: new Date((q.regularMarketTime || Math.floor(Date.now()/1000)) * 1000).toISOString()
      })).filter((x: any) => Number.isFinite(x.price) && x.price > 0);
    } catch (e) {
      recordFetchMetric('yahoo', 'error', 0);
      throw e;
    }
  }
}

export async function fetchYahooQuoteSummary(symbol: string, modules: string[] = DEFAULT_QUOTE_MODULES) {
  try {
    const filtered: QuoteSummaryModule[] = (modules.length? modules: DEFAULT_QUOTE_MODULES)
      .filter((m): m is QuoteSummaryModule => ALLOWED_QUOTE_MODULES.has(m as QuoteSummaryModule));
    const useModules = (filtered.length ? filtered : DEFAULT_QUOTE_MODULES);
    const res = await yahooFinance.quoteSummary(symbol, { modules: useModules });
    recordFetchMetric('yahoo', 'ok', 0);
    return res || {};
  } catch (err) {
    try {
      const m = encodeURIComponent((modules && modules.length? modules: DEFAULT_QUOTE_MODULES).join(','));
      const path = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${m}`;
      const legacy = await fetchWithFallback(path);
      if (!legacy.ok) throw new Error(`Yahoo quoteSummary error: ${legacy.status}`);
      const json: any = await legacy.json();
      recordFetchMetric('yahoo', 'retry', 0);
      return json?.quoteSummary || json;
    } catch (e) {
      recordFetchMetric('yahoo', 'error', 0);
      throw e;
    }
  }
}
