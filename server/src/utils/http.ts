export type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export async function fetchJson(url: string, opts: FetchOptions = {}) {
  const { method = 'GET', headers = {}, body, timeoutMs = 10000, retries = 2, retryDelayMs = 300 } = opts;
  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= retries) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal } as any);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const ct = res.headers.get('content-type') || '';
      const isJson = /application\/json/i.test(ct) || url.endsWith('.json');
      return isJson ? res.json() : res.text();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, retryDelayMs + Math.floor(Math.random()*retryDelayMs)));
    } finally { clearTimeout(to); attempt++; }
  }
  throw lastErr || new Error('fetch_failed');
}

