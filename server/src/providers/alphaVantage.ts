import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const AV_BASE = 'https://www.alphavantage.co/query';

export async function fetchDailyTimeSeries(symbol: string, apiKey?: string) {
  try {
    if (!apiKey) {
      logger.warn({ symbol }, 'alphavantage_using_sample');
      const sample = await import('../sample-data/AAPL_prices.json', { assert: { type: 'json' } }) as any;
      return sample.default;
    }
    // Use non-adjusted daily series (free tier)
    const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&datatype=json&apikey=${apiKey}`;
    logger.info({ symbol }, 'alphavantage_fetch');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AlphaVantage error: ${res.status}`);
    const json: any = await res.json();
    // Surface common API errors/rate limits
    const note = (json && (json.Note || json.Information || json['Error Message'])) as string | undefined;
    if (note) {
      throw new Error(`AlphaVantage API response: ${note}`);
    }
    return json;
  } catch (err) {
    logger.error({ err, symbol }, 'alphavantage_failed');
    throw err;
  }
}

// Parse AlphaVantage JSON into rows usable by DB
export function parseAlphaDaily(symbol: string, json: any) {
  const timeSeries = json && json['Time Series (Daily)'];
  if (!timeSeries || typeof timeSeries !== 'object') {
    return [] as Array<{symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}>;
  }
  const rows = Object.keys(timeSeries).sort().map(date => {
    const d = timeSeries[date];
    return {
      symbol,
      date,
      open: parseFloat(d['1. open']),
      high: parseFloat(d['2. high']),
      low: parseFloat(d['3. low']),
      close: parseFloat(d['4. close']),
      volume: parseInt(d['6. volume'] ?? d['5. volume'])
    };
  });
  return rows;
}
