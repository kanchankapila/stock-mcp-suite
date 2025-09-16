import fetch from 'node-fetch';
import type { Response as NFResponse } from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

let TL_COOKIE_CACHE: { cookie: string, ts: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours persisted cache default
const FETCH_TIMEOUT_MS = 7000; // default timeout for TL fetches
const COOKIE_PER_URL_TIMEOUT_MS = 4000; // per-provider timeout for cookie endpoints
const COOKIE_OVERALL_TIMEOUT_MS = 7000; // overall timeout to race cookie providers

function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function fetchWithTimeout(url: string, opts: any = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<NFResponse> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...(opts||{}), signal: ctrl.signal } as any);
  } finally {
    clearTimeout(id);
  }
}

function getCachePath() {
  const fromEnv = process.env.TL_COOKIE_CACHE_PATH;
  if (fromEnv) return path.resolve(String(fromEnv));
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '.cache', 'trendlyne_cookie.txt');
}

function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
}

export function loadCookieFromFile(): { cookie: string, ts: number } | null {
  try {
    const p = getCachePath();
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, 'utf8').trim();
    if (!txt) return null;
    // First line cookie, second line timestamp (ms)
    const [cookie, tsLine] = txt.split(/\r?\n/);
    const ts = Number(tsLine || Date.now());
    return { cookie, ts: isFinite(ts) ? ts : Date.now() };
  } catch { return null; }
}

export function saveCookieToFile(cookie: string) {
  try {
    const p = getCachePath();
    ensureDir(p);
    fs.writeFileSync(p, `${cookie}\n${Date.now()}\n`, 'utf8');
  } catch (err) { logger.warn({ err }, 'trendlyne_cookie_cache_write_failed'); }
}

function getCookieProviderUrls(): string[] {
  const env = process.env.TL_COOKIE_URLS || '';
  const list = env.split(',').map(s=>s.trim()).filter(Boolean);
  if (list.length) return list;
  return [
    'https://vercel-ruddy-nine.vercel.app/api/trendlynecookie',
    'https://stockinsights-vercel-amitkapila1s-projects.vercel.app/trendlynecookie'
  ];
}

export async function fetchTrendlyneCookie(force=false): Promise<string | null> {
  const direct = process.env.TL_COOKIE;
  const now = Date.now();
  if (!force && direct) return direct;
  // In-memory cache hit within TTL
  if (!force && TL_COOKIE_CACHE && (now - TL_COOKIE_CACHE.ts) < CACHE_TTL_MS) return TL_COOKIE_CACHE.cookie;
  // Try file cache
  if (!force) {
    const fileCk = loadCookieFromFile();
    if (fileCk && (now - fileCk.ts) < CACHE_TTL_MS) {
      TL_COOKIE_CACHE = fileCk;
      return fileCk.cookie;
    }
  }
  const urls = getCookieProviderUrls();
  // Helper to fetch cookie from a single URL with timeout
  const one = async (u: string) => {
    try {
      const t0 = Date.now();
      const res = await fetchWithTimeout(u, {}, COOKIE_PER_URL_TIMEOUT_MS);
      if (!res.ok) throw new Error(`cookie_${res.status}`);
      const text = await res.text();
      // Try JSON first
      try {
        const j = JSON.parse(text);
        const ck = j.cookie || j.Cookie || j.COOKIES || null;
        if (ck) { logger.info({ url: u, ms: Date.now()-t0 }, 'trendlyne_cookie_provider_ok'); return String(ck); }
      } catch {}
      if (text && text.length > 8) { logger.info({ url: u, ms: Date.now()-t0 }, 'trendlyne_cookie_provider_ok_text'); return text.trim(); }
      throw new Error('cookie_empty');
    } catch (err) {
      logger.warn({ url: u, err: (err as any)?.message || String(err) }, 'trendlyne_cookie_provider_failed');
      throw err;
    }
  };
  // Race all providers; return first cookie
  const tasks = urls.map(u => new Promise<string>(async (resolve, reject) => {
    try {
      const ck = await one(u);
      if (ck) return resolve(ck);
      reject(new Error('no_cookie'));
    } catch (e) { reject(e as any); }
  }));
  const overall = new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error('cookie_overall_timeout')), COOKIE_OVERALL_TIMEOUT_MS));
  try {
    const ck = await Promise.any<string>([overall as any, ...tasks]);
    TL_COOKIE_CACHE = { cookie: ck, ts: now };
    saveCookieToFile(ck);
    return ck;
  } catch (err) {
    logger.error({ err: (err as any)?.message || String(err) }, 'trendlyne_cookie_race_failed');
    return null;
  }
}

async function tlFetch(path: string) {
  const base = 'https://trendlyne.com';
  const ck = await fetchTrendlyneCookie();
  const headers: Record<string,string> = {
    'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*', 'Referer': base,
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (ck) headers['Cookie'] = ck;
  const url = `${base}${path}`;
  const t0 = Date.now();
  logger.info({ url, withCookie: !!ck }, 'trendlyne_fetch_start');
  let res = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  // If unauthorized/forbidden, force-refresh cookie once
  if (res.status === 401 || res.status === 403) {
    await fetchTrendlyneCookie(true);
    const ck2 = TL_COOKIE_CACHE?.cookie || null;
    const headers2 = { ...headers };
    if (ck2) headers2['Cookie'] = ck2;
    logger.warn({ url }, 'trendlyne_retry_after_cookie_refresh');
    res = await fetchWithTimeout(url, { headers: headers2 }, FETCH_TIMEOUT_MS);
  }
  // One soft retry on transient upstream errors
  if (!res.ok && [502,503,504].includes(res.status)) {
    await delay(300);
    logger.warn({ url, status: res.status }, 'trendlyne_fetch_retry_transient');
    res = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  }
  if (!res.ok) {
    logger.error({ url, status: res.status, ms: Date.now()-t0 }, 'trendlyne_fetch_failed');
    throw new Error(`trendlyne_${res.status}`);
  }
  logger.info({ url, status: res.status, ms: Date.now()-t0 }, 'trendlyne_fetch_ok');
  try { return await res.json(); } catch { return await res.text(); }
}

// Allow external sources (e.g., headless login route) to set cookie explicitly
export function setExternalTrendlyneCookie(cookie: string) {
  if (!cookie || cookie.trim() === '') return;
  TL_COOKIE_CACHE = { cookie: cookie.trim(), ts: Date.now() };
  saveCookieToFile(cookie.trim());
}

export function getTrendlyneCookieStatus() {
  const file = loadCookieFromFile();
  return {
    inMemory: TL_COOKIE_CACHE ? { ts: TL_COOKIE_CACHE.ts } : null,
    onDisk: file ? { ts: file.ts } : null,
    cachePath: getCachePath(),
    ttlMs: CACHE_TTL_MS
  };
}

function parseCookieHeader(header: string): Array<{ name: string; value: string }> {
  return String(header || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) return { name: pair, value: '' };
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      return { name, value };
    });
}

export function getTrendlyneCookieDetails(includeRaw = false) {
  const source = TL_COOKIE_CACHE?.cookie || loadCookieFromFile()?.cookie || process.env.TL_COOKIE || '';
  const items = parseCookieHeader(source);
  const masked = items.map(({ name, value }) => {
    const len = value.length;
    const head = value.slice(0, 3);
    const tail = value.slice(-3);
    const preview = len > 8 ? `${head}…${tail}` : value.replace(/./g, '*');
    return { name, length: len, preview };
  });
  const out: any = { cookies: masked, hasAny: items.length > 0 };
  if (includeRaw) out.raw = source;
  return out;
}

export async function tlAdvTechnical(tlid: string, lookback: number = 24) {
  const path = `/equity/api/stock/adv-technical-analysis/${encodeURIComponent(tlid)}/${encodeURIComponent(String(lookback))}/`;
  return await tlFetch(path);
}

// Normalize Trendlyne Advanced Technicals JSON into a chart-friendly shape
export function normalizeAdvTechnical(raw: any) {
  const adv = raw || {};
  const score = typeof adv.score === 'number' ? adv.score : null;
  const signal = String(adv.signal || adv.trend || '').trim() || null;
  const summary = (adv.summary || adv.Summary || {}) as any;
  let buy = Number(summary.buy ?? 0);
  let neutral = Number(summary.neutral ?? 0);
  let sell = Number(summary.sell ?? 0);

  const normList = (arr: any, nameKey: string[] = ['name','key','indicator','pattern','period']) =>
    (Array.isArray(arr) ? arr : []).map((x: any) => ({
      name: String(nameKey.map(k=> x?.[k]).find(v=> v!=null) || ''),
      value: x?.value ?? x?.val ?? null,
      signal: String(x?.signal || x?.indication || x?.type || ''),
    }));

  const indicators = normList(adv.indicators ?? adv.Indicators);
  const move = adv.movingAverages ?? adv.moving_avg ?? adv.ma ?? {};
  const ma = {
    sma: normList(move.sma ?? move.SMA, ['name','key','period']),
    ema: normList(move.ema ?? move.EMA, ['name','key','period'])
  };
  const oscillators = normList(adv.oscillators ?? adv.Oscillators);
  const candles = normList(adv.candlestick ?? adv.candles, ['name','pattern']);

  // Derive counts
  let bull = 0, bear = 0, neut = 0;
  const add = (s: string) => { if (/bull/i.test(s)) bull++; else if (/bear/i.test(s)) bear++; else neut++; };
  [...indicators, ...ma.sma, ...ma.ema, ...oscillators, ...candles].forEach(i => add(i.signal));
  if (!(buy || neutral || sell)) { buy = bull; neutral = neut; sell = bear; }
  const total = Math.max(1, buy + neutral + sell);
  const buyPct = (buy/total)*100;
  const sellPct = (sell/total)*100;
  const biasPct = buyPct - sellPct;
  const decision = biasPct > 10 ? 'Bullish bias' : biasPct < -10 ? 'Bearish bias' : 'Neutral bias';
  const topBullish = [...indicators, ...ma.sma, ...ma.ema, ...oscillators]
    .filter(i=>/bull/i.test(i.signal)).map(i=>i.name).filter(Boolean).slice(0,5);
  const topBearish = [...indicators, ...ma.sma, ...ma.ema, ...oscillators]
    .filter(i=>/bear/i.test(i.signal)).map(i=>i.name).filter(Boolean).slice(0,5);

  return {
    score, signal,
    summary: { buy, neutral, sell },
    percentages: { buyPct, sellPct, neutralPct: 100 - buyPct - sellPct, biasPct },
    decision,
    counts: { bullish: bull, neutral: neut, bearish: bear },
    topBullish, topBearish,
    indicators,
    movingAverages: ma,
    oscillators,
    candles,
  };
}

export async function tlSmaChart(tlid: string) {
  const path = `/mapp/v1/stock/chart-data/${encodeURIComponent(tlid)}/SMA/`;
  // Try primary SMA endpoint
  const res: any = await tlFetch(path);
  // If API flags error but includes useful body/suggestions, try fallback fetch from suggestion
  try {
    const hasData = Array.isArray(res?.data) && res.data.length > 0;
    const suggestions = res?.body?.suggestions || res?.suggestions || [];
    if (!hasData && Array.isArray(suggestions) && suggestions.length) {
      const first = suggestions.find((s: any) => s?.fetchurl) || suggestions[0];
      if (first?.fetchurl) {
        const ohlc = await tlFetchAbsolute(String(first.fetchurl)).catch(()=>null);
        // Try to compute a reasonable SMA(20) from OHLC close prices if possible
        if (ohlc) {
          const points = extractCloseSeries(ohlc);
          if (points.length) {
            const sma20 = computeSma(points, 20);
            return { source: 'ohlc_fallback', data: sma20 };
          }
        }
      }
    }
  } catch {}
  return res;
}

export async function tlDerivativeBuildup(dateKey: string, tlid: string) {
  const path = `/futures-options/api/derivative/buildup-15/${encodeURIComponent(dateKey)}-near/${encodeURIComponent(tlid)}/`;
  return await tlFetch(path);
}

export async function tlHeatmap(dateKey: string) {
  const path = `/futures-options/api/heatmap/${encodeURIComponent(dateKey)}-near/all/price/`;
  return await tlFetch(path);
}

// Fetch absolute URL (same headers/cookie handling)
export async function tlFetchAbsolute(url: string) {
  const ck = await fetchTrendlyneCookie();
  const headers: Record<string,string> = {
    'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*', 'Referer': 'https://trendlyne.com/',
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (ck) headers['Cookie'] = ck;
  const t0 = Date.now();
  logger.info({ url, withCookie: !!ck }, 'trendlyne_fetch_abs_start');
  let res = await fetchWithTimeout(url, { headers } as any, FETCH_TIMEOUT_MS);
  if (res.status === 401 || res.status === 403) {
    await fetchTrendlyneCookie(true);
    const ck2 = TL_COOKIE_CACHE?.cookie || null;
    const headers2 = { ...headers } as Record<string,string>;
    if (ck2) headers2['Cookie'] = ck2;
    logger.warn({ url }, 'trendlyne_abs_retry_after_cookie_refresh');
    res = await fetchWithTimeout(url, { headers: headers2 } as any, FETCH_TIMEOUT_MS);
  }
  if (!res.ok && [502,503,504].includes(res.status)) {
    await delay(300);
    logger.warn({ url, status: res.status }, 'trendlyne_fetch_abs_retry_transient');
    res = await fetchWithTimeout(url, { headers } as any, FETCH_TIMEOUT_MS);
  }
  if (!res.ok) {
    logger.error({ url, status: res.status, ms: Date.now()-t0 }, 'trendlyne_fetch_abs_failed');
    throw new Error(`trendlyne_${res.status}`);
  }
  try { return await res.json(); } catch { return await res.text(); }
}

// Extract close-price timeseries from various OHLC JSON shapes
function extractCloseSeries(ohlc: any): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  if (!ohlc) return out;
  // Common shapes: array of candles or object with data/series
  const rows = Array.isArray(ohlc) ? ohlc : (Array.isArray(ohlc?.data) ? ohlc.data : (Array.isArray(ohlc?.series) ? ohlc.series : null));
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (!r) continue;
      // Object form: { t|time|date, c|close }
      const t = (r as any).t ?? (r as any).time ?? (r as any).date ?? (Array.isArray(r) ? (r as any)[0] : undefined);
      const c = (r as any).c ?? (r as any).close ?? (Array.isArray(r) ? (r as any)[4] : undefined);
      const ts = typeof t === 'number' ? t : (Date.parse(String(t)) / 1000);
      const val = Number(c);
      if (isFinite(ts) && isFinite(val)) out.push({ t: ts > 2_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts), v: val });
    }
  }
  return out.sort((a,b)=> a.t - b.t);
}

function computeSma(points: Array<{ t:number; v:number }>, period=20): Array<{ t:number; v:number }> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<{ t:number; v:number }> = [];
  let sum = 0;
  const q: number[] = [];
  for (const pt of points) {
    q.push(pt.v);
    sum += pt.v;
    if (q.length > p) sum -= q.shift() as number;
    if (q.length === p) out.push({ t: pt.t, v: sum / p });
  }
  return out;
}
