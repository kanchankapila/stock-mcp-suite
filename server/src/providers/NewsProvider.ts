import { BaseProvider, IngestionOptions, IngestionResult, ProviderContext, createBaseResult } from './BaseProvider.js';
import { fetchNews, parseNews } from './news.js';
import { sentimentScore } from '../analytics/sentiment.js';

export class NewsApiProvider implements BaseProvider {
  id = 'newsapi';
  name = 'NewsAPI';
  kind: 'news' = 'news';
  supportsSymbol = true;
  constructor(private queryMode: 'symbol'|'name'|'symbolOrName'='symbol') {}
  async ingest(ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult> {
    const symbols = (opts.symbols || []).map(s=>s.toUpperCase());
    const res = createBaseResult(this.id, symbols);
    const apiKey = opts.apiKey || ctx.env.NEWS_API_KEY || ctx.env.NEWSAPI_KEY;
    const retryCfg = ctx.retryConfig || { maxRetries: 0, backoffBaseMs: 500 };
    for (const symbol of symbols) {
      try {
        if (ctx.rateLimiter) await ctx.rateLimiter.waitFor(1);
        let attempt = 0; let lastErr: any;
        while (attempt <= retryCfg.maxRetries) {
          try {
            const raw = await fetchNews(symbol, apiKey);
            const items = parseNews(symbol, raw);
            for (const n of items) {
              const s = sentimentScore([n.title, n.summary].filter(Boolean));
              (n as any).sentiment = s;
            }
            res.news!.push(...items);
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
    res.meta = { news: res.news?.length || 0 };
    // Optional immediate RAG indexing if provider chooses to (centralized apply also handles it; this is a fast-path)
    if (opts.ragEnabled && ctx.rag && res.news && res.news.length) {
      try {
        const bySymbol = new Map<string, { text:string; metadata:any }[]>();
        for (const n of res.news) {
          const arr = bySymbol.get(n.symbol) || []; arr.push({ text: `${n.title}\n\n${n.summary}`, metadata: { date: n.date.slice(0,10), source: this.id, url: n.url } }); bySymbol.set(n.symbol, arr);
        }
        for (const [sym, docs] of bySymbol.entries()) {
          await ctx.rag.index(sym, docs);
        }
      } catch {}
    }
    return res;
  }
}
