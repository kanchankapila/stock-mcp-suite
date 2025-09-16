// Central fetch + resiliency helpers
// Explicit types & lightweight validation hooks (no external dep)

import { emit } from '../lib/events';

export interface FetchJsonOptions<T=any> {
  method?: string;
  headers?: Record<string,string>;
  body?: any;
  signal?: AbortSignal;
  timeoutMs?: number; // overall timeout
  retries?: number; // retry count on network / 5xx
  retryDelayBaseMs?: number; // base for exponential backoff
  validate?: (data: unknown) => T; // throw if invalid
  onAttempt?: (info:{ attempt:number; error?:any }) => void;
}

export async function fetchJson<T=any>(url: string, opts: FetchJsonOptions<T> = {}): Promise<T> {
  const {
    method='GET', headers={}, body, signal,
    timeoutMs=15_000, retries=2, retryDelayBaseMs=300,
    validate, onAttempt
  } = opts;
  let attempt = 0; let lastErr: any;
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  signals.push(controller.signal);
  const timeout = setTimeout(()=> controller.abort(), timeoutMs);
  try {
    while (attempt <= retries) {
      try {
        onAttempt?.({ attempt });
        emit('api:attempt', { url, attempt });
        const init: RequestInit = { method, headers: { ...headers }, signal: signals.length === 1 ? signals[0] : (function merge(){
          // Simple composite signal fallback
          if (signals.length === 1) return signals[0];
          const c = new AbortController();
          signals.forEach(s=> s.addEventListener('abort', ()=> c.abort(), { once:true }));
          return c.signal;
        })() };
        if (body !== undefined) {
          if (typeof body === 'string' || body instanceof FormData) init.body = body as any;
          else { init.body = JSON.stringify(body); init.headers = { 'Content-Type':'application/json', ...init.headers }; }
        }
        const res = await fetch(url, init);
        if (!res.ok) {
          // Retry only on 5xx & network-ish
          if (res.status >=500 && res.status <600 && attempt < retries) {
            const delay = retryDelayBaseMs * Math.pow(2, attempt);
            await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
          }
          const text = await res.text().catch(()=> '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim());
        }
        const json = await res.json().catch(()=> { throw new Error('invalid_json'); });
        const data = validate ? validate(json) : json;
        // Emit success telemetry
        try { emit('api:success', { url, attempt, ms: performance.now?.() }); } catch {}
        return data as T;
      } catch (err:any) {
        if (err?.name === 'AbortError') throw err;
        emit('api:error', { url, attempt, error: String(err?.message||err) });
        lastErr = err;
        if (attempt >= retries) break;
        const delay = retryDelayBaseMs * Math.pow(2, attempt);
        await new Promise(r=>setTimeout(r, delay));
        attempt++;
      }
    }
    throw lastErr || new Error('fetch_failed');
  } finally {
    clearTimeout(timeout);
  }
}

// Spinner + fetch pattern: sets aria-busy and restores previous content
export async function loadInto(el: HTMLElement, task: ()=> Promise<string|HTMLElement|void>, opts?: { spinnerHtml?: string; onErrorHtml?: (err:any)=> string }) {
  if (!el) return;
  const prev = el.innerHTML;
  el.setAttribute('aria-busy','true');
  el.innerHTML = opts?.spinnerHtml || `<span class="spinner" role="status" aria-live="polite">Loading…</span>`;
  try {
    const out = await task();
    if (typeof out === 'string') el.innerHTML = out; else if (out instanceof HTMLElement) { el.innerHTML=''; el.appendChild(out); } else el.innerHTML = prev === '' ? '' : el.innerHTML; // keep spinner if nothing returned
  } catch (err:any) {
    el.innerHTML = opts?.onErrorHtml?.(err) || errorBadgeHtml(err?.message||String(err));
  } finally {
    el.removeAttribute('aria-busy');
  }
}

// Error badge helpers
export function errorBadgeHtml(msg: string) {
  const safe = escapeHtml(msg || 'Error');
  return `<span class="error-badge" role="alert" aria-live="assertive" style="display:inline-block; padding:2px 6px; border-radius:6px; background:var(--danger-bg,#fee2e2); color:var(--danger-fg,#991b1b); font-size:11px">${safe}</span>`;
}
export function attachInlineError(el: HTMLElement, msg: string) { el.innerHTML = errorBadgeHtml(msg); }

// Basic HTML escape
export function escapeHtml(s: string){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c] as string)); }

// Exponential backoff utility (for watchlist enrichment etc.)
export async function backoff<T>(fn:()=>Promise<T>, attempts=4, baseMs=200): Promise<T> {
  let lastErr:any;
  for (let i=0;i<attempts;i++) {
    try { return await fn(); } catch (err) { lastErr = err; await new Promise(r=> setTimeout(r, baseMs * Math.pow(2,i))); }
  }
  throw lastErr;
}

// Memoization for expensive async (e.g., historical series) with TTL
interface MemoEntry { v: any; exp: number; }
const memoMap = new Map<string, MemoEntry>();
export function memoAsync<T>(key: string, ttlMs: number, fn: ()=> Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memoMap.get(key);
  if (hit && hit.exp > now) { try { emit('cache:hit', { key }); } catch {} return Promise.resolve(hit.v as T); }
  return fn().then(v => { memoMap.set(key, { v, exp: now + ttlMs }); return v; });
}
export function memoClear(prefix?: string) { if (!prefix) { memoMap.clear(); return; } for (const k of Array.from(memoMap.keys())) if (k.startsWith(prefix)) memoMap.delete(k); }

// Lightweight runtime validator utility (shape checking without deps)
export function validateShape<T=any>(spec: Record<string,string>) {
  return (raw: any) => {
    if (raw && typeof raw === 'object') {
      for (const [k, t] of Object.entries(spec)) {
        if (t === '?') continue; // optional
        const v = (raw as any)[k];
        if (t.endsWith('[]')) {
          if (!Array.isArray(v)) throw new Error(`field ${k} array required`);
        } else if (t === 'number') { if (!Number.isFinite(v)) throw new Error(`field ${k} number required`); }
        else if (t === 'string') { if (typeof v !== 'string') throw new Error(`field ${k} string required`); }
      }
    }
    return raw as T;
  };
}
