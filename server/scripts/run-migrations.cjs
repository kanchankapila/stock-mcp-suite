const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'stock.db');
const db = new Database(dbPath);
const migDir = path.resolve(__dirname, '..', 'src', 'db', 'migrations');

function ensureMigrationsTable() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)');
}

function listApplied() {
  try { return new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => String(r.version))); }
  catch { return new Set(); }
}

function applyMigration(file) {
  const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
  db.exec('BEGIN');
  db.exec(sql);
  db.prepare('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(file, new Date().toISOString());
  db.exec('COMMIT');
  console.log('Applied migration', file);
}

function main() {
  if (!fs.existsSync(migDir)) { console.error('No migrations dir', migDir); process.exit(1); }
  ensureMigrationsTable();
  const applied = listApplied();
  const files = fs.readdirSync(migDir).filter(f => /\.sql$/i.test(f)).sort();
  for (const f of files) { if (!applied.has(f)) applyMigration(f); }
  console.log('Done.');
}

main();
