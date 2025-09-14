import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger.js';

const DB_PATH = path.resolve(process.cwd(), 'stock.db');
let db: any;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  logger.info({ DB_PATH }, 'db_opened');
} catch (err) {
  logger.error({ err, DB_PATH }, 'db_open_failed');
  throw err;
}

// Simple migration runner: apply SQL files under server/src/db/migrations in order
function runMigrations(database: any) {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const migDir = path.resolve(here, 'db', 'migrations');
    if (!fs.existsSync(migDir)) return;
    database.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)');
    const applied = new Set<string>(database.prepare('SELECT version FROM schema_migrations').all().map((r: any)=> String(r.version)));
    const files = fs.readdirSync(migDir).filter(f => /\.sql$/i.test(f)).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      database.exec('BEGIN');
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(f, new Date().toISOString());
      database.exec('COMMIT');
      logger.info({ migration: f }, 'db_migration_applied');
    }
  } catch (err) {
    logger.error({ err }, 'db_migration_failed');
    throw err;
  }
}

// Create tables
try {
  runMigrations(db);
  db.exec(`
CREATE TABLE IF NOT EXISTS stocks(
  symbol TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS prices(
  symbol TEXT,
  date TEXT,
  open REAL, high REAL, low REAL, close REAL, volume INTEGER,
  PRIMARY KEY(symbol, date)
);

CREATE TABLE IF NOT EXISTS news(
  id TEXT PRIMARY KEY,
  symbol TEXT,
  date TEXT,
  title TEXT,
  summary TEXT,
  url TEXT,
  sentiment REAL
);

-- Helpful indices for query patterns
CREATE INDEX IF NOT EXISTS news_symbol_date ON news(symbol, date);
CREATE INDEX IF NOT EXISTS prices_date_idx ON prices(date);
CREATE INDEX IF NOT EXISTS docs_symbol_idx ON docs(symbol);
CREATE INDEX IF NOT EXISTS analyses_symbol_idx ON analyses(symbol);
CREATE INDEX IF NOT EXISTS options_metrics_symbol_idx ON options_metrics(symbol);

-- Moneycontrol Technicals cache
CREATE TABLE IF NOT EXISTS mc_tech(
  symbol TEXT,
  freq TEXT,    -- 'D' | 'W' | 'M'
  data TEXT,    -- JSON payload as returned by provider
  updated_at TEXT,
  PRIMARY KEY(symbol, freq)
);

CREATE TABLE IF NOT EXISTS docs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  chunk TEXT,
  terms TEXT     -- JSON array of {term, tf} for simple TF-IDF
);

-- Optional: Persistent RAG embeddings store (per-namespace)
CREATE TABLE IF NOT EXISTS rag_embeddings(
  ns TEXT,
  id TEXT,
  text TEXT,
  metadata TEXT,
  vector TEXT,
  PRIMARY KEY(ns, id)
);

-- Optional: URL indexing status per namespace
CREATE TABLE IF NOT EXISTS rag_url_status(
  ns TEXT,
  url TEXT,
  last_indexed TEXT,
  status TEXT,
  note TEXT,
  PRIMARY KEY(ns, url)
);

CREATE TABLE IF NOT EXISTS analyses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  created_at TEXT,
  sentiment_score REAL,
  predicted_close REAL,
  strategy JSON,
  score REAL,
  recommendation TEXT
);

-- Options metrics cache (daily)
CREATE TABLE IF NOT EXISTS options_metrics(
  symbol TEXT,
  date TEXT,
  pcr REAL,   -- Put/Call Open Interest ratio (or volume-based if OI missing)
  pvr REAL,   -- Put/Call Volume ratio
  bias REAL,  -- [-1,1] bullish(+)/bearish(-) derived from OI distribution
  PRIMARY KEY(symbol, date)
);

-- Fundamentals and Yahoo cache removed

-- History of Top Picks snapshots (per day per symbol)
CREATE TABLE IF NOT EXISTS top_picks_history(
  snapshot_date TEXT,
  symbol TEXT,
  score REAL,
  momentum REAL,
  sentiment REAL,
  mc_score REAL,
  recommendation TEXT,
  created_at TEXT,
  PRIMARY KEY(snapshot_date, symbol)
);

CREATE INDEX IF NOT EXISTS tph_date_idx ON top_picks_history(snapshot_date);
CREATE INDEX IF NOT EXISTS tph_symbol_idx ON top_picks_history(symbol);
`);
  logger.info('db_schema_ready');
} catch (err) {
  logger.error({ err }, 'db_schema_failed');
  throw err;
}

export default db;

// --- Small helpers ---
export function upsertStock(symbol: string, name?: string) {
  try {
    const stmt = db.prepare(`INSERT INTO stocks(symbol, name) VALUES(?,?)
      ON CONFLICT(symbol) DO UPDATE SET name=excluded.name`);
    stmt.run(symbol, name ?? symbol);
    logger.debug({ symbol }, 'stock_upserted');
  } catch (err) {
    logger.error({ err, symbol }, 'stock_upsert_failed');
    throw err;
  }
}

export function insertPriceRow(row: {symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}) {
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO prices(symbol,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)`);
    stmt.run(row.symbol, row.date, row.open, row.high, row.low, row.close, row.volume);
  } catch (err) {
    logger.error({ err, row }, 'price_insert_failed');
    throw err;
  }
}

export function insertNewsRow(row: {id:string, symbol:string, date:string, title:string, summary:string, url:string, sentiment:number}) {
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO news(id,symbol,date,title,summary,url,sentiment) VALUES(?,?,?,?,?,?,?)`);
    stmt.run(row.id, row.symbol, row.date, row.title, row.summary, row.url, row.sentiment);
  } catch (err) {
    logger.error({ err, row }, 'news_insert_failed');
    throw err;
  }
}

export function insertDocRow(symbol: string, chunk: string, termsJson: string) {
  try {
    const stmt = db.prepare(`INSERT INTO docs(symbol,chunk,terms) VALUES(?,?,?)`);
    stmt.run(symbol, chunk, termsJson);
  } catch (err) {
    logger.error({ err, symbol }, 'doc_insert_failed');
    throw err;
  }
}

export function listPrices(symbol: string, limit: number = 365) {
  try {
    const stmt = db.prepare(`SELECT date, open, high, low, close, volume
                             FROM prices WHERE symbol=? ORDER BY date ASC LIMIT ?`);
    return stmt.all(symbol, limit);
  } catch (err) {
    logger.error({ err, symbol, limit }, 'prices_query_failed');
    throw err;
  }
}

export function listNews(symbol: string, limit: number = 30) {
  try {
    const stmt = db.prepare(`SELECT id, date, title, summary, url, sentiment
                             FROM news WHERE symbol=? ORDER BY date DESC LIMIT ?`);
    return stmt.all(symbol, limit);
  } catch (err) {
    logger.error({ err, symbol, limit }, 'news_query_failed');
    throw err;
  }
}

export function upsertMcTech(symbol: string, freq: 'D'|'W'|'M', data: any) {
  try {
    const stmt = db.prepare(`INSERT INTO mc_tech(symbol,freq,data,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(symbol,freq) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`);
    stmt.run(symbol, freq, JSON.stringify(data), new Date().toISOString());
  } catch (err) {
    logger.error({ err, symbol, freq }, 'mc_tech_upsert_failed');
    throw err;
  }
}

export function getMcTech(symbol: string, freq: 'D'|'W'|'M'): any | null {
  try {
    const row = db.prepare(`SELECT data FROM mc_tech WHERE symbol=? AND freq=?`).get(symbol, freq);
    if (!row) return null;
    try { return JSON.parse(String(row.data)); } catch { return null; }
  } catch (err) {
    logger.error({ err, symbol, freq }, 'mc_tech_get_failed');
    throw err;
  }
}

export function latestPrice(symbol: string): { date: string, close: number } | null {
  try {
    const row = db.prepare(`SELECT date, close FROM prices WHERE symbol=? ORDER BY date DESC LIMIT 1`).get(symbol);
    if (!row) return null;
    return { date: String(row.date), close: Number(row.close) };
  } catch (err) {
    logger.error({ err, symbol }, 'latest_price_query_failed');
    throw err;
  }
}

export function saveAnalysis(a: {symbol:string, created_at:string, sentiment_score:number, predicted_close:number, strategy:any, score:number, recommendation:string}) {
  try {
    const stmt = db.prepare(`INSERT INTO analyses(symbol, created_at, sentiment_score, predicted_close, strategy, score, recommendation)
                             VALUES(?,?,?,?,?,?,?)`);
    stmt.run(a.symbol, a.created_at, a.sentiment_score, a.predicted_close, JSON.stringify(a.strategy), a.score, a.recommendation);
  } catch (err) {
    logger.error({ err, symbol: a.symbol }, 'analysis_insert_failed');
    throw err;
  }
}

export function upsertOptionsMetrics(row: { symbol: string; date: string; pcr: number|null; pvr: number|null; bias: number|null }) {
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO options_metrics(symbol,date,pcr,pvr,bias) VALUES(?,?,?,?,?)`);
    stmt.run(row.symbol, row.date, (row.pcr ?? null), (row.pvr ?? null), (row.bias ?? null));
  } catch (err) {
    logger.warn({ err, symbol: row.symbol }, 'options_metrics_upsert_failed');
  }
}

export function getLatestOptionsBias(symbol: string): number | null {
  try {
    const r = db.prepare(`SELECT bias FROM options_metrics WHERE symbol=? ORDER BY date DESC LIMIT 1`).get(symbol) as { bias: number } | undefined;
    const b = r?.bias;
    return (typeof b === 'number' && Number.isFinite(b)) ? b : null;
  } catch (err) {
    return null;
  }
}

// upsertYahooCache removed

export function listOptionsMetrics(symbol: string, opts?: { days?: number; limit?: number }) {
  try {
    const days = Number.isFinite(Number(opts?.days)) ? Number(opts?.days) : 30;
    const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(1, Math.min(365, Number(opts?.limit))) : 90;
    const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stmt = db.prepare(`SELECT date, pcr, pvr, bias FROM options_metrics WHERE symbol=? AND date>=? ORDER BY date ASC LIMIT ?`);
    const rows = stmt.all(symbol, cutoff, limit) as Array<{ date: string; pcr: number|null; pvr: number|null; bias: number|null }>;
    return rows;
  } catch (err) {
    logger.warn({ err, symbol, opts }, 'options_metrics_query_failed');
    return [] as Array<{ date: string; pcr: number|null; pvr: number|null; bias: number|null }>;
  }
}

// upsertFundamentals removed

// fundamentals migration removed

// --- Features + Backtests helpers ---
export function upsertFeaturesRow(row: { symbol: string; date: string; ret1?: number|null; ret5?: number|null; ret20?: number|null; vol?: number|null; rsi?: number|null; sma20?: number|null; ema50?: number|null; momentum?: number|null; sent_avg?: number|null; pcr?: number|null; pvr?: number|null }) {
  try {
    const stmt = db.prepare(`INSERT INTO features(symbol,date,ret1,ret5,ret20,vol,rsi,sma20,ema50,momentum,sent_avg,pcr,pvr)
                             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
                             ON CONFLICT(symbol,date) DO UPDATE SET
                               ret1=excluded.ret1, ret5=excluded.ret5, ret20=excluded.ret20,
                               vol=excluded.vol, rsi=excluded.rsi, sma20=excluded.sma20, ema50=excluded.ema50,
                               momentum=excluded.momentum, sent_avg=excluded.sent_avg, pcr=excluded.pcr, pvr=excluded.pvr`);
    stmt.run(row.symbol, row.date, row.ret1 ?? null, row.ret5 ?? null, row.ret20 ?? null, row.vol ?? null, row.rsi ?? null, row.sma20 ?? null, row.ema50 ?? null, row.momentum ?? null, row.sent_avg ?? null, row.pcr ?? null, row.pvr ?? null);
  } catch (err) {
    logger.warn({ err, symbol: row.symbol }, 'features_upsert_failed');
  }
}

export function insertBacktestRun(row: { id: string; status: string; cfg: any; metrics?: any; equity?: any }) {
  try {
    const stmt = db.prepare(`INSERT INTO backtests(id,status,cfg,metrics,equity,created_at,updated_at)
                             VALUES(?,?,?,?,?,?,?)
                             ON CONFLICT(id) DO UPDATE SET status=excluded.status, metrics=excluded.metrics, equity=excluded.equity, updated_at=excluded.updated_at`);
    const now = new Date().toISOString();
    stmt.run(row.id, row.status, JSON.stringify(row.cfg||{}), JSON.stringify(row.metrics||null), JSON.stringify(row.equity||null), now, now);
  } catch (err) {
    logger.warn({ err, id: row.id }, 'backtest_insert_failed');
  }
}

export function getBacktestRun(id: string): any | null {
  try {
    const row = db.prepare(`SELECT id,status,cfg,metrics,equity,created_at,updated_at FROM backtests WHERE id=?`).get(id);
    if (!row) return null;
    try {
      row.cfg = row.cfg ? JSON.parse(String(row.cfg)) : null;
      row.metrics = row.metrics ? JSON.parse(String(row.metrics)) : null;
      row.equity = row.equity ? JSON.parse(String(row.equity)) : null;
    } catch {}
    return row;
  } catch (err) { return null; }
}

export function listNewsSince(symbol: string, cutoffIso: string) {
  try {
    const stmt = db.prepare(`SELECT id, symbol, date, title, summary, url, sentiment FROM news WHERE symbol=? AND date>=? ORDER BY date ASC`);
    return stmt.all(symbol, cutoffIso);
  } catch (err) { return []; }
}

export function upsertTlCache(tlid: string, kind: 'sma'|'adv', data: any) {
  try {
    const stmt = db.prepare(`INSERT INTO tl_cache(tlid,kind,data,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(tlid,kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`);
    stmt.run(tlid, kind, JSON.stringify(data ?? null), new Date().toISOString());
  } catch (err) { logger.warn({ err, tlid, kind }, 'tl_cache_upsert_failed'); }
}

export function getTlCache(tlid: string, kind: 'sma'|'adv'): any | null {
  try {
    const row = db.prepare(`SELECT data FROM tl_cache WHERE tlid=? AND kind=?`).get(tlid, kind);
    if (!row) return null;
    try { return JSON.parse(String(row.data)); } catch { return null; }
  } catch (err) { return null; }
}
