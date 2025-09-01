export class Api {
  constructor(private base = 'http://localhost:4010') {}

  async ingest(symbol: string) {
    const res = await fetch(`${this.base}/api/ingest/${symbol}`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async overview(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/overview`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async history(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/history`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async news(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/news`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async analyze(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/analyze`, { method:'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async dbStats(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/db`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async agent(q: string, symbol?: string) {
    const url = new URL(`${this.base}/api/agent`);
    url.searchParams.set('q', q);
    if (symbol) url.searchParams.set('symbol', symbol);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async listStocks() {
    const res = await fetch(`${this.base}/api/stocks/list`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async mcInsight(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/${symbol}/mc-insight`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
}
