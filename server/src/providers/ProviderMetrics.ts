// Simple in-memory metrics for provider ingestion
// Not persistent; reset on process restart.
export interface ProviderMetricSample {
  providerId: string;
  runs: number;
  successes: number;
  failures: number;
  items: { prices: number; news: number; providerData: number; ragDocs: number };
  lastRunAt?: string;
  lastDurationMs?: number;
  avgDurationMs?: number;
  totalDurationMs: number;
}

class ProviderMetricsRegistry {
  private map = new Map<string, ProviderMetricSample>();
  get(id: string): ProviderMetricSample {
    let m = this.map.get(id);
    if (!m) {
      m = { providerId: id, runs: 0, successes: 0, failures: 0, items: { prices:0, news:0, providerData:0, ragDocs:0 }, totalDurationMs: 0 };
      this.map.set(id, m);
    }
    return m;
  }
  record(id: string, ok: boolean, durationMs: number, items: { prices:number; news:number; providerData:number; ragDocs:number }) {
    const m = this.get(id);
    m.runs += 1;
    if (ok) m.successes += 1; else m.failures += 1;
    m.items.prices += items.prices;
    m.items.news += items.news;
    m.items.providerData += items.providerData;
    m.items.ragDocs += items.ragDocs;
    m.lastRunAt = new Date().toISOString();
    m.lastDurationMs = durationMs;
    m.totalDurationMs += durationMs;
    m.avgDurationMs = Number((m.totalDurationMs / m.runs).toFixed(2));
  }
  list(): ProviderMetricSample[] { return Array.from(this.map.values()); }
}

export const ProviderMetrics = new ProviderMetricsRegistry();
