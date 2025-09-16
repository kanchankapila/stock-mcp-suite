const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.argv[2] || path.resolve(__dirname, '..', 'server', 'stock.db');
const db = new Database(dbPath);
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('DB:', dbPath);
console.log('Tables:', tables.map(t=>t.name));
for (const t of tables) {
  console.log('\n---', t.name, '---');
  console.log(t.sql);
  const count = db.prepare(`SELECT COUNT(*) as n FROM ${t.name}`).get().n;
  console.log('rows =', count);
}
