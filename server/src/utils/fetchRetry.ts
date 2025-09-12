// Reusable fetch with retry/backoff + simple metrics hook
import fetch, { RequestInit } from 'node-fetch';
import { logger } from './logger.js';
import { recordFetchMetric } from './metrics.js';

export type FetchRetryOptions = {
  retries?: number;          // total attempts including first (default 3)
  backoffMs?: number;        // initial backoff (default 500)
  backoffFactor?: number;    // multiplier (default 2)
  maxBackoffMs?: number;     // cap (default 5000)
  retryOn?: Array<number>;   // status codes to retry (default [429,502,503,504])
  timeoutMs?: number;        // per attempt timeout (optional)
  label?: string;            // provider label for metrics
};

export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: FetchRetryOptions = {}) {
  const {
    retries = 3,
    backoffMs = 500,
    backoffFactor = 2,
    maxBackoffMs = 5000,
    retryOn = [429,502,503,504],
    timeoutMs,
    label = 'generic'
  } = opts;
  let attempt = 0;
  let delay = backoffMs;
  let lastErr: any = null;
  const started = Date.now();
  while (attempt < Math.max(1, retries)) {
    const aStart = Date.now();
    try {
      const controller = timeoutMs ? new AbortController() : null;
      let t: NodeJS.Timeout | undefined;
      if (controller && timeoutMs) {
        t = setTimeout(()=> controller.abort(), timeoutMs).unref();
      }
      const res = await fetch(url, { ...init, signal: controller?.signal });
      if (t) clearTimeout(t);
      const ms = Date.now() - aStart;
      if (retryOn.includes(res.status) && attempt < retries - 1) {
        logger.warn({ url, status: res.status, attempt }, 'fetch_retry_status');
        recordFetchMetric(label, 'retry', ms);
      } else if (!res.ok) {
        recordFetchMetric(label, 'error', ms);
        return res; // return non-ok (caller decides)
      } else {
        recordFetchMetric(label, 'ok', ms);
        return res;
      }
    } catch (err:any) {
      lastErr = err;
      const ms = Date.now() - aStart;
      if (attempt >= retries - 1) {
        recordFetchMetric(label, 'error', ms);
        break;
      }
      recordFetchMetric(label, 'retry', ms);
      logger.warn({ url, err: err?.message, attempt }, 'fetch_retry_err');
    }
    await new Promise(r=> setTimeout(r, delay));
    delay = Math.min(maxBackoffMs, delay * backoffFactor);
    attempt++;
  }
  const totalMs = Date.now() - started;
  logger.error({ url, attempts: attempt+1, totalMs, err: lastErr?.message }, 'fetch_failed_exhausted');
  throw lastErr || new Error('fetch_failed');
}
