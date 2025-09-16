import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { tlAdvTechnical, normalizeAdvTechnical, tlSmaChart } from './trendlyne.js';
import { resolveTicker } from '../utils/ticker.js';

export class TrendlyneProvider implements BaseProvider {
  id = 'trendlyne';
  name = 'Trendlyne Advanced Technicals';
  kind: 'derivatives' = 'derivatives';
  supportsSymbol = true;
  async ingest(_ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    for (const s of symbols) {
      const tlid = resolveTicker(s, 'trendlyne');
      try {
        const raw = await tlAdvTechnical(tlid, 24);
        const norm = normalizeAdvTechnical(raw);
        res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { adv: norm } });
      } catch (err:any) {
        res.errors!.push({ symbol: s, error: String(err?.message||err), cause: err });
      }
      try {
        const sma = await tlSmaChart(tlid);
        res.providerData!.push({ provider_id: this.id, symbol: s, captured_at: new Date().toISOString(), payload: { sma } });
      } catch {}
    }
    res.finishedAt = new Date().toISOString();
    res.meta = { providerData: res.providerData?.length || 0 };
    return res;
  }
}


