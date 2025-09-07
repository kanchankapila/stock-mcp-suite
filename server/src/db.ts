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

// Create tables
try {
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
