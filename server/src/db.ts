import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger.js';
import { trackDBOperation, trackQueryTime } from './utils/performanceMonitor.js';

const DB_PATH = path.resolve(process.cwd(), 'stock.db');
let db: any;

// Performance-optimized database configuration
try {
  db = new Database(DB_PATH);
  
  // Optimize SQLite settings for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');  // Better than FULL for WAL mode
  db.pragma('cache_size = 2000');     // 2MB cache
  db.pragma('temp_store = MEMORY');   // Store temp data in memory
  db.pragma('mmap_size = 268435456'); // 256MB memory map
  db.pragma('optimize');              // Run optimization
  
  logger.info({ DB_PATH }, 'db_opened_with_optimizations');
} catch (err) {
  logger.error({ err, DB_PATH }, 'db_open_failed');
  throw err;
}

// Connection pool for prepared statements
const preparedStatements = new Map<string, any>();

// Get or create prepared statement with caching
function getPreparedStatement(sql: string): any {
  if (preparedStatements.has(sql)) {
    return preparedStatements.get(sql);
  }
  
  const stmt = db.prepare(sql);
  preparedStatements.set(sql, stmt);
  return stmt;
}

// Enhanced query execution with performance tracking
function executeQuery(sql: string, params: any[] = [], operation: string = 'SELECT', table: string = 'unknown') {
  const startTime = Date.now();
  let success = true;
  
  try {
    const stmt = getPreparedStatement(sql);
    let result;
    
    if (operation.toUpperCase().startsWith('SELECT') || operation.toUpperCase().startsWith('WITH')) {
      result = params.length > 0 ? stmt.all(...params) : stmt.all();
    } else {
      result = params.length > 0 ? stmt.run(...params) : stmt.run();
    }
    
    return result;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    trackQueryTime(sql.substring(0, 100), duration);
    trackDBOperation(operation, table, duration, success);
  }
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

CREATE TABLE IF NOT EXISTS provider_run_batches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  batch_index INTEGER,
  batch_size INTEGER,
  duration_ms INTEGER,
  symbols_json TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS provider_run_batches_run_idx ON provider_run_batches(run_id);
`);
  
  logger.info('db_schema_ready');
} catch (err) {
  logger.error({ err }, 'db_schema_failed');
  throw err;
}

export default db;

// --- Optimized helper functions ---

// Batch operations for better performance
const batchOperations = {
  prices: [] as any[],
  news: [] as any[],
  batchSize: 100,
  flushInterval: 5000 // 5 seconds
};

// Flush batched operations periodically
setInterval(() => {
  flushBatchedOperations();
}, batchOperations.flushInterval);

function flushBatchedOperations() {
  if (batchOperations.prices.length > 0) {
    const stmt = getPreparedStatement(`INSERT OR REPLACE INTO prices(symbol,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)`);
    const transaction = db.transaction(() => {
      for (const row of batchOperations.prices) {
        stmt.run(row.symbol, row.date, row.open, row.high, row.low, row.close, row.volume);
      }
    });
    transaction();
    batchOperations.prices = [];
    logger.debug({ count: batchOperations.prices.length }, 'batched_prices_flushed');
  }
  
  if (batchOperations.news.length > 0) {
    const stmt = getPreparedStatement(`INSERT OR REPLACE INTO news(id,symbol,date,title,summary,url,sentiment) VALUES(?,?,?,?,?,?,?)`);
    const transaction = db.transaction(() => {
      for (const row of batchOperations.news) {
        stmt.run(row.id, row.symbol, row.date, row.title, row.summary, row.url, row.sentiment);
      }
    });
    transaction();
    batchOperations.news = [];
    logger.debug({ count: batchOperations.news.length }, 'batched_news_flushed');
  }
}

export function upsertStock(symbol: string, name?: string) {
  try {
    const result = executeQuery(
      `INSERT INTO stocks(symbol, name) VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name`,
      [symbol, name ?? symbol],
      'UPSERT',
      'stocks'
    );
    logger.debug({ symbol }, 'stock_upserted');
    return result;
  } catch (err) {
    logger.error({ err, symbol }, 'stock_upsert_failed');
    throw err;
  }
}

export function insertPriceRow(row: {symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}) {
  try {
    // Use batching for better performance
    batchOperations.prices.push(row);
    
    // Flush immediately if batch is full
    if (batchOperations.prices.length >= batchOperations.batchSize) {
      flushBatchedOperations();
    }
  } catch (err) {
    logger.error({ err, row }, 'price_insert_failed');
    throw err;
  }
}

export function insertNewsRow(row: {id:string, symbol:string, date:string, title:string, summary:string, url:string, sentiment:number}) {
  try {
    // Use batching for better performance
    batchOperations.news.push(row);
    
    // Flush immediately if batch is full
    if (batchOperations.news.length >= batchOperations.batchSize) {
      flushBatchedOperations();
    }
  } catch (err) {
    logger.error({ err, row }, 'news_insert_failed');
    throw err;
  }
}

export function insertDocRow(symbol: string, chunk: string, termsJson: string) {
  try {
    return executeQuery(
      `INSERT INTO docs(symbol,chunk,terms) VALUES(?,?,?)`,
      [symbol, chunk, termsJson],
      'INSERT',
      'docs'
    );
  } catch (err) {
    logger.error({ err, symbol }, 'doc_insert_failed');
    throw err;
  }
}

export function listPrices(symbol: string, limit: number = 365) {
  try {
    return executeQuery(
      `SELECT date, open, high, low, close, volume FROM prices WHERE symbol=? ORDER BY date ASC LIMIT ?`,
      [symbol, limit],
      'SELECT',
      'prices'
    );
  } catch (err) {
    logger.error({ err, symbol, limit }, 'prices_query_failed');
    throw err;
  }
}

export function listNews(symbol: string, limit: number = 30) {
  try {
    return executeQuery(
      `SELECT id, date, title, summary, url, sentiment FROM news WHERE symbol=? ORDER BY date DESC LIMIT ?`,
      [symbol, limit],
      'SELECT',
      'news'
    );
  } catch (err) {
    logger.error({ err, symbol, limit }, 'news_query_failed');
    throw err;
  }
}

export function upsertMcTech(symbol: string, freq: 'D'|'W'|'M', data: any) {
  try {
    return executeQuery(
      `INSERT INTO mc_tech(symbol,freq,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(symbol,freq) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
      [symbol, freq, JSON.stringify(data), new Date().toISOString()],
      'UPSERT',
      'mc_tech'
    );
  } catch (err) {
    logger.error({ err, symbol, freq }, 'mc_tech_upsert_failed');
    throw err;
  }
}

export function getMcTech(symbol: string, freq: 'D'|'W'|'M'): any | null {
  try {
    const row = executeQuery(
      `SELECT data FROM mc_tech WHERE symbol=? AND freq=?`,
      [symbol, freq],
      'SELECT',
      'mc_tech'
    );
    if (!row || !Array.isArray(row) || row.length === 0) return null;
    try { return JSON.parse(String(row[0].data)); } catch { return null; }
  } catch (err) {
    logger.error({ err, symbol, freq }, 'mc_tech_get_failed');
    throw err;
  }
}

export function latestPrice(symbol: string): { date: string, close: number } | null {
  try {
    const rows = executeQuery(
      `SELECT date, close FROM prices WHERE symbol=? ORDER BY date DESC LIMIT 1`,
      [symbol],
      'SELECT',
      'prices'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return { date: String(row.date), close: Number(row.close) };
  } catch (err) {
    logger.error({ err, symbol }, 'latest_price_query_failed');
    throw err;
  }
}

export function saveAnalysis(a: {symbol:string, created_at:string, sentiment_score:number, predicted_close:number, strategy:any, score:number, recommendation:string}) {
  try {
    return executeQuery(
      `INSERT INTO analyses(symbol, created_at, sentiment_score, predicted_close, strategy, score, recommendation) VALUES(?,?,?,?,?,?,?)`,
      [a.symbol, a.created_at, a.sentiment_score, a.predicted_close, JSON.stringify(a.strategy), a.score, a.recommendation],
      'INSERT',
      'analyses'
    );
  } catch (err) {
    logger.error({ err, symbol: a.symbol }, 'analysis_insert_failed');
    throw err;
  }
}

export function upsertOptionsMetrics(row: { symbol: string; date: string; pcr: number|null; pvr: number|null; bias: number|null }) {
  try {
    return executeQuery(
      `INSERT OR REPLACE INTO options_metrics(symbol,date,pcr,pvr,bias) VALUES(?,?,?,?,?)`,
      [row.symbol, row.date, (row.pcr ?? null), (row.pvr ?? null), (row.bias ?? null)],
      'UPSERT',
      'options_metrics'
    );
  } catch (err) {
    logger.warn({ err, symbol: row.symbol }, 'options_metrics_upsert_failed');
  }
}

export function getLatestOptionsBias(symbol: string): number | null {
  try {
    const rows = executeQuery(
      `SELECT bias FROM options_metrics WHERE symbol=? ORDER BY date DESC LIMIT 1`,
      [symbol],
      'SELECT',
      'options_metrics'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    const b = rows[0]?.bias;
    return (typeof b === 'number' && Number.isFinite(b)) ? b : null;
  } catch (err) {
    return null;
  }
}

export function listOptionsMetrics(symbol: string, opts?: { days?: number; limit?: number }) {
  try {
    const days = Number.isFinite(Number(opts?.days)) ? Number(opts?.days) : 30;
    const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(1, Math.min(365, Number(opts?.limit))) : 90;
    const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    return executeQuery(
      `SELECT date, pcr, pvr, bias FROM options_metrics WHERE symbol=? AND date>=? ORDER BY date ASC LIMIT ?`,
      [symbol, cutoff, limit],
      'SELECT',
      'options_metrics'
    ) as Array<{ date: string; pcr: number|null; pvr: number|null; bias: number|null }>;
  } catch (err) {
    logger.warn({ err, symbol, opts }, 'options_metrics_query_failed');
    return [] as Array<{ date: string; pcr: number|null; pvr: number|null; bias: number|null }>;
  }
}

// --- Features + Backtests helpers ---
export function upsertFeaturesRow(row: { symbol: string; date: string; ret1?: number|null; ret5?: number|null; ret20?: number|null; vol?: number|null; rsi?: number|null; sma20?: number|null; ema50?: number|null; momentum?: number|null; sent_avg?: number|null; pcr?: number|null; pvr?: number|null }) {
  try {
    return executeQuery(
      `INSERT INTO features(symbol,date,ret1,ret5,ret20,vol,rsi,sma20,ema50,momentum,sent_avg,pcr,pvr) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,date) DO UPDATE SET ret1=excluded.ret1, ret5=excluded.ret5, ret20=excluded.ret20, vol=excluded.vol, rsi=excluded.rsi, sma20=excluded.sma20, ema50=excluded.ema50, momentum=excluded.momentum, sent_avg=excluded.sent_avg, pcr=excluded.pcr, pvr=excluded.pvr`,
      [row.symbol, row.date, row.ret1 ?? null, row.ret5 ?? null, row.ret20 ?? null, row.vol ?? null, row.rsi ?? null, row.sma20 ?? null, row.ema50 ?? null, row.momentum ?? null, row.sent_avg ?? null, row.pcr ?? null, row.pvr ?? null],
      'UPSERT',
      'features'
    );
  } catch (err) {
    logger.warn({ err, symbol: row.symbol }, 'features_upsert_failed');
  }
}

export function insertBacktestRun(row: { id: string; status: string; cfg: any; metrics?: any; equity?: any }) {
  try {
    const now = new Date().toISOString();
    return executeQuery(
      `INSERT INTO backtests(id,status,cfg,metrics,equity,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, metrics=excluded.metrics, equity=excluded.equity, updated_at=excluded.updated_at`,
      [row.id, row.status, JSON.stringify(row.cfg||{}), JSON.stringify(row.metrics||null), JSON.stringify(row.equity||null), now, now],
      'UPSERT',
      'backtests'
    );
  } catch (err) {
    logger.warn({ err, id: row.id }, 'backtest_insert_failed');
  }
}

export function getBacktestRun(id: string): any | null {
  try {
    const rows = executeQuery(
      `SELECT id,status,cfg,metrics,equity,created_at,updated_at FROM backtests WHERE id=?`,
      [id],
      'SELECT',
      'backtests'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    
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
    return executeQuery(
      `SELECT id, symbol, date, title, summary, url, sentiment FROM news WHERE symbol=? AND date>=? ORDER BY date ASC`,
      [symbol, cutoffIso],
      'SELECT',
      'news'
    );
  } catch (err) { return []; }
}

export function upsertTlCache(tlid: string, kind: 'sma'|'adv', data: any) {
  try {
    return executeQuery(
      `INSERT INTO tl_cache(tlid,kind,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(tlid,kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
      [tlid, kind, JSON.stringify(data ?? null), new Date().toISOString()],
      'UPSERT',
      'tl_cache'
    );
  } catch (err) { logger.warn({ err, tlid, kind }, 'tl_cache_upsert_failed'); }
}

export function getTlCache(tlid: string, kind: 'sma'|'adv'): any | null {
  try {
    const rows = executeQuery(
      `SELECT data FROM tl_cache WHERE tlid=? AND kind=?`,
      [tlid, kind],
      'SELECT',
      'tl_cache'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    try { return JSON.parse(String(rows[0].data)); } catch { return null; }
  } catch (err) { return null; }
}

export function addWatchlistSymbol(symbol: string) {
  try {
    return executeQuery(
      `INSERT OR IGNORE INTO watchlist(symbol, added_at) VALUES(?, ?)`,
      [symbol, new Date().toISOString()],
      'INSERT',
      'watchlist'
    );
  } catch (err) { logger.warn({ err, symbol }, 'watchlist_add_failed'); }
}

export function listWatchlistSymbols(): Array<{symbol:string, added_at:string}> {
  try {
    return executeQuery(
      `SELECT symbol, added_at FROM watchlist ORDER BY added_at ASC`,
      [],
      'SELECT',
      'watchlist'
    ) as Array<{symbol:string, added_at:string}>;
  } catch { return []; }
}

export function addPortfolioEntry(row: { symbol:string; buy_date:string; buy_price:number; quantity:number }) {
  try {
    return executeQuery(
      `INSERT INTO portfolio(symbol,buy_date,buy_price,quantity,created_at) VALUES(?,?,?,?,?)`,
      [row.symbol, row.buy_date, row.buy_price, row.quantity, new Date().toISOString()],
      'INSERT',
      'portfolio'
    );
  } catch (err) { logger.warn({ err, symbol: row.symbol }, 'portfolio_add_failed'); }
}

export function listPortfolioEntries(): Array<{ id:number; symbol:string; buy_date:string; buy_price:number; quantity:number }> {
  try {
    return executeQuery(
      `SELECT id, symbol, buy_date, buy_price, quantity FROM portfolio ORDER BY buy_date ASC`,
      [],
      'SELECT',
      'portfolio'
    ) as Array<{ id:number; symbol:string; buy_date:string; buy_price:number; quantity:number }>;
  } catch { return []; }
}

export function portfolioSummary() {
  try {
    const rows = executeQuery(
      `SELECT symbol, buy_price, quantity FROM portfolio`,
      [],
      'SELECT',
      'portfolio'
    ) as Array<{symbol:string; buy_price:number; quantity:number}>;
    
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
    const rows = executeQuery(
      `SELECT buy_date as date, SUM(buy_price*quantity) invested FROM portfolio GROUP BY buy_date ORDER BY buy_date ASC`,
      [],
      'SELECT',
      'portfolio'
    ) as Array<{date:string; invested:number}>;
    
    let cumInvested = 0;
    const series: Array<{ date:string; invested:number; current:number }> = [];
    
    for (const r of rows) {
      cumInvested += r.invested;
      // compute current using latest prices for all holdings up to this date
      const held = executeQuery(
        `SELECT symbol, buy_price, quantity FROM portfolio WHERE buy_date <= ?`,
        [r.date],
        'SELECT',
        'portfolio'
      ) as Array<{symbol:string; buy_price:number; quantity:number}>;
      
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
    return executeQuery(
      `INSERT INTO alerts(symbol, kind, level, triggered_at, note, created_at, last_eval, baseline_price, baseline_date, active) VALUES(?,?,?,?,?,?,?,?,?,1)`,
      [row.symbol, row.kind, row.level, null, row.note ?? null, new Date().toISOString(), null, baseline_price, baseline_date],
      'INSERT',
      'alerts'
    );
  } catch (err) { logger.warn({ err, symbol: row.symbol }, 'alert_add_failed'); }
}

export function listAlerts(limit = 100) {
  try { 
    return executeQuery(
      `SELECT id, symbol, kind, level, triggered_at, note, created_at, last_eval, baseline_price, baseline_date, active FROM alerts ORDER BY created_at DESC LIMIT ?`,
      [limit],
      'SELECT',
      'alerts'
    ); 
  } catch { return []; }
}

export function listActiveAlerts(): Array<any> {
  try { 
    return executeQuery(
      `SELECT id, symbol, kind, level, triggered_at, baseline_price, baseline_date FROM alerts WHERE active=1`,
      [],
      'SELECT',
      'alerts'
    ) as Array<any>; 
  } catch { return []; }
}

export function markAlertEvaluated(id: number) {
  try { 
    return executeQuery(
      `UPDATE alerts SET last_eval=? WHERE id=?`,
      [new Date().toISOString(), id],
      'UPDATE',
      'alerts'
    ); 
  } catch {}
}

export function triggerAlert(id: number, info?: { note?: string }) {
  try { 
    return executeQuery(
      `UPDATE alerts SET triggered_at=?, active=0, note=COALESCE(note, ?) WHERE id=?`,
      [new Date().toISOString(), info?.note ?? null, id],
      'UPDATE',
      'alerts'
    ); 
  } catch {}
}

export function insertRssNews(row: { id:string; symbol:string|null; title:string; summary:string; url:string; published_at:string; sentiment:number|null }) {
  try {
    return executeQuery(
      `INSERT OR IGNORE INTO rss_news(id, symbol, title, summary, url, published_at, sentiment) VALUES(?,?,?,?,?,?,?)`,
      [row.id, row.symbol, row.title, row.summary, row.url, row.published_at, row.sentiment ?? null],
      'INSERT',
      'rss_news'
    );
  } catch (err) { logger.warn({ err, id: row.id }, 'rss_news_insert_failed'); }
}

export function listRssNews(limit = 50) {
  try { 
    return executeQuery(
      `SELECT id, symbol, title, summary, url, published_at, sentiment FROM rss_news ORDER BY published_at DESC LIMIT ?`,
      [limit],
      'SELECT',
      'rss_news'
    ); 
  } catch { return []; }
}

export function insertProviderData(row: { provider_id:string; symbol:string; captured_at:string; payload:any }) {
  try {
    return executeQuery(
      `INSERT INTO provider_data(provider_id,symbol,captured_at,payload) VALUES(?,?,?,?)`,
      [row.provider_id, row.symbol, row.captured_at, JSON.stringify(row.payload)],
      'INSERT',
      'provider_data'
    );
  } catch (err) { logger.warn({ err, provider: row.provider_id }, 'provider_data_insert_failed'); }
}

export function listProviderData(symbol: string, provider_id?: string, limit = 20) {
  try {
    let rows;
    if (provider_id) {
      rows = executeQuery(
        `SELECT provider_id, symbol, captured_at, payload FROM provider_data WHERE symbol=? AND provider_id=? ORDER BY captured_at DESC LIMIT ?`,
        [symbol, provider_id, limit],
        'SELECT',
        'provider_data'
      );
    } else {
      rows = executeQuery(
        `SELECT provider_id, symbol, captured_at, payload FROM provider_data WHERE symbol=? ORDER BY captured_at DESC LIMIT ?`,
        [symbol, limit],
        'SELECT',
        'provider_data'
      );
    }
    return (rows as any[]).map((r:any)=> ({ ...r, payload: safeJson(r.payload) }));
  } catch { return []; }
}

export function removePortfolioEntry(id: number) {
  try { 
    return executeQuery(
      `DELETE FROM portfolio WHERE id=?`,
      [id],
      'DELETE',
      'portfolio'
    ); 
  } catch (err) { logger.warn({ err, id }, 'portfolio_delete_failed'); }
}

export function removeWatchlistSymbol(symbol: string) {
  try { 
    return executeQuery(
      `DELETE FROM watchlist WHERE symbol=?`,
      [symbol],
      'DELETE',
      'watchlist'
    ); 
  } catch (err) { logger.warn({ err, symbol }, 'watchlist_delete_failed'); }
}

export function removeAlert(id: number) {
  try { 
    return executeQuery(
      `DELETE FROM alerts WHERE id=?`,
      [id],
      'DELETE',
      'alerts'
    ); 
  } catch (err) { logger.warn({ err, id }, 'alert_delete_failed'); }
}

export function upsertProvider(row: { id:string; name:string; kind:string; enabled:boolean; rag_enabled?:boolean; config?:any }) {
  try {
    const now = new Date().toISOString();
    return executeQuery(
      `INSERT INTO providers(id,name,kind,enabled,rag_enabled,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, enabled=excluded.enabled, rag_enabled=excluded.rag_enabled, config=excluded.config, updated_at=excluded.updated_at`,
      [row.id, row.name, row.kind, row.enabled ? 1 : 0, row.rag_enabled ? 1 : 0, row.config ? JSON.stringify(row.config) : null, now, now],
      'UPSERT',
      'providers'
    );
  } catch (err) { logger.warn({ err, id: row.id }, 'provider_upsert_failed'); }
}

export function latestFeature(symbol: string): { date:string; rsi:number|null } | null {
  try {
    const rows = executeQuery(
      `SELECT date, rsi FROM features WHERE symbol=? AND rsi IS NOT NULL ORDER BY date DESC LIMIT 1`,
      [symbol],
      'SELECT',
      'features'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return { date: String(row.date), rsi: row.rsi !== null && row.rsi !== undefined ? Number(row.rsi) : null };
  } catch { return null; }
}

export function insertProviderRun(row: { provider_id:string; started_at:string; finished_at:string; duration_ms:number; success:boolean; error_count:number; items:any; rag_indexed:number; meta?:any }): number {
  try {
    const result = executeQuery(
      `INSERT INTO provider_runs(provider_id,started_at,finished_at,duration_ms,success,error_count,items_json,rag_indexed,meta_json) VALUES(?,?,?,?,?,?,?,?,?)`,
      [row.provider_id,row.started_at,row.finished_at,row.duration_ms,row.success?1:0,row.error_count, JSON.stringify(row.items||null), row.rag_indexed, row.meta?JSON.stringify(row.meta):null],
      'INSERT',
      'provider_runs'
    );
    return Number((result as any).lastInsertRowid);
  } catch (err) { logger.warn({ err, provider: row.provider_id }, 'provider_run_insert_failed'); return 0; }
}

export function insertProviderRunBatch(run_id: number, batch: { batch_index:number; batch_size:number; duration_ms:number; symbols:string[] }) {
  try {
    return executeQuery(
      `INSERT INTO provider_run_batches(run_id,batch_index,batch_size,duration_ms,symbols_json,created_at) VALUES(?,?,?,?,?,?)`,
      [run_id, batch.batch_index, batch.batch_size, batch.duration_ms, JSON.stringify(batch.symbols||[]), new Date().toISOString()],
      'INSERT',
      'provider_run_batches'
    );
  } catch (err) { logger.warn({ err, run_id, batch_index: batch.batch_index }, 'provider_run_batch_insert_failed'); }
}

export function listProviderRunsPaged(provider_id: string, limit=20, offset=0) {
  try {
    const rows = executeQuery(
      `SELECT id,provider_id,started_at,finished_at,duration_ms,success,error_count,items_json,rag_indexed,meta_json FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [provider_id, limit, offset],
      'SELECT',
      'provider_runs'
    );
    return (rows as any[]).map((r:any)=> ({ ...r, items: safeJson(r.items_json), meta: safeJson(r.meta_json) }));
  } catch { return []; }
}

export function listProviderRunBatches(run_id: number) {
  try { 
    const rows = executeQuery(
      `SELECT id, batch_index, batch_size, duration_ms, symbols_json, created_at FROM provider_run_batches WHERE run_id=? ORDER BY batch_index ASC`,
      [run_id],
      'SELECT',
      'provider_run_batches'
    );
    return (rows as any[]).map((r:any)=> ({ ...r, symbols: safeJson(r.symbols_json)||[] })); 
  } catch { return []; }
}

export function insertProviderRunError(run_id: number, symbol: string|undefined, error: string) {
  try { 
    return executeQuery(
      `INSERT INTO provider_run_errors(run_id,symbol,error,created_at) VALUES(?,?,?,?)`,
      [run_id, symbol||null, error, new Date().toISOString()],
      'INSERT',
      'provider_run_errors'
    ); 
  } catch {}
}

export function listRecentProviderRuns(provider_id: string, limit=20) {
  try { 
    const rows = executeQuery(
      `SELECT id,provider_id,started_at,finished_at,duration_ms,success,error_count,items_json,rag_indexed,meta_json FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ?`,
      [provider_id, limit],
      'SELECT',
      'provider_runs'
    );
    return (rows as any[]).map((r:any)=> ({ ...r, items: safeJson(r.items_json), meta: safeJson(r.meta_json) })); 
  } catch { return []; }
}

export function listProviderRunErrors(provider_id: string, run_id?: number, limit=50) {
  try {
    if (Number.isFinite(run_id)) {
      return executeQuery(
        `SELECT id, run_id, symbol, error, created_at FROM provider_run_errors WHERE run_id=? ORDER BY id DESC LIMIT ?`,
        [run_id, limit],
        'SELECT',
        'provider_run_errors'
      );
    }
    return executeQuery(
      `SELECT e.id, e.run_id, e.symbol, e.error, e.created_at FROM provider_run_errors e JOIN provider_runs r ON e.run_id=r.id WHERE r.provider_id=? ORDER BY e.id DESC LIMIT ?`,
      [provider_id, limit],
      'SELECT',
      'provider_run_errors'
    );
  } catch { return []; }
}

export function getProviderLastSuccess(provider_id: string): string | null {
  try {
    const rows = executeQuery(
      `SELECT finished_at FROM provider_runs WHERE provider_id=? AND success=1 ORDER BY finished_at DESC LIMIT 1`,
      [provider_id],
      'SELECT',
      'provider_runs'
    );
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
    return String(rows[0].finished_at);
  } catch { return null; }
}

export function getProviderConsecutiveFailures(provider_id: string, limit=50): number {
  try {
    const rows = executeQuery(
      `SELECT success FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ?`,
      [provider_id, limit],
      'SELECT',
      'provider_runs'
    ) as Array<{success:number}>;
    
    let count = 0;
    for (const r of rows) { if (r.success) break; else count++; }
    return count;
  } catch { return 0; }
}

export function aggregateProviderPerformance(provider_id: string, runLimit=50) {
  try {
    const runs = executeQuery(
      `SELECT id, success, duration_ms, meta_json FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT ?`,
      [provider_id, runLimit],
      'SELECT',
      'provider_runs'
    ) as Array<any>;
    
    if (!runs.length) return { provider_id, runs:0, successRate:0, avgDurationMs:0, avgBatchMs:0, avgBatchSize:0, topSymbols:[] as any[] };
    
    let success=0; let durSum=0; const runIds:number[]=[]; const symbolAgg: Record<string,{ ms:number; count:number }> = {}; let batchDurSum=0; let batchCount=0; let batchSizeSum=0;
    
    for (const r of runs) {
      if (r.success) success++; durSum += r.duration_ms||0; runIds.push(r.id);
      let meta:any=null; try { meta = r.meta_json? JSON.parse(String(r.meta_json)) : null; } catch {}
      const st = meta?.symbolTimings || {};
      for (const [sym, ms] of Object.entries(st)) {
        if (!symbolAgg[sym]) symbolAgg[sym] = { ms:0, count:0 }; symbolAgg[sym].ms += Number(ms)||0; symbolAgg[sym].count++;
      }
    }
    
    if (runIds.length) {
      const batchRows = executeQuery(
        `SELECT duration_ms, batch_size FROM provider_run_batches WHERE run_id IN (${runIds.map(()=>'?').join(',')})`,
        runIds,
        'SELECT',
        'provider_run_batches'
      ) as Array<any>;
      for (const b of batchRows) { batchDurSum += b.duration_ms||0; batchCount++; batchSizeSum += b.batch_size||0; }
    }
    
    const topSymbols = Object.entries(symbolAgg).map(([sym,v])=> ({ symbol:sym, avgMs: v.ms / v.count })).sort((a,b)=> b.avgMs - a.avgMs).slice(0,10);
    
    return {
      provider_id,
      runs: runs.length,
      successRate: runs.length? success / runs.length : 0,
      avgDurationMs: runs.length? durSum / runs.length : 0,
      avgBatchMs: batchCount? batchDurSum / batchCount : 0,
      avgBatchSize: batchCount? batchSizeSum / batchCount : 0,
      topSymbols
    };
  } catch { return { provider_id, runs:0, successRate:0, avgDurationMs:0, avgBatchMs:0, avgBatchSize:0, topSymbols:[] as any[] }; }
}

export function aggregateAllProvidersPerformance(runLimit=50) {
  try {
    const rows = executeQuery(
      `SELECT id FROM providers`,
      [],
      'SELECT',
      'providers'
    );
    const ids = (rows as any[]).map((r:any)=> String(r.id));
    return ids.map(id => aggregateProviderPerformance(id, runLimit));
  } catch { return []; }
}

export function pruneProviderRuns(days: number) {
  if (!Number.isFinite(days) || days <= 0) return { runs:0, batches:0, errors:0 };
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  
  try {
    let runsDel=0, batchesDel=0, errorsDel=0;
    
    const transaction = db.transaction(()=> {
      const oldRunIds = executeQuery(
        `SELECT id FROM provider_runs WHERE started_at < ?`,
        [cutoff],
        'SELECT',
        'provider_runs'
      ).map((r:any)=> r.id);
      
      if (oldRunIds.length) {
        const placeholders = oldRunIds.map(()=>'?').join(',');
        
        const errorsResult = executeQuery(
          `DELETE FROM provider_run_errors WHERE run_id IN (${placeholders})`,
          oldRunIds,
          'DELETE',
          'provider_run_errors'
        );
        errorsDel = (errorsResult as any).changes || 0;
        
        const batchesResult = executeQuery(
          `DELETE FROM provider_run_batches WHERE run_id IN (${placeholders})`,
          oldRunIds,
          'DELETE',
          'provider_run_batches'
        );
        batchesDel = (batchesResult as any).changes || 0;
        
        const runsResult = executeQuery(
          `DELETE FROM provider_runs WHERE id IN (${placeholders})`,
          oldRunIds,
          'DELETE',
          'provider_runs'
        );
        runsDel = (runsResult as any).changes || 0;
      }
    });
    
    transaction();
    return { runs: runsDel, batches: batchesDel, errors: errorsDel };
  } catch { return { runs:0, batches:0, errors:0 }; }
}

export function pruneProviderData(provider_id: string, opts: { keepPerSymbol?: number; maxAgeDays?: number } = {}) {
  const keep = Number.isFinite(opts.keepPerSymbol) ? Number(opts.keepPerSymbol) : 5;
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? Number(opts.maxAgeDays) : 0; // 0 = ignore
  let deleted = 0;
  
  try {
    const symbols = executeQuery(
      `SELECT DISTINCT symbol FROM provider_data WHERE provider_id=?`,
      [provider_id],
      'SELECT',
      'provider_data'
    ).map((r:any)=> String(r.symbol));
    
    const cutoffIso = maxAgeDays > 0 ? new Date(Date.now() - maxAgeDays*86400000).toISOString() : '';
    
    // Fallback simpler strategy per symbol (two passes)
    for (const sym of symbols) {
      const rows = executeQuery(
        `SELECT rowid, captured_at FROM provider_data WHERE provider_id=? AND symbol=? ORDER BY captured_at DESC`,
        [provider_id, sym],
        'SELECT',
        'provider_data'
      ) as Array<{rowid:number; captured_at:string}>;
      
      const excess = rows.slice(keep);
      for (const r of excess) {
        if (!cutoffIso || r.captured_at < cutoffIso) {
          try { 
            executeQuery(
              `DELETE FROM provider_data WHERE rowid=?`,
              [r.rowid],
              'DELETE',
              'provider_data'
            );
            deleted++; 
          } catch {}
        }
      }
      
      if (maxAgeDays > 0) {
        const old = rows.filter(r => r.captured_at < cutoffIso && !excess.find(e=>e.rowid===r.rowid));
        for (const r of old) { 
          try { 
            executeQuery(
              `DELETE FROM provider_data WHERE rowid=?`,
              [r.rowid],
              'DELETE',
              'provider_data'
            );
            deleted++; 
          } catch {} 
        }
      }
    }
  } catch (err) { logger.warn({ err, provider_id }, 'prune_provider_data_failed'); }
  
  return { deleted };
}

function safeJson(x: any) { 
  try { return JSON.parse(String(x)); } catch { return null; } 
}

// Cleanup function to be called on app shutdown
export function cleanup() {
  // Flush any remaining batched operations
  flushBatchedOperations();
  
  // Clear prepared statements cache
  preparedStatements.clear();
  
  // Close database connection
  if (db) {
    db.close();
    logger.info('database_connection_closed');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('exit', cleanup);
