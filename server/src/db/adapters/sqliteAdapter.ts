import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';

export type SqliteRaw = any; // better-sqlite3 Database type (avoid direct dependency elsewhere)

export class SqliteAdapter {
  private db: SqliteRaw;
  private DB_PATH: string;
  constructor(file?: string) {
    this.DB_PATH = file || path.resolve(process.cwd(), 'stock.db');
    this.db = new Database(this.DB_PATH);
    this.db.pragma('journal_mode = WAL');
    logger.info({ DB_PATH: this.DB_PATH }, 'sqlite_db_opened');
    this.runMigrations();
    this.postInitPatches();
  }
  kind() { return 'sqlite' as const; }
  raw() { return this.db; }

  private runMigrations() {
    // Re-uses simple runner from original file
    try {
      const here = path.dirname(new URL(import.meta.url).pathname);
      // Migrations live under server/src/db/migrations relative to root src/db.ts originally – compute root
      const migDir = path.resolve(process.cwd(), 'server', 'src', 'db', 'migrations');
      if (!fs.existsSync(migDir)) return;
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)');
      const applied = new Set<string>(this.db.prepare('SELECT version FROM schema_migrations').all().map((r: any)=> String(r.version)));
      const files = fs.readdirSync(migDir).filter(f => /\.sql$/i.test(f)).sort();
      for (const f of files) {
        if (applied.has(f)) continue;
        const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
        this.db.exec('BEGIN');
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(f, new Date().toISOString());
        this.db.exec('COMMIT');
        logger.info({ migration: f }, 'sqlite_db_migration_applied');
      }
    } catch (err) {
      logger.error({ err }, 'sqlite_db_migration_failed');
      throw err;
    }
  }

  private postInitPatches() {
    // Inline schema from original db.ts (idempotent CREATE IF NOT EXISTS). Keep minimal duplication.
    try {
      // Alerts backward compatible columns
      try {
        const cols = new Set<string>(this.db.prepare(`PRAGMA table_info(alerts)`).all().map((r:any)=> String(r.name)));
        const missing: Array<[string,string]> = [];
        if (!cols.has('created_at')) missing.push(['created_at','TEXT']);
        if (!cols.has('last_eval')) missing.push(['last_eval','TEXT']);
        if (!cols.has('baseline_price')) missing.push(['baseline_price','REAL']);
        if (!cols.has('baseline_date')) missing.push(['baseline_date','TEXT']);
        if (!cols.has('active')) missing.push(['active','INTEGER DEFAULT 1']);
        for (const [c,t] of missing) { try { this.db.exec(`ALTER TABLE alerts ADD COLUMN ${c} ${t}`); logger.info({ column:c }, 'alerts_column_added'); } catch {} }
      } catch {}
      this.db.exec(`
CREATE TABLE IF NOT EXISTS stocks( symbol TEXT PRIMARY KEY, name TEXT );
CREATE TABLE IF NOT EXISTS prices( symbol TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER, PRIMARY KEY(symbol, date) );
CREATE TABLE IF NOT EXISTS news( id TEXT PRIMARY KEY, symbol TEXT, date TEXT, title TEXT, summary TEXT, url TEXT, sentiment REAL );
CREATE INDEX IF NOT EXISTS news_symbol_date ON news(symbol, date);
CREATE INDEX IF NOT EXISTS prices_date_idx ON prices(date);
CREATE TABLE IF NOT EXISTS mc_tech( symbol TEXT, freq TEXT, data TEXT, updated_at TEXT, PRIMARY KEY(symbol, freq) );
CREATE TABLE IF NOT EXISTS docs( id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, chunk TEXT, terms TEXT );
CREATE INDEX IF NOT EXISTS docs_symbol_idx ON docs(symbol);
CREATE TABLE IF NOT EXISTS rag_embeddings( ns TEXT, id TEXT, text TEXT, metadata TEXT, vector TEXT, PRIMARY KEY(ns, id) );
CREATE TABLE IF NOT EXISTS rag_url_status( ns TEXT, url TEXT, last_indexed TEXT, status TEXT, note TEXT, PRIMARY KEY(ns, url) );
CREATE TABLE IF NOT EXISTS analyses( id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, created_at TEXT, sentiment_score REAL, predicted_close REAL, strategy JSON, score REAL, recommendation TEXT );
CREATE INDEX IF NOT EXISTS analyses_symbol_idx ON analyses(symbol);
CREATE TABLE IF NOT EXISTS options_metrics( symbol TEXT, date TEXT, pcr REAL, pvr REAL, bias REAL, PRIMARY KEY(symbol, date) );
CREATE INDEX IF NOT EXISTS options_metrics_symbol_idx ON options_metrics(symbol);
CREATE TABLE IF NOT EXISTS top_picks_history( snapshot_date TEXT, symbol TEXT, score REAL, momentum REAL, sentiment REAL, mc_score REAL, recommendation TEXT, created_at TEXT, PRIMARY KEY(snapshot_date, symbol) );
CREATE INDEX IF NOT EXISTS tph_date_idx ON top_picks_history(snapshot_date);
CREATE INDEX IF NOT EXISTS tph_symbol_idx ON top_picks_history(symbol);
CREATE TABLE IF NOT EXISTS watchlist( symbol TEXT PRIMARY KEY, added_at TEXT );
CREATE TABLE IF NOT EXISTS portfolio( id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, buy_date TEXT, buy_price REAL, quantity REAL, created_at TEXT );
CREATE INDEX IF NOT EXISTS portfolio_symbol_idx ON portfolio(symbol);
CREATE INDEX IF NOT EXISTS portfolio_buy_date_idx ON portfolio(buy_date);
CREATE TABLE IF NOT EXISTS alerts( id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, kind TEXT, level REAL, triggered_at TEXT, note TEXT, created_at TEXT, last_eval TEXT, baseline_price REAL, baseline_date TEXT, active INTEGER DEFAULT 1 );
CREATE INDEX IF NOT EXISTS alerts_symbol_idx ON alerts(symbol);
CREATE TABLE IF NOT EXISTS rss_news( id TEXT PRIMARY KEY, symbol TEXT, title TEXT, summary TEXT, url TEXT, published_at TEXT, sentiment REAL );
CREATE INDEX IF NOT EXISTS rss_symbol_idx ON rss_news(symbol);
CREATE INDEX IF NOT EXISTS rss_published_idx ON rss_news(published_at);
CREATE TABLE IF NOT EXISTS provider_data( provider_id TEXT, symbol TEXT, captured_at TEXT, payload TEXT, PRIMARY KEY(provider_id, symbol, captured_at) );
CREATE INDEX IF NOT EXISTS provider_data_symbol_idx ON provider_data(symbol);
CREATE TABLE IF NOT EXISTS providers( id TEXT PRIMARY KEY, name TEXT, kind TEXT, enabled INTEGER, rag_enabled INTEGER, config TEXT, created_at TEXT, updated_at TEXT );
`);
      logger.info('sqlite_db_schema_ready');
    } catch (err) { logger.error({ err }, 'sqlite_db_schema_failed'); throw err; }
  }

  // --- Helper methods mirrored from original db.ts ---
  upsertStock(symbol: string, name?: string) {
    try { this.db.prepare(`INSERT INTO stocks(symbol,name) VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name`).run(symbol, name ?? symbol); }
    catch (err) { logger.error({ err, symbol }, 'stock_upsert_failed'); throw err; }
  }
  insertPriceRow(row: {symbol:string,date:string,open:number,high:number,low:number,close:number,volume:number}) {
    try { this.db.prepare(`INSERT OR REPLACE INTO prices(symbol,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)`).run(row.symbol,row.date,row.open,row.high,row.low,row.close,row.volume); }
    catch (err) { logger.error({ err, row }, 'price_insert_failed'); throw err; }
  }
  insertNewsRow(row: {id:string, symbol:string, date:string, title:string, summary:string, url:string, sentiment:number}) {
    try { this.db.prepare(`INSERT OR REPLACE INTO news(id,symbol,date,title,summary,url,sentiment) VALUES(?,?,?,?,?,?,?)`).run(row.id,row.symbol,row.date,row.title,row.summary,row.url,row.sentiment); }
    catch (err) { logger.error({ err, row }, 'news_insert_failed'); throw err; }
  }
  insertDocRow(symbol: string, chunk: string, termsJson: string) {
    try { this.db.prepare(`INSERT INTO docs(symbol,chunk,terms) VALUES(?,?,?)`).run(symbol, chunk, termsJson); }
    catch (err) { logger.error({ err, symbol }, 'doc_insert_failed'); throw err; }
  }
  listPrices(symbol: string, limit = 365) {
    try { return this.db.prepare(`SELECT date, open, high, low, close, volume FROM prices WHERE symbol=? ORDER BY date ASC LIMIT ?`).all(symbol, limit); }
    catch (err) { logger.error({ err, symbol, limit }, 'prices_query_failed'); throw err; }
  }
  listNews(symbol: string, limit = 30) {
    try { return this.db.prepare(`SELECT id, date, title, summary, url, sentiment FROM news WHERE symbol=? ORDER BY date DESC LIMIT ?`).all(symbol, limit); }
    catch (err) { logger.error({ err, symbol, limit }, 'news_query_failed'); throw err; }
  }
  upsertMcTech(symbol: string, freq: 'D'|'W'|'M', data: any) {
    try { this.db.prepare(`INSERT INTO mc_tech(symbol,freq,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(symbol,freq) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(symbol,freq,JSON.stringify(data), new Date().toISOString()); }
    catch (err) { logger.error({ err, symbol, freq }, 'mc_tech_upsert_failed'); throw err; }
  }
  getMcTech(symbol: string, freq: 'D'|'W'|'M') {
    try { const row = this.db.prepare(`SELECT data FROM mc_tech WHERE symbol=? AND freq=?`).get(symbol,freq); return row ? JSON.parse(String(row.data)) : null; } catch (err) { logger.error({ err, symbol, freq }, 'mc_tech_get_failed'); throw err; }
  }
  latestPrice(symbol: string) { try { const row = this.db.prepare(`SELECT date, close FROM prices WHERE symbol=? ORDER BY date DESC LIMIT 1`).get(symbol); return row ? { date: String(row.date), close: Number(row.close) } : null; } catch (err) { logger.error({ err, symbol }, 'latest_price_query_failed'); throw err; } }
  saveAnalysis(a: {symbol:string, created_at:string, sentiment_score:number, predicted_close:number, strategy:any, score:number, recommendation:string}) {
    try { this.db.prepare(`INSERT INTO analyses(symbol,created_at,sentiment_score,predicted_close,strategy,score,recommendation) VALUES(?,?,?,?,?,?,?)`).run(a.symbol,a.created_at,a.sentiment_score,a.predicted_close,JSON.stringify(a.strategy),a.score,a.recommendation); } catch (err) { logger.error({ err, symbol:a.symbol }, 'analysis_insert_failed'); throw err; }
  }
  upsertOptionsMetrics(row: { symbol: string; date: string; pcr: number|null; pvr: number|null; bias: number|null }) { try { this.db.prepare(`INSERT OR REPLACE INTO options_metrics(symbol,date,pcr,pvr,bias) VALUES(?,?,?,?,?)`).run(row.symbol,row.date,row.pcr ?? null,row.pvr ?? null,row.bias ?? null); } catch (err) { logger.warn({ err, symbol: row.symbol }, 'options_metrics_upsert_failed'); } }
  getLatestOptionsBias(symbol: string) { try { const r = this.db.prepare(`SELECT bias FROM options_metrics WHERE symbol=? ORDER BY date DESC LIMIT 1`).get(symbol) as {bias:number}|undefined; const b=r?.bias; return (typeof b==='number' && Number.isFinite(b))? b:null; } catch { return null; } }
  listOptionsMetrics(symbol: string, opts?: { days?: number; limit?: number }) {
    try { const days = Number.isFinite(Number(opts?.days))? Number(opts?.days):30; const limit = Number.isFinite(Number(opts?.limit))? Math.max(1, Math.min(365, Number(opts?.limit))):90; const cutoff = new Date(Date.now()-Math.max(1,days)*86400000).toISOString().slice(0,10); return this.db.prepare(`SELECT date,pcr,pvr,bias FROM options_metrics WHERE symbol=? AND date>=? ORDER BY date ASC LIMIT ?`).all(symbol,cutoff,limit); } catch (err) { logger.warn({ err, symbol, opts }, 'options_metrics_query_failed'); return []; } }
  upsertFeaturesRow(row: { symbol: string; date: string; ret1?: number|null; ret5?: number|null; ret20?: number|null; vol?: number|null; rsi?: number|null; sma20?: number|null; ema50?: number|null; momentum?: number|null; sent_avg?: number|null; pcr?: number|null; pvr?: number|null }) {
    try { this.db.prepare(`INSERT INTO features(symbol,date,ret1,ret5,ret20,vol,rsi,sma20,ema50,momentum,sent_avg,pcr,pvr) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,date) DO UPDATE SET ret1=excluded.ret1, ret5=excluded.ret5, ret20=excluded.ret20, vol=excluded.vol, rsi=excluded.rsi, sma20=excluded.sma20, ema50=excluded.ema50, momentum=excluded.momentum, sent_avg=excluded.sent_avg, pcr=excluded.pcr, pvr=excluded.pvr`).run(row.symbol,row.date,row.ret1 ?? null,row.ret5 ?? null,row.ret20 ?? null,row.vol ?? null,row.rsi ?? null,row.sma20 ?? null,row.ema50 ?? null,row.momentum ?? null,row.sent_avg ?? null,row.pcr ?? null,row.pvr ?? null); } catch (err) { logger.warn({ err, symbol: row.symbol }, 'features_upsert_failed'); } }
  insertBacktestRun(row: { id: string; status: string; cfg: any; metrics?: any; equity?: any }) { try { const now = new Date().toISOString(); this.db.prepare(`INSERT INTO backtests(id,status,cfg,metrics,equity,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, metrics=excluded.metrics, equity=excluded.equity, updated_at=excluded.updated_at`).run(row.id,row.status,JSON.stringify(row.cfg||{}),JSON.stringify(row.metrics||null),JSON.stringify(row.equity||null),now,now); } catch (err) { logger.warn({ err, id: row.id }, 'backtest_insert_failed'); } }
  getBacktestRun(id: string) { try { const row = this.db.prepare(`SELECT id,status,cfg,metrics,equity,created_at,updated_at FROM backtests WHERE id=?`).get(id); if (!row) return null; try { row.cfg = row.cfg? JSON.parse(String(row.cfg)):null; row.metrics = row.metrics? JSON.parse(String(row.metrics)):null; row.equity = row.equity? JSON.parse(String(row.equity)):null; } catch {} return row; } catch { return null; } }
  listNewsSince(symbol: string, cutoffIso: string) { try { return this.db.prepare(`SELECT id,symbol,date,title,summary,url,sentiment FROM news WHERE symbol=? AND date>=? ORDER BY date ASC`).all(symbol, cutoffIso); } catch { return []; } }
  upsertTlCache(tlid: string, kind: 'sma'|'adv', data: any) { try { this.db.prepare(`INSERT INTO tl_cache(tlid,kind,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(tlid,kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(tlid,kind,JSON.stringify(data ?? null), new Date().toISOString()); } catch (err) { logger.warn({ err, tlid, kind }, 'tl_cache_upsert_failed'); } }
  getTlCache(tlid: string, kind: 'sma'|'adv') { try { const row = this.db.prepare(`SELECT data FROM tl_cache WHERE tlid=? AND kind=?`).get(tlid,kind); return row? JSON.parse(String(row.data)): null; } catch { return null; } }
  addWatchlistSymbol(symbol: string) { try { this.db.prepare(`INSERT OR IGNORE INTO watchlist(symbol,added_at) VALUES(?,?)`).run(symbol,new Date().toISOString()); } catch (err) { logger.warn({ err, symbol }, 'watchlist_add_failed'); } }
  listWatchlistSymbols() { try { return this.db.prepare(`SELECT symbol, added_at FROM watchlist ORDER BY added_at ASC`).all(); } catch { return []; } }
  addPortfolioEntry(row: { symbol:string; buy_date:string; buy_price:number; quantity:number }) { try { this.db.prepare(`INSERT INTO portfolio(symbol,buy_date,buy_price,quantity,created_at) VALUES(?,?,?,?,?)`).run(row.symbol,row.buy_date,row.buy_price,row.quantity,new Date().toISOString()); } catch (err) { logger.warn({ err, symbol: row.symbol }, 'portfolio_add_failed'); } }
  listPortfolioEntries() { try { return this.db.prepare(`SELECT id,symbol,buy_date,buy_price,quantity FROM portfolio ORDER BY buy_date ASC`).all(); } catch { return []; } }
}

export function createSqliteAdapter() { return new SqliteAdapter(); }
