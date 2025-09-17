import { listNews } from '../db.js';
import Sentiment from 'sentiment';

const sentiment = new Sentiment();

export function sentimentScore(texts: string[]): number {
  if (!texts.length) return 0;
  const scores = texts.map(t => sentiment.analyze(t || '').comparative || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg; // roughly -1..+1
}

export function analyzeSentiment(symbol: string, days = 7) {
  const normalized = (symbol || '').toUpperCase();
  if (!normalized) throw new Error('symbol required');
  const limit = Math.max(1, days);
  const cutoff = new Date(Date.now() - limit * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = listNews(normalized, 200) as Array<{ date: string; title: string; summary: string; url: string; sentiment?: number }>;
  const filtered = rows.filter(r => !r.date || r.date >= cutoff);
  if (!filtered.length) {
    return {
      symbol: normalized,
      overall_sentiment: 0,
      positive_ratio: 0,
      negative_ratio: 0,
      neutral_ratio: 1,
      confidence: 0,
      sources_count: 0,
      articles: []
    };
  }
  const articleScores = filtered.map(r => {
    if (typeof r.sentiment === 'number') return r.sentiment;
    const text = `${r.title || ''}. ${r.summary || ''}`.trim();
    return text ? sentimentScore([text]) : 0;
  });
  const overall = articleScores.reduce((sum, v) => sum + v, 0) / articleScores.length;
  const positiveCount = articleScores.filter(v => v > 0.1).length;
  const negativeCount = articleScores.filter(v => v < -0.1).length;
  const neutralCount = articleScores.length - positiveCount - negativeCount;
  const confidence = Math.min(1, articleScores.length / 20);

  const articles = filtered.slice(0, 10).map((r, idx) => ({
    date: r.date,
    title: r.title,
    summary: r.summary,
    url: r.url,
    sentiment: articleScores[idx] ?? 0
  }));

  return {
    symbol: normalized,
    overall_sentiment: overall,
    positive_ratio: articleScores.length ? positiveCount / articleScores.length : 0,
    negative_ratio: articleScores.length ? negativeCount / articleScores.length : 0,
    neutral_ratio: articleScores.length ? neutralCount / articleScores.length : 1,
    confidence,
    sources_count: filtered.length,
    articles
  };
}
