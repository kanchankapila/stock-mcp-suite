import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const Y_BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const Y_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com'
};

async function fetchWithFallback(path: string) {
  let lastErr: any;
  for (const base of Y_BASES) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, { headers: Y_HEADERS });
      if (res.ok) return res;
      // If unauthorized/forbidden, try next base
      if (res.status === 401 || res.status === 403) {
        lastErr = new Error(`Yahoo error: ${res.status}`);
        continue;
      }
      // other errors: throw immediately
      throw new Error(`Yahoo error: ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Yahoo request failed');
}

export async function fetchYahooDaily(symbol: string, range: string = '1y', interval: string = '1d') {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  logger.info({ symbol, range, interval }, 'yahoo_fetch_chart');
  const res = await fetchWithFallback(path);
  if (!res.ok) throw new Error(`Yahoo chart error: ${res.status}`);
  const json: any = await res.json();
  if (!json?.chart?.result?.[0]) {
    const err = json?.chart?.error?.description || 'No result';
    throw new Error(`Yahoo chart error: ${err}`);
  }
  return json.chart.result[0];
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
  const res = await fetchYahooQuotesBatch([symbol]);
  if (!res.length) throw new Error('Yahoo quote missing result');
  return res[0];
}

export async function fetchYahooQuotesBatch(symbols: string[]) {
  const uniq = Array.from(new Set(symbols.map(s => s.toUpperCase()).filter(Boolean)));
  if (!uniq.length) return [] as Array<{symbol:string, price:number, time:string}>;
  const res = await fetchWithFallback(`/v7/finance/quote?symbols=${encodeURIComponent(uniq.join(','))}`);
  const json: any = await res.json();
  const arr: any[] = json?.quoteResponse?.result || [];
  return arr.map((q: any) => ({
    symbol: q.symbol,
    price: Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0),
    time: new Date((q.regularMarketTime || Math.floor(Date.now()/1000)) * 1000).toISOString()
  })).filter((x: any) => Number.isFinite(x.price) && x.price > 0);
}
