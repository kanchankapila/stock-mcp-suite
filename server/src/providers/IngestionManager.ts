import { ProviderRegistry, ProviderConfigEntry } from './ProviderRegistry.js';
import { BaseProvider, IngestionOptions, IngestionResult } from './BaseProvider.js';
import { LangChainRagIndexer } from './RagIndexer.js';
import { logger } from '../utils/logger.js';
import { applyIngestionResult } from './applyIngestionResult.js';
import { RateLimiter } from './RateLimiter.js';
import { getProviderLastSuccess, getProviderConsecutiveFailures } from '../db.js';

// Global simple semaphore queue
const MAX_CONCURRENCY = Number(process.env.INGEST_CONCURRENCY || 2);
let active = 0; 
const waiters: Array<()=>void> = [];
function acquire(): Promise<void> { 
  return new Promise(res => { 
    if (active < MAX_CONCURRENCY) { 
      active++; 
      return res(); 
    } 
    waiters.push(()=>{ 
      active++; 
      res(); 
    }); 
  }); 
}
function release() { 
  active = Math.max(0, active-1); 
  const n = waiters.shift(); 
  if (n) n(); 
}

interface RunOptions { providerId: string; symbols?: string[]; rag?: boolean; dryRun?: boolean; apiKey?: string; }

export class IngestionManager {
  private ragIndexer = new LangChainRagIndexer();
  async run(opts: RunOptions): Promise<IngestionResult & { persisted?: { prices:number; news:number; providerData:number; ragDocs:number; durationMs:number } }> {
    const prov: BaseProvider | null = ProviderRegistry.get(opts.providerId);
    if (!prov) throw new Error(`Provider not found: ${opts.providerId}`);
    const cfg: ProviderConfigEntry | null = ProviderRegistry.getConfig(opts.providerId);
    if (!cfg || !cfg.enabled) throw new Error(`Provider disabled: ${opts.providerId}`);
    const symbols = opts.symbols && opts.symbols.length ? opts.symbols : (cfg.symbols || []);
    const useRag = !!(opts.rag ?? cfg.ragEnabled);
    const ingestionOpts: IngestionOptions = { symbols, ragEnabled: useRag, dryRun: opts.dryRun, apiKey: opts.apiKey };
    const rateLimiter = cfg?.rateLimitRpm ? new RateLimiter(cfg.rateLimitRpm) : undefined;
    const retryConfig = { maxRetries: cfg?.maxRetries ?? 0, backoffBaseMs: cfg?.backoffBaseMs ?? 500 };
    const ctx = { db: null as any, logger, rag: (useRag && !opts.dryRun) ? this.ragIndexer : undefined, env: process.env, rateLimiter, retryConfig };
    const started = Date.now();
    logger.info({ provider: prov.id, symbols: symbols.length, rag: useRag, dryRun: !!opts.dryRun }, 'provider_ingest_start');
    
    await acquire();
    try {
      const lastSuccess = getProviderLastSuccess(prov.id);
      if (!ingestionOpts.since && lastSuccess) ingestionOpts.since = lastSuccess;
      const res = await prov.ingest(ctx as any, ingestionOpts);
      if (!opts.dryRun) {
        const persisted = await applyIngestionResult(res, started, { enableRag: useRag, ragIndex: async (sym, docs) => { await this.ragIndexer.index(sym, docs); } });
        (res as any).persisted = persisted;
        // Auto-disable on consecutive failures threshold
        const cfgDisable = cfg?.disableOnFailures;
        if (cfgDisable && cfgDisable > 0) {
          const fails = getProviderConsecutiveFailures(prov.id, cfgDisable + 2);
          if (fails >= cfgDisable) {
            ProviderRegistry.disable(prov.id, `consecutive_failures=${fails}`);
          }
        }
      } else {
        logger.info({ provider: prov.id, dryRun: true, prices: res.prices?.length||0, news: res.news?.length||0 }, 'provider_ingest_dry_run');
      }
      return res as any;
    } finally { 
      release(); 
    }
  }
}

export const ingestionManager = new IngestionManager();
