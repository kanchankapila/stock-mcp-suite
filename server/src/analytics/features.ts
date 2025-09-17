import { listPrices, listNews } from '../db.js';
import { sentimentScore } from './sentiment.js';

interface FeatureRow {
  date: string;
  rsi: number | null;
  sma20: number | null;
  ema50: number | null;
  momentum: number | null;
  volatility: number | null;
  sent_avg: number | null;
}

function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (i <= period) {
      if (diff >= 0) gains += diff; else losses -= diff;
      rsi.push(NaN);
      continue;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const val = 100 - (100 / (1 + rs));
    rsi.push(val);
    // slide window
    const firstDiff = closes[i - period + 1] - closes[i - period];
    if (firstDiff >= 0) gains -= firstDiff; else losses += firstDiff;
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  while (rsi.length < closes.length) rsi.unshift(NaN);
  return rsi;
}

export async function getStoredFeatures(symbol: string, days = 60): Promise<FeatureRow[]> {
  const prices = listPrices(symbol.toUpperCase(), days + 60) as Array<{ date: string; close: number }>;
  if (!prices.length) return [];
  const closes = prices.map(p => p.close);

  // SMA20
  const sma20: number[] = closes.map((_, i) => {
    const start = Math.max(0, i - 19);
    const slice = closes.slice(start, i + 1);
    return slice.length < 20 ? NaN : slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  // EMA50
  const ema50: number[] = [];
  const k = 2 / (50 + 1);
  closes.forEach((c, i) => {
    if (i === 0) ema50.push(c); else ema50.push(c * k + ema50[i - 1] * (1 - k));
  });
  // RSI
  const rsi = calcRSI(closes, 14);
  // Momentum (close / close n-back -1) using 10 day
  const momentum: number[] = closes.map((c, i) => (i < 10 ? NaN : (c - closes[i - 10]) / closes[i - 10]));
  // Volatility (std dev last 20 closes)
  const volatility: number[] = closes.map((_, i) => {
    if (i < 19) return NaN;
    const slice = closes.slice(i - 19, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - avg) ** 2, 0) / slice.length;
    return Math.sqrt(variance);
  });

  // Sentiment average for news on that date (simple mapping)
  const news = listNews(symbol.toUpperCase(), 200) as Array<{ date: string; title: string; summary: string }>;
  const newsByDate: Record<string, string[]> = {};
  news.forEach(n => {
    const d = String(n.date).slice(0, 10);
    (newsByDate[d] ||= []).push(`${n.title}. ${n.summary}`);
  });
  const sentAvgByDate: Record<string, number> = {};
  Object.entries(newsByDate).forEach(([d, arr]) => { sentAvgByDate[d] = sentimentScore(arr); });

  const out: FeatureRow[] = prices.slice(-days).map((p, idxAll) => {
    const date = p.date;
    return {
      date,
      rsi: Number.isFinite(rsi[idxAll]) ? Number(rsi[idxAll].toFixed(2)) : null,
      sma20: Number.isFinite(sma20[idxAll]) ? Number(sma20[idxAll].toFixed(4)) : null,
      ema50: Number.isFinite(ema50[idxAll]) ? Number(ema50[idxAll].toFixed(4)) : null,
      momentum: Number.isFinite(momentum[idxAll]) ? Number(momentum[idxAll].toFixed(4)) : null,
      volatility: Number.isFinite(volatility[idxAll]) ? Number(volatility[idxAll].toFixed(4)) : null,
      sent_avg: sentAvgByDate[date] ?? null
    };
  });
  return out;
}
