import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from './alphaVantage.js';

export class AlphaVantageProvider implements BaseProvider {
  id = 'alphavantage';
  name = 'Alpha Vantage';
  kind: 'prices' = 'prices';
  supportsSymbol = true;
  async ingest(ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    const apiKey = opts.apiKey || ctx.env.ALPHAVANTAGE_API_KEY;
    const retryCfg = ctx.retryConfig || { maxRetries: 0, backoffBaseMs: 500 };
    for (const symbol of symbols) {
      try {
        if (ctx.rateLimiter) await ctx.rateLimiter.waitFor(1);
        let attempt = 0; let lastErr: any;
        while (attempt <= retryCfg.maxRetries) {
          try {
            const raw = await fetchDailyTimeSeries(symbol, apiKey);
            const rows = parseAlphaDaily(symbol, raw);
            res.prices!.push(...rows);
            lastErr = null; break;
          } catch (err:any) {
            lastErr = err;
            if (attempt >= retryCfg.maxRetries) break;
            const delay = retryCfg.backoffBaseMs * Math.pow(2, attempt);
            await new Promise(r=>setTimeout(r, delay));
            attempt++;
          }
        }
        if (lastErr) throw lastErr;
      } catch (err:any) {
        res.errors!.push({ symbol, error: String(err?.message||err), cause: err });
      }
    }
    res.finishedAt = new Date().toISOString();
    res.meta = { prices: res.prices?.length || 0 };
    return res;
  }
}
