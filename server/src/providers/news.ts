import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { fetchJson } from '../utils/http.js';

const NEWS_BASE = 'https://newsapi.org/v2/everything';

export async function fetchNews(queryText: string, apiKey?: string) {
  try {
    if (!apiKey) {
      logger.warn({ q: queryText }, 'newsapi_using_sample');
      const sample = await import('../sample-data/AAPL_news.json', { assert: { type: 'json' } }) as any;
      return sample.default;
    }
    // Restrict to a recent window (default last N days) and rank by popularity
    const days = Number(process.env.NEWS_FROM_DAYS || 5);
    const now = new Date();
    const to = now.toISOString().slice(0,10);
    const fromDate = new Date(now.getTime() - days*24*60*60*1000).toISOString().slice(0,10);
    const q = encodeURIComponent(queryText);
    // Example shape: https://newsapi.org/v2/everything?q=$name&from=YYYY-MM-DD&sortBy=popularity&apiKey=API_KEY
    const url = `${NEWS_BASE}?q=${q}&from=${fromDate}&to=${to}&sortBy=popularity&language=en&pageSize=25&apiKey=${apiKey}`;
    logger.info({ q: queryText, from: fromDate, to, sortBy:'popularity' }, 'newsapi_fetch');
    const json = await fetchJson(url, { timeoutMs: 8000, retries: 2, retryDelayMs: 200 });
    return json;
  } catch (err) {
    logger.error({ err, q: queryText }, 'newsapi_failed');
    throw err;
  }
}

export function parseNews(symbol: string, json: any) {
  const articles = json.articles || [];
  return articles.map((a: any, idx: number) => ({
    id: a.url || `${symbol}-${idx}`,
    symbol,
    date: a.publishedAt || new Date().toISOString(),
    title: a.title || '',
    summary: a.description || '',
    url: a.url || '',
  }));
}
