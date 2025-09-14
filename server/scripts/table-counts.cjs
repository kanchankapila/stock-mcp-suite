const Database = require('better-sqlite3');
const db = new Database('stock.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
for (const name of tables) {
  const row = db.prepare(`SELECT COUNT(*) as n FROM ${name}`).get();
  console.log(name.padEnd(22), row.n);
}
