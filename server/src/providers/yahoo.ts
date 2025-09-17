// Yahoo Finance provider implementation using yahoo-finance2 only (v3 class removed)
// Provides: fetchYahooQuotesBatch, fetchYahooDaily, parseYahooDaily, fetchYahooOptions, parseYahooOptions

import yahooFinance from 'yahoo-finance2';
import { logger } from '../utils/logger.js';

// Simplified: use the default exported function object directly
let yf: any = (yahooFinance as any);

type QuoteRow = { symbol: string; time: number; price: number };

// Basic in-memory throttle to avoid hammering API when large batches configured
let lastQuoteBatchAt = 0;
const MIN_BATCH_INTERVAL_MS = 750; // soft throttle between multi-symbol quote batches

export async function fetchYahooQuotesBatch(symbols: string[]): Promise<QuoteRow[]> {
  const uniq = Array.from(new Set(symbols.filter(s => !!s)));
  if (!uniq.length) return [];
  const now = Date.now();
  const wait = lastQuoteBatchAt + MIN_BATCH_INTERVAL_MS - now;
  if (wait > 0) { await new Promise(r => setTimeout(r, wait)); }
  lastQuoteBatchAt = Date.now();

  // yahoo-finance2 supports passing array to quote
  const out: QuoteRow[] = [];
  try {
    const quotes: any[] = await yf.quote(uniq as any);
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    for (const q of arr) {
      if (!q || !q.symbol) continue;
      const price = [q.regularMarketPrice, q.postMarketPrice, q.preMarketPrice, q.previousClose]
        .map((v: any) => Number(v))
        .find(v => Number.isFinite(v));
      if (!Number.isFinite(price)) continue;
      const epochSec = Number(q.regularMarketTime || q.postMarketTime || q.preMarketTime || q.firstTradeDateEpochUtc || 0);
      const timeMs = epochSec > 1_000_000_000 ? epochSec * 1000 : Date.now();
      out.push({ symbol: String(q.symbol).toUpperCase(), time: timeMs, price });
    }
  } catch (err: any) {
    logger.error({ err, symbols: uniq.join(',') }, 'yahoo_quote_batch_failed');
    throw err;
  }
  return out;
}

// Fetch chart data for given symbol, range, interval.
// range examples used in codebase: '1d','1y'. interval examples: '30m','1d'.
export async function fetchYahooDaily(symbol: string, range: string, interval: string): Promise<any> {
  const cleanRange = range || '1y';
  const cleanInterval = interval || '1d';
  try {
    const result = await yf.chart(symbol, { range: cleanRange as any, interval: cleanInterval as any });
    return result; // shape: { meta, timestamp[], indicators:{ quote:[{open,high,low,close,volume}] } }
  } catch (err: any) {
    logger.error({ err, symbol, range: cleanRange, interval: cleanInterval }, 'yahoo_chart_failed');
    throw err;
  }
}

export function parseYahooDaily(symbol: string, chart: any): Array<{ symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number }> {
  try {
    if (!chart) return [];
    // yahoo-finance2 returns object; but legacy code expected chart.chart.result[0]
    let ts: number[] = [];
    let quote: any = null;
    if (Array.isArray(chart?.timestamp) && chart?.indicators?.quote?.[0]) {
      ts = chart.timestamp as number[];
      quote = chart.indicators.quote[0];
    } else if (Array.isArray(chart?.chart?.result)) {
      const r0 = chart.chart.result[0];
      ts = r0?.timestamp || [];
      quote = r0?.indicators?.quote?.[0] || null;
    }
    if (!ts.length || !quote) return [];
    const opens: any[] = quote.open || [];
    const highs: any[] = quote.high || [];
    const lows: any[] = quote.low || [];
    const closes: any[] = quote.close || [];
    const vols: any[] = quote.volume || [];
    const rows: Array<{ symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
    for (let i = 0; i < ts.length; i++) {
      const epoch = Number(ts[i]);
      if (!Number.isFinite(epoch)) continue;
      const date = new Date(epoch * 1000).toISOString().slice(0, 10);
      const open = Number(opens[i]);
      const high = Number(highs[i]);
      const low = Number(lows[i]);
      const close = Number(closes[i]);
      const volume = Number(vols[i]);
      if (![open, high, low, close].every(n => Number.isFinite(n))) continue;
      rows.push({ symbol: symbol.toUpperCase(), date, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
    }
    // Deduplicate keeping last per date
    const map = new Map<string, typeof rows[0]>();
    for (const r of rows) map.set(r.date, r);
    return Array.from(map.values()).sort((a, b) => a.date < b.date ? -1 : 1);
  } catch (err) {
    logger.error({ err, symbol }, 'yahoo_parse_daily_failed');
    return [];
  }
}

// Fetch full options chain (all expirations) or a specific expiration date (YYYY-MM-DD) if supplied in opts.date
export async function fetchYahooOptions(symbol: string, opts: { date?: string; region?: string } = {}): Promise<any> {
  const sym = symbol.toUpperCase();
  const region = opts.region || 'US';
  const req: any = { region };
  if (opts.date) {
    try { req.date = new Date(opts.date + 'T00:00:00Z'); } catch {}
  }
  // Support both .options and (older) .optionChain
  try {
    if (typeof yf.options === 'function') return await yf.options(sym, req);
    if (typeof yf.optionChain === 'function') return await yf.optionChain(sym, req);
    throw new Error('options API not available on selected yahoo client');
  } catch (err) {
    logger.error({ err, symbol: sym }, 'yahoo_options_failed');
    throw err;
  }
}

// Parse options chain into a lightweight summary: per expiration ATM call/put + counts
export function parseYahooOptions(chain: any): Array<{ expiration: string; calls: number; puts: number; atmCall?: any; atmPut?: any }> {
  try {
    if (!chain) return [];
    const price = Number(chain?.quote?.regularMarketPrice ?? chain?.quote?.postMarketPrice ?? chain?.quote?.preMarketPrice);
    const sets: any[] = Array.isArray(chain?.options) ? chain.options : [];
    const out: Array<{ expiration: string; calls: number; puts: number; atmCall?: any; atmPut?: any }> = [];
    for (const s of sets) {
      const exp = s?.expirationDate ? new Date(Number(s.expirationDate)*1000).toISOString().slice(0,10) : 'NA';
      const calls: any[] = Array.isArray(s?.calls) ? s.calls : [];
      const puts: any[] = Array.isArray(s?.puts) ? s.puts : [];
      let atmCall: any; let atmPut: any;
      if (Number.isFinite(price)) {
        let bestDiff = Infinity;
        for (const c of calls) { const d = Math.abs(Number(c.strike) - price); if (d < bestDiff) { bestDiff = d; atmCall = c; } }
        bestDiff = Infinity;
        for (const p of puts) { const d = Math.abs(Number(p.strike) - price); if (d < bestDiff) { bestDiff = d; atmPut = p; } }
      }
      out.push({ expiration: exp, calls: calls.length, puts: puts.length,
        atmCall: atmCall ? { strike: atmCall.strike, last: atmCall.lastPrice, iv: atmCall.impliedVolatility, oi: atmCall.openInterest, vol: atmCall.volume, delta: atmCall.delta } : undefined,
        atmPut: atmPut ? { strike: atmPut.strike, last: atmPut.lastPrice, iv: atmPut.impliedVolatility, oi: atmPut.openInterest, vol: atmPut.volume, delta: atmPut.delta } : undefined
      });
    }
    return out;
  } catch (err) {
    logger.error({ err }, 'yahoo_parse_options_failed');
    return [];
  }
}


