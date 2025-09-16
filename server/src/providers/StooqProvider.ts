import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { fetchStooqDaily } from './stooq.js';

export class StooqProvider implements BaseProvider {
  id = 'stooq';
  name = 'Stooq Daily Prices';
  kind: 'prices' = 'prices';
  supportsSymbol = true;
  async ingest(_ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    for (const symbol of symbols) {
      try {
        const rows = await fetchStooqDaily(symbol);
        res.prices!.push(...rows);
      } catch (err:any) {
        res.errors!.push({ symbol, error: String(err?.message||err), cause: err });
      }
    }
    res.finishedAt = new Date().toISOString();
    res.meta = { prices: res.prices?.length || 0 };
    return res;
  }
}


