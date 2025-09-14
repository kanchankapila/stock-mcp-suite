const Database = require('better-sqlite3');
const path = require('path');

try {
  const dbPath = path.resolve(__dirname, '..', 'stock.db');
  const db = new Database(dbPath);
  const tables = [
    'yahoo_info',
    'yahoo_actions',
    'yahoo_major_holders',
    'yahoo_financials',
    // Handle typo variant just in case
    'yahoo_major_olders',
  ];
  for (const t of tables) {
    try {
      db.exec(`DROP TABLE IF EXISTS ${t}`);
      console.log(`dropped ${t}`);
    } catch (e) {
      console.error(`failed ${t}: ${e?.message || e}`);
    }
  }
  db.close();
} catch (e) {
  console.error('drop_yahoo_tables_failed', e?.message || e);
  process.exit(1);
}

