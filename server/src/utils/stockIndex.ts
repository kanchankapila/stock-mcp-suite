import Fuse from 'fuse.js';
import { loadStocklist, StockEntry } from './stocklist.js';

export type StockSearchResult = {
  symbol?: string;
  name?: string;
  mcsymbol?: string;
  isin?: string;
  tlid?: string;
  score?: number; // fuzzy match score (lower is better)
  match?: string; // which field matched primarily
};

class StockIndex {
  private bySymbol = new Map<string, StockEntry>();
  private byIsin = new Map<string, StockEntry>();
  private byTlid = new Map<string, StockEntry>();
  private byMcSymbol = new Map<string, StockEntry>();
  // Using any because fuse.js shim provides no TS generics under NodeNext
  private fuse: any = null;
  private lastBuildAt = 0;
  private buildMs = 0;

  private ensureBuilt() {
    const now = Date.now();
    if (this.fuse && (now - this.lastBuildAt) < 60_000) return; // refresh at most once per minute
    const entries = loadStocklist();
    this.bySymbol.clear();
    this.byIsin.clear();
    this.byTlid.clear();
    this.byMcSymbol.clear();
    const t0 = performance.now?.() || Date.now();
    for (const e of entries) {
      if (e.symbol) this.bySymbol.set(e.symbol.toUpperCase(), e);
      if (e.isin) this.byIsin.set(e.isin.toUpperCase(), e);
      if (e.tlid) this.byTlid.set(e.tlid.toUpperCase(), e);
      if (e.mcsymbol) this.byMcSymbol.set(e.mcsymbol.toUpperCase(), e);
    }
    this.fuse = new (Fuse as any)(entries, {
      keys: [
        { name: 'symbol', weight: 0.5 },
        { name: 'name', weight: 0.3 },
        { name: 'mcsymbol', weight: 0.1 },
        { name: 'isin', weight: 0.05 },
        { name: 'tlid', weight: 0.05 }
      ],
      threshold: 0.4, // balance precision/recall
      ignoreLocation: true,
      minMatchCharLength: 2,
      shouldSort: true,
      useExtendedSearch: true
    });
    this.lastBuildAt = now;
    this.buildMs = (performance.now?.() || Date.now()) - t0;
  }

  search(query: string, limit = 15): StockSearchResult[] {
    this.ensureBuilt();
    if (!query || !this.fuse) return [];
    const q = query.trim();
    // Fast path: exact key lookups
    const up = q.toUpperCase();
    const exact: StockSearchResult[] = [];
    const pushUnique = (e?: StockEntry, match?: string) => {
      if (!e) return; if (exact.find(x => x.symbol === e.symbol)) return;
      exact.push({ ...e, score: 0, match });
    };
    if (this.bySymbol.has(up)) pushUnique(this.bySymbol.get(up), 'symbol');
    if (this.byMcSymbol.has(up)) pushUnique(this.byMcSymbol.get(up), 'mcsymbol');
    if (this.byIsin.has(up)) pushUnique(this.byIsin.get(up), 'isin');
    if (this.byTlid.has(up)) pushUnique(this.byTlid.get(up), 'tlid');
    // If exact results found and either query length > 2 or it's a known code, return them plus fuzzy fill
    const fuzzyNeeded = exact.length < limit;
    const results: StockSearchResult[] = [...exact];
    if (fuzzyNeeded) {
      const fuseResults = this.fuse.search(q, { limit: limit * 2 });
      for (const fr of fuseResults) {
        const e = fr.item;
        if (results.find(r => r.symbol === e.symbol)) continue;
        results.push({ ...e, score: fr.score ?? 1 });
        if (results.length >= limit) break;
      }
    }
    return results.slice(0, limit);
  }

  stats() {
    this.ensureBuilt();
    return {
      size: this.bySymbol.size,
      lastBuildAt: this.lastBuildAt,
      buildMs: Number(this.buildMs.toFixed(2))
    };
  }
}

const singleton = new StockIndex();
export function searchStocks(query: string, limit?: number) { return singleton.search(query, limit); }
export function stockIndexStats() { return singleton.stats(); }
