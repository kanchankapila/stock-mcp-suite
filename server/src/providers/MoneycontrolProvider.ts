import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { fetchMcTech, fetchMcInsights, fetchMcExtended, buildMcDocs } from './moneycontrol.js';
import { resolveTicker } from '../utils/ticker.js';
import { upsertMcTech, insertProviderData, insertMcFuturesSnapshot, insertMcOptionsSnapshot } from '../db.js';

export class MoneycontrolProvider implements BaseProvider {
  id = 'moneycontrol';
  name = 'Moneycontrol Technicals';
  kind: 'mixed' = 'mixed';
  supportsSymbol = true;
  async ingest(ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    const wantRag = !!opts.ragEnabled && !!ctx.rag;
    for (const s of symbols) {
      const mcid = resolveTicker(s, 'mc');
      const startSym = Date.now();
      try {
        // Fetch extended (quote + futures + options + estimates + tech widgets)
        const extended = await fetchMcExtended(mcid);
        if (extended) {
          res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { extended } });
          // Persist structured futures/options snapshots
          try {
            const capturedAt = new Date().toISOString();
            if (extended.futures && extended.futures.length) {
              insertMcFuturesSnapshot(mcid, extended.futures.map(f=> ({ expiry: f.expiry, last_price: f.lastPrice ?? null, oi: f.oi ?? null })), capturedAt);
            }
            if (extended.options && extended.options.length) {
              insertMcOptionsSnapshot(mcid, extended.options.map(o=> ({ expiry: o.expiry, type: o.type, strike: o.strike, last_price: o.lastPrice ?? null, iv: o.iv ?? null, oi: o.oi ?? null })), capturedAt);
            }
          } catch {}
          // RAG docs
            if (wantRag) {
              try {
                const docs = buildMcDocs(s, extended);
                if (docs.length) await ctx.rag!.index(s, docs);
              } catch {}
            }
        }
        // Multi-frequency technicals (D/W/M) persisted separately via mc_tech
        for (const freq of ['D','W','M'] as const) {
          try {
            const tech = await fetchMcTech(mcid, freq);
            if (tech) upsertMcTech(s, freq, tech);
          } catch {}
        }
        // Insights last (non-critical)
        try {
          const ins = await fetchMcInsights(mcid, 'c');
          if (ins) res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { insights: ins } });
        } catch {}
      } catch (err:any) {
        res.errors!.push({ symbol: s, error: String(err?.message||err), cause: err });
      } finally {
        (res.meta as any) = { ...(res.meta||{}), symbolTimings: { ...(res.meta?.symbolTimings||{}), [s]: Date.now() - startSym } };
      }
    }
    res.finishedAt = new Date().toISOString();
    res.meta = { ...(res.meta||{}), providerData: res.providerData?.length || 0 };
    return res;
  }
}


