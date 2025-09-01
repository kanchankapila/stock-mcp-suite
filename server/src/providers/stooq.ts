import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

export async function fetchStooqDaily(symbol: string) {
  // Stooq expects lowercase and uses suffixes like .ns for NSE
  const s = symbol.toLowerCase();
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  logger.info({ symbol }, 'stooq_fetch');
  const res = await fetch(url, { headers: { 'Accept': 'text/csv,*/*' } });
  if (!res.ok) throw new Error(`Stooq error: ${res.status}`);
  const text = await res.text();
  return parseStooqCsv(symbol, text);
}

export function parseStooqCsv(symbol: string, csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length) return [] as Array<{symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}>;
  const header = lines[0].toLowerCase();
  const idx = {
    date: header.split(',').indexOf('date'),
    open: header.split(',').indexOf('open'),
    high: header.split(',').indexOf('high'),
    low: header.split(',').indexOf('low'),
    close: header.split(',').indexOf('close'),
    volume: header.split(',').indexOf('volume')
  };
  const rows = [] as Array<{symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}>;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 6) continue;
    const date = cols[idx.date];
    const open = Number(cols[idx.open]);
    const high = Number(cols[idx.high]);
    const low = Number(cols[idx.low]);
    const close = Number(cols[idx.close]);
    const volume = Number(cols[idx.volume] || 0);
    if (Number.isFinite(close) && close > 0) {
      rows.push({ symbol, date, open, high, low, close, volume });
    }
  }
  return rows;
}

