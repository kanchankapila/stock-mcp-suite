import 'dotenv/config';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../dist/providers/alphaVantage.js';
import db, { insertPriceRow, listPrices } from '../dist/db.js';

const symbol = (process.argv[2] || 'AAPL').toUpperCase();
const key = process.env.ALPHA_VANTAGE_KEY;
console.log(`[alpha-fetch] key present=${!!key}, symbol=${symbol}`);

try {
  const json = await fetchDailyTimeSeries(symbol, key);
  const rows = parseAlphaDaily(symbol, json);
  console.log(`[alpha-fetch] parsed rows: ${rows.length}`);
  if (!rows.length) {
    console.log(JSON.stringify(json).slice(0, 300));
    process.exit(1);
  }
  let inserted = 0;
  for (const r of rows.slice(-5)) { insertPriceRow(r); inserted++; }
  const out = listPrices(symbol, 10);
  console.log(`[alpha-fetch] inserted=${inserted} readBack=${out.length}`);
} catch (err) {
  console.error('[alpha-fetch] error', err);
  process.exit(1);
}

