import { logger } from '../../utils/logger.js';

// Lazy require to avoid dependency when not using PG
type PgClient = any;

export interface PgAdapterOptions {
  url?: string; // postgres connection string
}

export class PgAdapter {
  private url: string;
  private client: PgClient | null = null;
  constructor(opts?: PgAdapterOptions) {
    this.url = opts?.url || process.env.PG_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
  }
  kind() { return 'pg' as const; }
  async init() {
    if (this.client) return;
    try {
      const pg = await import('pg');
      const { Client } = pg;
      this.client = new Client({ connectionString: this.url });
      await this.client.connect();
      logger.info({ url: this.redact(this.url) }, 'pg_connected');
      await this.ensureSchema();
    } catch (err) {
      logger.error({ err }, 'pg_connect_failed');
      throw err;
    }
  }
  private redact(u: string) {
    try { const x = new URL(u); if (x.password) x.password='***'; return x.toString(); } catch { return u; }
  }
  private async ensureSchema() {
    // Minimal placeholder. Full DDL parity with sqlite to be implemented.
    const sql = `CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)`;
    await this.client!.query(sql);
    logger.info('pg_base_schema_ready');
  }
  // Placeholder method parity (throw until implemented)
  upsertStock(_symbol: string, _name?: string) { throw new Error('pg upsertStock not implemented yet'); }
  insertPriceRow(_row: any) { throw new Error('pg insertPriceRow not implemented yet'); }
  insertNewsRow(_row: any) { throw new Error('pg insertNewsRow not implemented yet'); }
  insertDocRow(_symbol: string, _chunk: string, _termsJson: string) { throw new Error('pg insertDocRow not implemented yet'); }
  listPrices(_symbol: string, _limit = 365) { throw new Error('pg listPrices not implemented yet'); }
  listNews(_symbol: string, _limit = 30) { throw new Error('pg listNews not implemented yet'); }
  upsertMcTech(_symbol: string, _freq: 'D'|'W'|'M', _data: any) { throw new Error('pg upsertMcTech not implemented yet'); }
  getMcTech(_symbol: string, _freq: 'D'|'W'|'M') { throw new Error('pg getMcTech not implemented yet'); }
  latestPrice(_symbol: string) { throw new Error('pg latestPrice not implemented yet'); }
  saveAnalysis(_a: any) { throw new Error('pg saveAnalysis not implemented yet'); }
  upsertOptionsMetrics(_row: any) { throw new Error('pg upsertOptionsMetrics not implemented yet'); }
  getLatestOptionsBias(_symbol: string) { return null; }
  listOptionsMetrics(_symbol: string, _opts?: any) { return []; }
  upsertFeaturesRow(_row: any) { throw new Error('pg upsertFeaturesRow not implemented yet'); }
  insertBacktestRun(_row: any) { throw new Error('pg insertBacktestRun not implemented yet'); }
  getBacktestRun(_id: string) { return null; }
  listNewsSince(_symbol: string, _cutoffIso: string) { return []; }
  upsertTlCache(_tlid: string, _kind: 'sma'|'adv', _data: any) { throw new Error('pg upsertTlCache not implemented yet'); }
  getTlCache(_tlid: string, _kind: 'sma'|'adv') { return null; }
  addWatchlistSymbol(_symbol: string) { throw new Error('pg addWatchlistSymbol not implemented yet'); }
  listWatchlistSymbols() { return []; }
  addPortfolioEntry(_row: any) { throw new Error('pg addPortfolioEntry not implemented yet'); }
  listPortfolioEntries() { return []; }
}

export async function createPgAdapter() {
  const a = new PgAdapter();
  await a.init();
  return a;
}
