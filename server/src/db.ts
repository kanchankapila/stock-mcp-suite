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
  // --- Dynamic schema patch for alerts extended columns (backward compatibility) ---
  try {
    const cols = new Set<string>(db.prepare(`PRAGMA table_info(alerts)`).all().map((r:any)=> String(r.name)));
    const missing: Array<[string,string]> = [];
    if (!cols.has('created_at')) missing.push(['created_at','TEXT']);
    if (!cols.has('last_eval')) missing.push(['last_eval','TEXT']);
    if (!cols.has('baseline_price')) missing.push(['baseline_price','REAL']);
    if (!cols.has('baseline_date')) missing.push(['baseline_date','TEXT']);
    if (!cols.has('active')) missing.push(['active','INTEGER DEFAULT 1']);
    for (const [c,t] of missing) {
      try { db.exec(`ALTER TABLE alerts ADD COLUMN ${c} ${t}`); logger.info({ column:c }, 'alerts_column_added'); } catch {}
    }
  } catch {}
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
CREATE INDEX IF NOT EXISTS docs_symbol_idx ON docs(symbol);

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
CREATE INDEX IF NOT EXISTS analyses_symbol_idx ON analyses(symbol);

-- Options metrics cache (daily)
CREATE TABLE IF NOT EXISTS options_metrics(
  symbol TEXT,
  date TEXT,
  pcr REAL,   -- Put/Call Open Interest ratio (or volume-based if OI missing)
  pvr REAL,   -- Put/Call Volume ratio
  bias REAL,  -- [-1,1] bullish(+)/bearish(-) derived from OI distribution
  PRIMARY KEY(symbol, date)
);
CREATE INDEX IF NOT EXISTS options_metrics_symbol_idx ON options_metrics(symbol);

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

CREATE TABLE IF NOT EXISTS watchlist(
  symbol TEXT PRIMARY KEY,
  added_at TEXT
);

CREATE TABLE IF NOT EXISTS portfolio(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  buy_date TEXT,
  buy_price REAL,
  quantity REAL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS portfolio_symbol_idx ON portfolio(symbol);
CREATE INDEX IF NOT EXISTS portfolio_buy_date_idx ON portfolio(buy_date);

CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  kind TEXT,          -- rsi|price_drop|custom
  level REAL,          -- threshold level (for price_drop interpreted as % decline)
  triggered_at TEXT,   -- set when condition met first time
  note TEXT,
  created_at TEXT,
  last_eval TEXT,
  baseline_price REAL,
  baseline_date TEXT,
  active INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS alerts_symbol_idx ON alerts(symbol);

CREATE TABLE IF NOT EXISTS rss_news(
  id TEXT PRIMARY KEY,
  symbol TEXT,
  title TEXT,
  summary TEXT,
  url TEXT,
  published_at TEXT,
  sentiment REAL
);
CREATE INDEX IF NOT EXISTS rss_symbol_idx ON rss_news(symbol);
CREATE INDEX IF NOT EXISTS rss_published_idx ON rss_news(published_at);

-- Generic provider data table (flex field storage for new onboarded sources)
CREATE TABLE IF NOT EXISTS provider_data(
  provider_id TEXT,
  symbol TEXT,
  captured_at TEXT,
  payload TEXT,
  PRIMARY KEY(provider_id, symbol, captured_at)
);
CREATE INDEX IF NOT EXISTS provider_data_symbol_idx ON provider_data(symbol);

-- Providers registry table
CREATE TABLE IF NOT EXISTS providers(
  id TEXT PRIMARY KEY,
  name TEXT,
  kind TEXT,
  enabled INTEGER,
  rag_enabled INTEGER,
  config TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS provider_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  success INTEGER,
  error_count INTEGER,
  items_json TEXT,
  rag_indexed INTEGER,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS provider_runs_provider_idx ON provider_runs(provider_id, started_at DESC);

CREATE TABLE IF NOT EXISTS provider_run_errors(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  symbol TEXT,
  error TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS provider_run_errors_run_idx ON provider_run_errors(run_id);

-- Added: Features engineering table (referenced by features helpers)
CREATE TABLE IF NOT EXISTS features(
  symbol TEXT,
  date TEXT,
  ret1 REAL,
  ret5 REAL,
  ret20 REAL,
  vol REAL,
  rsi REAL,
  sma20 REAL,
  ema50 REAL,
  momentum REAL,
  sent_avg REAL,
  pcr REAL,
  pvr REAL,
  PRIMARY KEY(symbol, date)
);
CREATE INDEX IF NOT EXISTS features_symbol_date_idx ON features(symbol, date);

-- Added: Backtests runs table (referenced by backtest helpers)
CREATE TABLE IF NOT EXISTS backtests(
  id TEXT PRIMARY KEY,
  status TEXT,
  cfg TEXT,
  metrics TEXT,
  equity TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS backtests_status_idx ON backtests(status);

-- Added: Time-series line (technical line) cache table
CREATE TABLE IF NOT EXISTS tl_cache(
  tlid TEXT,
  kind TEXT, -- 'sma' | 'adv'
  data TEXT,
  updated_at TEXT,
  PRIMARY KEY(tlid, kind)
);
CREATE INDEX IF NOT EXISTS tl_cache_updated_idx ON tl_cache(updated_at);
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

export function addWatchlistSymbol(symbol: string) {
  try {
    const stmt = db.prepare(`INSERT OR IGNORE INTO watchlist(symbol, added_at) VALUES(?, ?)`);
    stmt.run(symbol, new Date().toISOString());
  } catch (err) { logger.warn({ err, symbol }, 'watchlist_add_failed'); }
}

export function listWatchlistSymbols(): Array<{symbol:string, added_at:string}> {
  try {
    return db.prepare(`SELECT symbol, added_at FROM watchlist ORDER BY added_at ASC`).all();
  } catch { return []; }
}

export function addPortfolioEntry(row: { symbol:string; buy_date:string; buy_price:number; quantity:number }) {
  try {
    const stmt = db.prepare(`INSERT INTO portfolio(symbol,buy_date,buy_price,quantity,created_at) VALUES(?,?,?,?,?)`);
    stmt.run(row.symbol, row.buy_date, row.buy_price, row.quantity, new Date().toISOString());
  } catch (err) { logger.warn({ err, symbol: row.symbol }, 'portfolio_add_failed'); }
}

export function listPortfolioEntries(): Array<{ id:number; symbol:string; buy_date:string; buy_price:number; quantity:number }> {
  try {
    return db.prepare(`SELECT id, symbol, buy_date, buy_price, quantity FROM portfolio ORDER BY buy_date ASC`).all();
  } catch { return []; }
}

export function portfolioSummary() {
  try {
    const rows = db.prepare(`SELECT symbol, buy_price, quantity FROM portfolio`).all() as Array<{symbol:string; buy_price:number; quantity:number}>;
    let invested = 0; let current = 0;
    for (const r of rows) {
      invested += r.buy_price * r.quantity;
      const lp = latestPrice(r.symbol);
      if (lp) current += lp.close * r.quantity; else current += r.buy_price * r.quantity; // fallback
    }
    const pnl = current - invested;
    const pct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pct };
  } catch { return { invested:0, current:0, pnl:0, pct:0 }; }
}

export function portfolioPerformance() {
  try {
    // Aggregate by buy_date using cumulative invested; use latest price for current value snapshot
    const rows = db.prepare(`SELECT buy_date as date, SUM(buy_price*quantity) invested FROM portfolio GROUP BY buy_date ORDER BY buy_date ASC`).all() as Array<{date:string; invested:number}>;
    let cumInvested = 0;
    const series: Array<{ date:string; invested:number; current:number }> = [];
    for (const r of rows) {
      cumInvested += r.invested;
      // compute current using latest prices for all holdings up to this date
      const held = db.prepare(`SELECT symbol, buy_price, quantity FROM portfolio WHERE buy_date <= ?`).all(r.date) as Array<{symbol:string; buy_price:number; quantity:number}>;
      let currentVal = 0;
      for (const h of held) {
        const lp = latestPrice(h.symbol);
        currentVal += (lp ? lp.close : h.buy_price) * h.quantity;
      }
      series.push({ date: r.date, invested: cumInvested, current: currentVal });
    }
    return series;
  } catch { return []; }
}

export function addAlert(row: { symbol:string; kind:string; level:number; note?:string }) {
  try {
    // capture baseline price only for price_drop alerts
    let baseline_price: number | null = null; let baseline_date: string | null = null;
    if (row.kind === 'price_drop') {
      const lp = latestPrice(row.symbol);
      if (lp) { baseline_price = lp.close; baseline_date = lp.date; }
    }
    const stmt = db.prepare(`INSERT INTO alerts(symbol, kind, level, triggered_at, note, created_at, last_eval, baseline_price, baseline_date, active) VALUES(?,?,?,?,?,?,?,?,?,1)`);
    stmt.run(row.symbol, row.kind, row.level, null, row.note ?? null, new Date().toISOString(), null, baseline_price, baseline_date);
  } catch (err) { logger.warn({ err, symbol: row.symbol }, 'alert_add_failed'); }
}

export function listAlerts(limit = 100) {
  try { return db.prepare(`SELECT id, symbol, kind, level, triggered_at, note, created_at, last_eval, baseline_price, baseline_date, active FROM alerts ORDER BY created_at DESC LIMIT ?`).all(limit); } catch { return []; }
}

export function listActiveAlerts(): Array<any> {
  try { return db.prepare(`SELECT id, symbol, kind, level, triggered_at, baseline_price, baseline_date FROM alerts WHERE active=1`).all(); } catch { return []; }
}

export function markAlertEvaluated(id: number) {
  try { db.prepare(`UPDATE alerts SET last_eval=? WHERE id=?`).run(new Date().toISOString(), id); } catch {}
}

export function triggerAlert(id: number, info?: { note?: string }) {
  try { db.prepare(`UPDATE alerts SET triggered_at=?, active=0, note=COALESCE(note, ?) WHERE id=?`).run(new Date().toISOString(), info?.note ?? null, id); } catch {}
}

export function insertRssNews(row: { id:string; symbol:string|null; title:string; summary:string; url:string; published_at:string; sentiment:number|null }) {
  try {
    const stmt = db.prepare(`INSERT OR IGNORE INTO rss_news(id, symbol, title, summary, url, published_at, sentiment) VALUES(?,?,?,?,?,?,?)`);
    stmt.run(row.id, row.symbol, row.title, row.summary, row.url, row.published_at, row.sentiment ?? null);
  } catch (err) { logger.warn({ err, id: row.id }, 'rss_news_insert_failed'); }
}

export function listRssNews(limit = 50) {
  try { return db.prepare(`SELECT id, symbol, title, summary, url, published_at, sentiment FROM rss_news ORDER BY published_at DESC LIMIT ?`).all(limit); } catch { return []; }
}

export function insertProviderData(row: { provider_id:string; symbol:string; captured_at:string; payload:any }) {
  try {
    const stmt = db.prepare(`INSERT INTO provider_data(provider_id,symbol,captured_at,payload) VALUES(?,?,?,?)`);
    stmt.run(row.provider_id, row.symbol, row.captured_at, JSON.stringify(row.payload));
  } catch (err) { logger.warn({ err, provider: row.provider_id }, 'provider_data_insert_failed'); }
}

export function listProviderData(symbol: string, provider_id?: string, limit = 20) {
  try {
    if (provider_id) {
      return db.prepare(`SELECT provider_id, symbol, captured_at, payload FROM provider_data WHERE symbol=? AND provider_id=? ORDER BY captured_at DESC LIMIT ?`).all(symbol, provider_id, limit).map((r:any)=> ({ ...r, payload: safeJson(r.payload) }));
    }
    return db.prepare(`SELECT provider_id, symbol, captured_at, payload FROM provider_data WHERE symbol=? ORDER BY captured_at DESC LIMIT ?`).all(symbol, limit).map((r:any)=> ({ ...r, payload: safeJson(r.payload) }));
  } catch { return []; }
}

export function removePortfolioEntry(id: number) {
  try { db.prepare(`DELETE FROM portfolio WHERE id=?`).run(id); } catch (err) { logger.warn({ err, id }, 'portfolio_delete_failed'); }
}

export function removeWatchlistSymbol(symbol: string) {
  try { db.prepare(`DELETE FROM watchlist WHERE symbol=?`).run(symbol); } catch (err) { logger.warn({ err, symbol }, 'watchlist_delete_failed'); }
}

export function removeAlert(id: number) {
  try { db.prepare(`DELETE FROM alerts WHERE id=?`).run(id); } catch (err) { logger.warn({ err, id }, 'alert_delete_failed'); }
}

export function upsertProvider(row: { id:string; name:string; kind:string; enabled:boolean; rag_enabled?:boolean; config?:any }) {
  try {
    const stmt = db.prepare(`INSERT INTO providers(id,name,kind,enabled,rag_enabled,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, enabled=excluded.enabled, rag_enabled=excluded.rag_enabled, config=excluded.config, updated_at=excluded.updated_at`);
    const now = new Date().toISOString();
    stmt.run(row.id, row.name, row.kind, row.enabled ? 1 : 0, row.rag_enabled ? 1 : 0, row.config ? JSON.stringify(row.config) : null, now, now);
  } catch (err) { logger.warn({ err, id: row.id }, 'provider_upsert_failed'); }
}

export function latestFeature(symbol: string): { date:string; rsi:number|null } | null {
  try {
    const row = db.prepare(`SELECT date, rsi FROM features WHERE symbol=? AND rsi IS NOT NULL ORDER BY date DESC LIMIT 1`).get(symbol);
    if (!row) return null;
    return { date: String(row.date), rsi: row.rsi !== null && row.rsi !== undefined ? Number(row.rsi) : null };
  } catch { return null; }
}

export function insertProviderRun(row: { provider_id:string; started_at:string; finished_at:string; duration_ms:number; success:boolean; error_count:number; items:any; rag_indexed:number; meta?:any }) {
  try {
    const stmt = db.prepare(`INSERT INTO provider_runs(provider_id,started_at,finished_at,duration_ms,success,error_count,items_json,rag_indexed,meta_json) VALUES(?,?,?,?,?,?,?,?,?)`);
    stmt.run(row.provider_id,row.started_at,row.finished_at,row.duration_ms,row.success?1:0,row.error_count, JSON.stringify(row.items||null), row.rag_indexed, row.meta?JSON.stringify(row.meta):null);
  } catch (err) { logger.warn({ err, provider: row.provider_id }, 'provider_run_insert_failed'); }
}

export function insertProviderRunError(run_id: number, symbol: string|undefined, error: string) {
  try { db.prepare(`INSERT INTO provider_run_errors(run_id,symbol,error,created_at) VALUES(?,?,?,?)`).run(run_id, symbol||null, error, new Date().toISOString()); } catch {}
}

export function listRecentProviderRuns(provider_id: string, limit=20) {
  try { return db.prepare(`SELECT id,provider_id,started_at,finished_at,duration_ms,success,error_count,items_json,rag_indexed,meta_json FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ?`).all(provider_id, limit).map((r:any)=> ({ ...r, items: safeJson(r.items_json), meta: safeJson(r.meta_json) })); } catch { return []; }
}

export function listProviderRunErrors(provider_id: string, run_id?: number, limit=50) {
  try {
    if (Number.isFinite(run_id)) {
      return db.prepare(`SELECT id, run_id, symbol, error, created_at FROM provider_run_errors WHERE run_id=? ORDER BY id DESC LIMIT ?`).all(run_id, limit);
    }
    return db.prepare(`SELECT e.id, e.run_id, e.symbol, e.error, e.created_at FROM provider_run_errors e JOIN provider_runs r ON e.run_id=r.id WHERE r.provider_id=? ORDER BY e.id DESC LIMIT ?`).all(provider_id, limit);
  } catch { return []; }
}

export function getProviderLastSuccess(provider_id: string): string | null {
  try {
    const row = db.prepare(`SELECT finished_at FROM provider_runs WHERE provider_id=? AND success=1 ORDER BY finished_at DESC LIMIT 1`).get(provider_id) as { finished_at:string }|undefined;
    return row ? String(row.finished_at) : null;
  } catch { return null; }
}

export function getProviderConsecutiveFailures(provider_id: string, limit=50): number {
  try {
    const rows = db.prepare(`SELECT success FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ?`).all(provider_id, limit) as Array<{success:number}>;
    let count = 0;
    for (const r of rows) { if (r.success) break; else count++; }
    return count;
  } catch { return 0; }
}

function safeJson(x: any) { try { return JSON.parse(String(x)); } catch { return null; } }
