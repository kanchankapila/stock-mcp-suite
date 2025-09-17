import db from '../db.js';

export interface StoredFeatureRow {
  date: string;
  ret1: number | null;
  ret5: number | null;
  ret20: number | null;
  vol: number | null;
  rsi: number | null;
  sma20: number | null;
  sma50?: number | null;
  ema12?: number | null;
  ema26?: number | null;
  ema50: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHistogram?: number | null;
  bollingerUpper?: number | null;
  bollingerLower?: number | null;
  momentum: number | null;
  sent_avg: number | null;
  pcr: number | null;
  pvr: number | null;
}

function normalizeSymbol(symbol: string): string {
  return (symbol || '').trim().toUpperCase();
}

export function getStoredFeatures(symbol: string, days = 60): StoredFeatureRow[] {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];
  const rangeDays = Math.max(1, days);
  const cutoff = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const stmt = db.prepare("SELECT date, ret1, ret5, ret20, vol, rsi, sma20, ema50, momentum, sent_avg, pcr, pvr FROM features WHERE symbol=? AND date>=? ORDER BY date ASC");
  return stmt.all(normalized, cutoff) as StoredFeatureRow[];
}

export function getStoredFeaturesBetween(symbol: string, from: string, to: string): StoredFeatureRow[] {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];
  if (!from || !to) return getStoredFeatures(normalized, 60);
  const stmt = db.prepare("SELECT date, ret1, ret5, ret20, vol, rsi, sma20, ema50, momentum, sent_avg, pcr, pvr FROM features WHERE symbol=? AND date>=? AND date<=? ORDER BY date ASC");
  return stmt.all(normalized, from, to) as StoredFeatureRow[];
}
