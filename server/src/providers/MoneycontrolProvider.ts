import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { fetchMcTech, fetchMcInsights } from './moneycontrol.js';
import { resolveTicker } from '../utils/ticker.js';

export class MoneycontrolProvider implements BaseProvider {
  id = 'moneycontrol';
  name = 'Moneycontrol Technicals';
  kind: 'mixed' = 'mixed';
  supportsSymbol = true;
  async ingest(_ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    for (const s of symbols) {
      const mcid = resolveTicker(s, 'mc');
      try {
        const tech = await fetchMcTech(mcid, 'D');
        if (tech) res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { tech } });
      } catch (err:any) {
        res.errors!.push({ symbol: s, error: String(err?.message||err), cause: err });
      }
      try {
        const ins = await fetchMcInsights(mcid, 'c');
        if (ins) res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { insights: ins } });
      } catch {}
    }
    res.finishedAt = new Date().toISOString();
    res.meta = { providerData: res.providerData?.length || 0 };
    return res;
  }
}


