// Global app state store (lightweight)
// Provides reactive subscribe() for symbol & timeframe.

export type Timeframe = 'D' | 'M' | 'Y';
export interface AppStateSnapshot { symbol: string | null; timeframe: Timeframe; page: string; }

type Listener = (s: AppStateSnapshot, change: Partial<AppStateSnapshot>) => void;

class AppStateStore {
  private _symbol: string | null = null;
  private _timeframe: Timeframe = 'D';
  private _page = 'overview';
  private listeners = new Set<Listener>();

  snapshot(): AppStateSnapshot { return { symbol: this._symbol, timeframe: this._timeframe, page: this._page }; }
  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setSymbol(symbol: string | null) { if (symbol === this._symbol) return; this._symbol = symbol; this.emit({ symbol }); }
  setTimeframe(tf: Timeframe) { if (tf === this._timeframe) return; this._timeframe = tf; this.emit({ timeframe: tf }); }
  setPage(p: string) { if (p === this._page) return; this._page = p; this.emit({ page: p }); }

  private emit(change: Partial<AppStateSnapshot>) { const snap = this.snapshot(); for (const l of Array.from(this.listeners)) { try { l(snap, change); } catch {} } }
}

export const AppState = new AppStateStore();
