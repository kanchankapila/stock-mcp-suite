import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews } from '../src/db.js';
import { sentimentScore } from '../src/analytics/sentiment.js';

async function main() {
  const symbol = 'ZZZZ';
  console.log(`[db-check] Using symbol ${symbol}`);

  // Cleanup any remnants from previous runs
  db.prepare('DELETE FROM prices WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM news WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM docs WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM stocks WHERE symbol=?').run(symbol);

  // Insert synthetic sample rows
  const priceRows = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (12 - i));
    const date = d.toISOString().slice(0, 10);
    const close = 100 + i; // simple increasing series
    return { symbol, date, open: close - 1, high: close + 1, low: close - 2, close, volume: 1000 + i };
  });
  for (const r of priceRows) insertPriceRow(r);

  const articles = [
    { id: 'n1', date: new Date().toISOString(), title: 'Test positive news', summary: 'Great results', url: 'http://example.com/1' },
    { id: 'n2', date: new Date().toISOString(), title: 'Test neutral news', summary: 'As expected', url: 'http://example.com/2' },
    { id: 'n3', date: new Date().toISOString(), title: 'Test negative news', summary: 'Poor outlook', url: 'http://example.com/3' }
  ];
  for (const n of articles) {
    const s = sentimentScore([`${n.title}. ${n.summary}`]);
    insertNewsRow({ id: `${symbol}-${n.id}`, symbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
  }

  upsertStock(symbol, 'Test Corp');

  // Read back
  const pricesOut = listPrices(symbol, 1000);
  const newsOut = listNews(symbol, 50);

  console.log(`[db-check] Inserted prices=${priceRows.length}, read=${pricesOut.length}`);
  console.log(`[db-check] Inserted news=${articles.length}, read=${newsOut.length}`);
  if (pricesOut.length !== priceRows.length) throw new Error('Price row count mismatch');
  if (newsOut.length !== articles.length) throw new Error('News row count mismatch');

  // Spot-check first/last price ordering ASC by date
  const first = pricesOut[0];
  const last = pricesOut[pricesOut.length - 1];
  console.log(`[db-check] First date=${first.date} close=${first.close}`);
  console.log(`[db-check] Last  date=${last.date} close=${last.close}`);

  console.log('[db-check] OK: insert and read verified');

  // Cleanup
  db.prepare('DELETE FROM prices WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM news WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM docs WHERE symbol=?').run(symbol);
  db.prepare('DELETE FROM stocks WHERE symbol=?').run(symbol);
  console.log('[db-check] Cleanup complete');
}

main().catch((err)=>{
  console.error('[db-check] FAILED', err);
  process.exitCode = 1;
});
