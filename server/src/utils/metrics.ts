// Simple in-memory metrics aggregator for provider fetches
// Not persistent; reset on process restart.

export type FetchMetricKind = 'ok' | 'error' | 'retry';

interface ProviderStats {
  ok: number;
  error: number;
  retry: number;
  count: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
}

const providers: Record<string, ProviderStats> = {};

function ensure(p: string): ProviderStats {
  if (!providers[p]) providers[p] = { ok:0, error:0, retry:0, count:0, sumMs:0, minMs: Number.POSITIVE_INFINITY, maxMs: 0 };
  return providers[p];
}

export function recordFetchMetric(provider: string, kind: FetchMetricKind, ms: number) {
  const ps = ensure(provider);
  if (kind === 'ok') ps.ok++; else if (kind === 'error') ps.error++; else if (kind === 'retry') ps.retry++;
  ps.count++;
  ps.sumMs += ms;
  if (ms < ps.minMs) ps.minMs = ms;
  if (ms > ps.maxMs) ps.maxMs = ms;
}

export function getMetricsSnapshot() {
  const out: any = {};
  for (const [k, v] of Object.entries(providers)) {
    out[k] = {
      ok: v.ok,
      error: v.error,
      retry: v.retry,
      count: v.count,
      avgMs: v.count ? Number((v.sumMs / v.count).toFixed(1)) : 0,
      minMs: Number.isFinite(v.minMs) ? v.minMs : 0,
      maxMs: v.maxMs
    };
  }
  return out;
}

export function metricsWithMeta() {
  return { ts: new Date().toISOString(), uptimeSec: Math.floor(process.uptime()), providers: getMetricsSnapshot() };
}
