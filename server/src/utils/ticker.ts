import { loadStocklist } from './stocklist.js';

type Provider = 'yahoo' | 'alpha' | 'news' | 'mc';

type Entry = {
  name?: string;
  symbol?: string;
  mcsymbol?: string;
  isin?: string;
  tlid?: string;
};

function getEnv(key: string, def: string) {
  const v = process.env[key];
  return (v === undefined || v === null || v === '') ? def : v;
}

function providerConfig(provider: Provider) {
  const p = provider.toUpperCase();
  return {
    key: getEnv(`TICKER_${p}_KEY`, provider === 'news' ? 'name' : provider === 'mc' ? 'mcsymbol' : 'symbol'),
    suffix: getEnv(`TICKER_${p}_SUFFIX`, provider === 'yahoo' ? '.NS' : ''),
  } as { key: keyof Entry, suffix: string };
}

function normalize(s: string) { return String(s || '').trim().toUpperCase(); }

function matchEntry(input: string, entries: Entry[]): Entry | undefined {
  const q = normalize(input);
  return entries.find(e =>
    normalize(e.symbol || '') === q ||
    normalize(e.mcsymbol || '') === q ||
    normalize(e.name || '') === q ||
    normalize(e.isin || '') === q ||
    normalize(e.tlid || '') === q
  );
}

export function resolveTicker(input: string, provider: Provider): string {
  const entries = loadStocklist() as Entry[];
  const cfg = providerConfig(provider);
  // If input already contains a dot suffix (e.g., .NS), accept as-is
  if (/[A-Za-z0-9]+\.[A-Za-z]{1,6}$/.test(input)) return input.toUpperCase();
  const e = matchEntry(input, entries);
  // Prefer configured key; if missing/invalid, fall back sensibly so Yahoo doesn't
  // end up using Moneycontrol ids like BE03.NS when a symbol exists.
  const isValid = (s?: string) => !!s && s.trim() !== '' && s.toUpperCase() !== '#N/A';
  let base: string = input;
  if (e) {
    const pref = e[cfg.key];
    if (isValid(pref)) {
      base = String(pref);
    } else {
      // Generic fallback order: prefer symbol, then mcsymbol, then other identifiers
      if (provider === 'mc') {
        base = String(
          (isValid(e.mcsymbol) && e.mcsymbol) ||
          (isValid(e.symbol) && e.symbol) ||
          (isValid(e.name) && e.name) ||
          (isValid(e.isin) && e.isin) ||
          (isValid(e.tlid) && e.tlid) ||
          input
        );
      } else {
        base = String(
          (isValid(e.symbol) && e.symbol) ||
          (isValid(e.mcsymbol) && e.mcsymbol) ||
          (isValid(e.name) && e.name) ||
          (isValid(e.isin) && e.isin) ||
          (isValid(e.tlid) && e.tlid) ||
          input
        );
      }
    }
  }
  const t = normalize(String(base));
  // Only append suffix if not already present
  const suff = cfg.suffix;
  if (!suff) return t;
  return t.endsWith(suff.toUpperCase()) ? t : `${t}${suff}`;
}

export function findStockEntry(input: string) {
  const entries = loadStocklist() as Entry[];
  return matchEntry(input, entries);
}
