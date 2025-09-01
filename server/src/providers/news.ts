import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const NEWS_BASE = 'https://newsapi.org/v2/everything';

export async function fetchNews(symbol: string, apiKey?: string) {
  try {
    if (!apiKey) {
      logger.warn({ symbol }, 'newsapi_using_sample');
      const sample = await import('../sample-data/AAPL_news.json', { assert: { type: 'json' } }) as any;
      return sample.default;
    }
    const q = encodeURIComponent(symbol);
    const url = `${NEWS_BASE}?q=${q}&sortBy=publishedAt&language=en&pageSize=25&apiKey=${apiKey}`;
    logger.info({ symbol }, 'newsapi_fetch');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
    return res.json();
  } catch (err) {
    logger.error({ err, symbol }, 'newsapi_failed');
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
