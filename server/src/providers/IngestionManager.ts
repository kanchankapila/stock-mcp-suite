import { ProviderRegistry, ProviderConfigEntry } from './ProviderRegistry.js';
import { BaseProvider, IngestionOptions, IngestionResult } from './BaseProvider.js';
import { LangChainRagIndexer } from './RagIndexer.js';
import { logger } from '../utils/logger.js';
import { applyIngestionResult } from './applyIngestionResult.js';
import { RateLimiter } from './RateLimiter.js';
import { getProviderLastSuccess, getProviderConsecutiveFailures } from '../db.js';
import { loadStocklist } from '../utils/stocklist.js';

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
interface BatchMeta { batchIndex:number; batchSize:number; durationMs:number; symbols:string[] }
interface ProgressInfo { providerId:string; batchIndex:number; totalBatches?:number; batchSize:number; durationMs:number; symbols:string[]; aggregate:{ prices:number; news:number; providerData:number; errors:number; batches:number }; finished?:boolean; aborted?:boolean }

export class IngestionManager {
  private ragIndexer = new LangChainRagIndexer();
  async run(opts: RunOptions): Promise<IngestionResult & { persisted?: { prices:number; news:number; providerData:number; ragDocs:number; durationMs:number } ; batches?: BatchMeta[]; symbolTimings?: Record<string,number> }> {
    const prov: BaseProvider | null = ProviderRegistry.get(opts.providerId);
    if (!prov) throw new Error(`Provider not found: ${opts.providerId}`);
    const cfg: ProviderConfigEntry | null = ProviderRegistry.getConfig(opts.providerId);
    if (!cfg || !cfg.enabled) throw new Error(`Provider disabled: ${opts.providerId}`);
    let symbols = (opts.symbols && opts.symbols.length ? opts.symbols : (cfg.symbols || [])).slice();
    if (!symbols.length) {
      // Fallback: use full stocklist (all symbols). This enables providers to cover every stock.
      const all = loadStocklist().map(s=> (s.symbol||'').toUpperCase()).filter(Boolean);
      // Deduplicate while preserving order.
      const seen = new Set<string>();
      symbols = all.filter(sym=> { if (seen.has(sym)) return false; seen.add(sym); return true; });
      logger.info({ provider: prov.id, totalSymbols: symbols.length }, 'provider_symbols_fallback_stocklist');
    }
    const maxSymbols = Number(process.env.MAX_SYMBOLS_PER_RUN || 0);
    if (maxSymbols > 0 && symbols.length > maxSymbols) {
      symbols = symbols.slice(0, maxSymbols);
      logger.warn({ provider: prov.id, capped: symbols.length, maxSymbols }, 'provider_symbols_capped');
    }
    const useRag = !!(opts.rag ?? cfg.ragEnabled);
    const ingestionOpts: IngestionOptions = { symbols, ragEnabled: useRag, dryRun: opts.dryRun, apiKey: opts.apiKey };
    const rateLimiter = cfg?.rateLimitRpm ? new RateLimiter(cfg.rateLimitRpm) : undefined;
    const retryConfig = { maxRetries: cfg?.maxRetries ?? 0, backoffBaseMs: cfg?.backoffBaseMs ?? 500 };
    const ctx = { db: null as any, logger, rag: (useRag && !opts.dryRun) ? this.ragIndexer : undefined, env: process.env, rateLimiter, retryConfig };
    const started = Date.now();

    // Batching logic
    const batchSizeEnv = Number(process.env.INGEST_BATCH_SIZE || 0);
    const batchSize = batchSizeEnv > 0 ? batchSizeEnv : (prov.defaultBatchSize || 0);
    const doBatch = batchSize > 0 && symbols.length > batchSize;
    const batches: BatchMeta[] = [];
    const symbolTiming: Record<string, number> = {};

    await acquire();
    try {
      if (!doBatch) {
        if (!ingestionOpts.since) {
          const lastSuccess = getProviderLastSuccess(prov.id);
          if (lastSuccess) ingestionOpts.since = lastSuccess;
        }
        const resSingle = await prov.ingest(ctx as any, ingestionOpts);
        const persisted = !opts.dryRun ? await applyIngestionResult(resSingle, started, { enableRag: useRag, ragIndex: async (sym, docs) => { await this.ragIndexer.index(sym, docs); } }) : undefined;
        if (!opts.dryRun && persisted) (resSingle as any).persisted = persisted;
        if (!opts.dryRun) {
          const cfgDisable = cfg?.disableOnFailures;
            if (cfgDisable && cfgDisable > 0) {
              const fails = getProviderConsecutiveFailures(prov.id, cfgDisable + 2);
              if (fails >= cfgDisable) ProviderRegistry.disable(prov.id, `consecutive_failures=${fails}`);
            }
        }
        (resSingle as any).batches = [];
        (resSingle as any).symbolTimings = {};
        return resSingle as any;
      }

      logger.info({ provider: prov.id, total: symbols.length, batchSize }, 'provider_ingest_batch_start');
      const aggregate = { providerId: prov.id, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), symbolsTried: symbols.slice(), prices: [], news: [], docs: [], providerData: [], errors: [], meta: { batched:true } } as IngestionResult;
      const lastSuccess = getProviderLastSuccess(prov.id);
      const sinceBase = ingestionOpts.since || lastSuccess;
      for (let i=0;i<symbols.length;i+=batchSize) {
        const slice = symbols.slice(i, i+batchSize);
        const bStart = Date.now();
        const res = await prov.ingest(ctx as any, { ...ingestionOpts, symbols: slice, since: sinceBase });
        const bDur = Date.now()-bStart;
        batches.push({ batchIndex: batches.length, batchSize: slice.length, durationMs: bDur, symbols: slice });
        // Accumulate arrays
        if (res.prices?.length) aggregate.prices!.push(...res.prices);
        if (res.news?.length) aggregate.news!.push(...res.news);
        if (res.docs?.length) aggregate.docs!.push(...res.docs);
        if (res.providerData?.length) aggregate.providerData!.push(...res.providerData);
        if (res.errors?.length) aggregate.errors!.push(...res.errors);
        // Per-symbol timing (assign batch duration divided by symbols)
        const avg = bDur / slice.length;
        for (const s of slice) symbolTiming[s] = (symbolTiming[s] || 0) + avg;
      }
      aggregate.finishedAt = new Date().toISOString();
      if (!opts.dryRun) {
        const persisted = await applyIngestionResult(aggregate, started, { enableRag: useRag, ragIndex: async (sym, docs) => { await this.ragIndexer.index(sym, docs); } });
        (aggregate as any).persisted = persisted;
        const cfgDisable = cfg?.disableOnFailures;
        if (cfgDisable && cfgDisable > 0) {
          const fails = getProviderConsecutiveFailures(prov.id, cfgDisable + 2);
          if (fails >= cfgDisable) ProviderRegistry.disable(prov.id, `consecutive_failures=${fails}`);
        }
      }
      (aggregate as any).batches = batches;
      (aggregate as any).symbolTimings = symbolTiming;
      logger.info({ provider: prov.id, batches: batches.length, totalDurationMs: Date.now()-started }, 'provider_ingest_batch_complete');
      return aggregate as any;
    } finally {
      release();
    }
  }

  async runWithProgress(opts: RunOptions & { onProgress:(info:ProgressInfo)=>void; abortSignal?:{ aborted:boolean } }): Promise<any> {
    const prov: BaseProvider | null = ProviderRegistry.get(opts.providerId);
    if (!prov) throw new Error(`Provider not found: ${opts.providerId}`);
    const cfg: ProviderConfigEntry | null = ProviderRegistry.getConfig(opts.providerId);
    if (!cfg || !cfg.enabled) throw new Error(`Provider disabled: ${opts.providerId}`);
    let symbols = (opts.symbols && opts.symbols.length ? opts.symbols : (cfg.symbols || [])).slice();
    if (!symbols.length) {
      const all = loadStocklist().map(s=> (s.symbol||'').toUpperCase()).filter(Boolean);
      const seen = new Set<string>();
      symbols = all.filter(sym=> { if (seen.has(sym)) return false; seen.add(sym); return true; });
    }
    const maxSymbols = Number(process.env.MAX_SYMBOLS_PER_RUN || 0);
    if (maxSymbols > 0 && symbols.length > maxSymbols) symbols = symbols.slice(0, maxSymbols);
    const useRag = !!(opts as any).rag;
    const ingestionOpts: IngestionOptions = { symbols, ragEnabled: useRag, dryRun: (opts as any).dryRun };
    const started = Date.now();
    const batchSizeEnv = Number(process.env.INGEST_BATCH_SIZE || 0);
    const batchSize = batchSizeEnv > 0 ? batchSizeEnv : (prov.defaultBatchSize || 0);
    const doBatch = batchSize > 0 && symbols.length > batchSize;
    const batches: BatchMeta[] = [];
    const symbolTiming: Record<string, number> = {};
    const aggregate = { providerId: prov.id, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), symbolsTried: symbols.slice(), prices: [], news: [], docs: [], providerData: [], errors: [], meta: { batched: doBatch } } as IngestionResult;
    await acquire();
    try {
      if (!doBatch) {
        const res = await prov.ingest({ logger, env: process.env } as any, ingestionOpts);
        (aggregate.prices as any[]).push(...(res.prices||[]));
        (aggregate.news as any[]).push(...(res.news||[]));
        (aggregate.errors as any[]).push(...(res.errors||[]));
        (aggregate.providerData as any[]).push(...(res.providerData||[]));
        (opts.onProgress)({ providerId: prov.id, batchIndex:0, batchSize:symbols.length, durationMs: Date.now()-started, symbols, aggregate:{ prices: aggregate.prices!.length, news: aggregate.news!.length, providerData: aggregate.providerData!.length, errors: aggregate.errors!.length, batches:1 }, finished:true });
        if (!(ingestionOpts.dryRun)) await applyIngestionResult(aggregate, started, { enableRag: useRag, ragIndex: async (sym, docs) => { await this.ragIndexer.index(sym, docs); } });
        return aggregate;
      }
      const totalBatchesEst = Math.ceil(symbols.length / batchSize);
      for (let i=0;i<symbols.length;i+=batchSize) {
        if (opts.abortSignal?.aborted) { break; }
        const slice = symbols.slice(i, i+batchSize);
        const bStart = Date.now();
        const res = await prov.ingest({ logger, env: process.env } as any, { ...ingestionOpts, symbols: slice });
        const bDur = Date.now()-bStart;
        batches.push({ batchIndex: batches.length, batchSize: slice.length, durationMs: bDur, symbols: slice });
        if (res.prices?.length) aggregate.prices!.push(...res.prices);
        if (res.news?.length) aggregate.news!.push(...res.news);
        if (res.providerData?.length) aggregate.providerData!.push(...res.providerData);
        if (res.errors?.length) aggregate.errors!.push(...res.errors);
        const avg = bDur / slice.length;
        for (const s of slice) symbolTiming[s] = (symbolTiming[s] || 0) + avg;
        opts.onProgress({ providerId: prov.id, batchIndex: batches.length-1, totalBatches: totalBatchesEst, batchSize: slice.length, durationMs: bDur, symbols: slice, aggregate:{ prices: aggregate.prices!.length, news: aggregate.news!.length, providerData: aggregate.providerData!.length, errors: aggregate.errors!.length, batches: batches.length }, aborted: !!opts.abortSignal?.aborted, finished:false });
      }
      aggregate.finishedAt = new Date().toISOString();
      (aggregate as any).batches = batches;
      (aggregate as any).symbolTimings = symbolTiming;
      if (!ingestionOpts.dryRun) await applyIngestionResult(aggregate, started, { enableRag: useRag, ragIndex: async (sym, docs) => { await this.ragIndexer.index(sym, docs); } });
      opts.onProgress({ providerId: prov.id, batchIndex: batches.length-1, totalBatches: batches.length, batchSize: batches.length?batches[batches.length-1].batchSize:0, durationMs: Date.now()-started, symbols: [], aggregate:{ prices: aggregate.prices!.length, news: aggregate.news!.length, providerData: aggregate.providerData!.length, errors: aggregate.errors!.length, batches: batches.length }, finished:true, aborted: !!opts.abortSignal?.aborted });
      return aggregate;
    } finally {
      release();
    }
  }
}

export const ingestionManager = new IngestionManager();
