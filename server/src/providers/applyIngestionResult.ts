import db, { insertProviderRun, insertProviderRunError, insertPriceRow, insertNewsRow, insertProviderData, upsertStock } from '../db.js';
import { IngestionResult } from './BaseProvider.js';
import { ProviderMetrics } from './ProviderMetrics.js';
import { logger } from '../utils/logger.js';

export interface ApplyResultOptions {
  ragIndex?: (symbol: string, items: Array<{ text:string; metadata:any }>)=>Promise<void>;
  enableRag?: boolean;
}

export async function applyIngestionResult(res: IngestionResult, started: number, opts: ApplyResultOptions = {}) {
  const { providerId } = res;
  const startIso = new Date(started).toISOString();
  const end = Date.now();
  const endIso = new Date(end).toISOString();
  let prices = 0, news = 0, providerData = 0, ragDocs = 0;
  const errors = res.errors || [];

  try {
    db.transaction(()=> {
      if (Array.isArray(res.prices)) {
        for (const r of res.prices) { try { insertPriceRow(r); prices++; upsertStock(r.symbol); } catch (err) { logger.warn({ err, providerId }, 'persist_price_failed'); } }
      }
      if (Array.isArray(res.news)) {
        for (const n of res.news) {
          try { insertNewsRow({ id: n.id, symbol: n.symbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: (n as any).sentiment ?? null }); news++; upsertStock(n.symbol); } catch (err) { logger.warn({ err, providerId }, 'persist_news_failed'); }
        }
      }
      if (Array.isArray(res.providerData)) {
        for (const d of res.providerData) { try { insertProviderData(d); providerData++; if (d.symbol) upsertStock(d.symbol); } catch (err) { logger.warn({ err, providerId }, 'persist_provider_data_failed'); } }
      }
    })();
  } catch (err) {
    logger.error({ err, providerId }, 'apply_ingestion_tx_failed');
  }

  if (opts.enableRag && opts.ragIndex && res.news && res.news.length) {
    try {
      const bySymbol = new Map<string, { text:string; metadata:any }[]>();
      for (const n of res.news) {
        const arr = bySymbol.get(n.symbol) || []; arr.push({ text: `${n.title}\n\n${n.summary}`, metadata: { date: n.date.slice(0,10), source: providerId, url: n.url } }); bySymbol.set(n.symbol, arr);
      }
      for (const [sym, docs] of bySymbol.entries()) {
        await opts.ragIndex(sym, docs);
        ragDocs += docs.length;
        await new Promise(r=>setTimeout(r, 15)); // light throttle to reduce embed bursts
      }
    } catch (err) {
      logger.warn({ err, providerId }, 'apply_rag_index_failed');
    }
  }

  // Log individual errors (structured)
  if (errors.length) {
    for (const e of errors) {
      logger.warn({ providerId, symbol: (e as any).symbol, error: (e as any).error }, 'provider_symbol_ingest_error');
    }
  }

  const durationMs = end - started;
  insertProviderRun({ provider_id: providerId, started_at: startIso, finished_at: endIso, duration_ms: durationMs, success: errors.length===0, error_count: errors.length, items: { prices, news, providerData }, rag_indexed: ragDocs, meta: res.meta || null });
  ProviderMetrics.record(providerId, errors.length===0, durationMs, { prices, news, providerData, ragDocs });
  if (errors.length) {
    // fetch last run id (quick lookup) - optimization: could return run id from insertProviderRun but current helper doesn't
    try {
      const runRow = db.prepare('SELECT id FROM provider_runs WHERE provider_id=? ORDER BY started_at DESC LIMIT 1').get(providerId) as { id:number }|undefined;
      if (runRow) {
        for (const e of errors) {
          try { insertProviderRunError(runRow.id, (e as any).symbol, String((e as any).error || 'error')); } catch {}
        }
      }
    } catch {}
  }

  logger.info({ providerId, prices, news, providerData, ragDocs, errors: errors.length, durationMs }, 'provider_ingest_persisted');
  return { prices, news, providerData, ragDocs, durationMs, symbolUpserts: prices + news + providerData };
}
