import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

let TL_COOKIE_CACHE: { cookie: string, ts: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours persisted cache default

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
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const text = await res.text();
      // Try JSON first
      try {
        const j = JSON.parse(text);
        const ck = j.cookie || j.Cookie || j.COOKIES || null;
        if (ck) { TL_COOKIE_CACHE = { cookie: ck, ts: now }; saveCookieToFile(ck); return ck; }
      } catch {}
      // Otherwise raw cookie string
      if (text && text.length > 8) { const ck = text.trim(); TL_COOKIE_CACHE = { cookie: ck, ts: now }; saveCookieToFile(ck); return ck; }
    } catch (err) { logger.warn({ err, url: u }, 'trendlyne_cookie_fetch_failed'); }
  }
  return null;
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
  let res = await fetch(url, { headers });
  // If unauthorized/forbidden, force-refresh cookie once
  if (res.status === 401 || res.status === 403) {
    await fetchTrendlyneCookie(true);
    const ck2 = TL_COOKIE_CACHE?.cookie || null;
    const headers2 = { ...headers };
    if (ck2) headers2['Cookie'] = ck2;
    res = await fetch(url, { headers: headers2 });
  }
  if (!res.ok) throw new Error(`trendlyne_${res.status}`);
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

export async function tlAdvTechnical(tlid: string, lookback: number = 24) {
  const path = `/equity/api/stock/adv-technical-analysis/${encodeURIComponent(tlid)}/${encodeURIComponent(String(lookback))}/`;
  return await tlFetch(path);
}

export async function tlSmaChart(tlid: string) {
  const path = `/mapp/v1/stock/chart-data/${encodeURIComponent(tlid)}/SMA/`;
  return await tlFetch(path);
}

export async function tlDerivativeBuildup(dateKey: string, tlid: string) {
  const path = `/futures-options/api/derivative/buildup-15/${encodeURIComponent(dateKey)}-near/${encodeURIComponent(tlid)}/`;
  return await tlFetch(path);
}

export async function tlHeatmap(dateKey: string) {
  const path = `/futures-options/api/heatmap/${encodeURIComponent(dateKey)}-near/all/price/`;
  return await tlFetch(path);
}
