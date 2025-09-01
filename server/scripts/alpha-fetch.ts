import 'dotenv/config';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../src/providers/alphaVantage.js';
import db, { insertPriceRow, listPrices } from '../src/db.js';

async function main() {
  const symbol = (process.argv[2] || 'AAPL').toUpperCase();
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) {
    console.error('Missing ALPHA_VANTAGE_KEY in environment');
    process.exitCode = 1;
    return;
  }
  console.log(`[alpha-fetch] fetching ${symbol}...`);
  const json = await fetchDailyTimeSeries(symbol, key);
  const rows = parseAlphaDaily(symbol, json);
  console.log(`[alpha-fetch] rows parsed: ${rows.length}`);
  if (!rows.length) {
    console.error('[alpha-fetch] ERROR: zero rows parsed');
    process.exitCode = 1;
    return;
  }
  // Insert a handful into DB under test symbol
  const testSym = `${symbol}`;
  let inserted = 0;
  for (const r of rows.slice(-10)) { insertPriceRow({ ...r, symbol: testSym }); inserted++; }
  const out = listPrices(testSym, 20);
  console.log(`[alpha-fetch] inserted=${inserted}, readBack=${out.length}`);
}

main().catch((e)=>{ console.error(e); process.exitCode = 1; });

