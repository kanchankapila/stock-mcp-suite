export class MLClient {
  private base: string;
  constructor(base?: string) {
    const env = (process.env.ML_BASE_URL || '').trim();
    this.base = base || (env || 'http://localhost:5001');
  }

  private async _fetch(path: string, init?: RequestInit, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const to = setTimeout(()=> ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, { ...(init||{}), signal: ctrl.signal });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } finally { clearTimeout(to); }
  }

  async features(symbol: string, days=60) {
    const p = new URL('/features', this.base);
    p.searchParams.set('symbol', symbol);
    p.searchParams.set('days', String(days));
    const r = await this._fetch(p.pathname + p.search);
    return r?.data ?? r;
  }

  async predict(symbol: string, body?: any) {
    const p = new URL(`/predict/${encodeURIComponent(symbol)}`, this.base);
    const r = await this._fetch(p.pathname + p.search, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    return r?.data ?? r;
  }

  async backtestRun(cfg: any) {
    const r = await this._fetch('/backtest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg||{}) });
    return r?.data ?? r;
  }

  async backtestGet(id: string) {
    const r = await this._fetch(`/backtest/${encodeURIComponent(id)}`);
    return r?.data ?? r;
  }

  async models() {
    const r = await this._fetch('/models');
    return r?.data ?? r;
  }

  async modelById(id: string) {
    const r = await this._fetch(`/models/${encodeURIComponent(id)}`);
    return r?.data ?? r;
  }

  async walkforward(symbol: string, body?: any) {
    const p = new URL(`/walkforward/${encodeURIComponent(symbol)}`, this.base);
    const r = await this._fetch(p.pathname + p.search, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    return r?.data ?? r;
  }
}
