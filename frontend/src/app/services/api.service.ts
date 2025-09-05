export class Api {
  // Prefer Vite env var; otherwise use relative path so Vite proxy can handle it
  constructor(
    private base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || ''
  ) {}

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

  async mcTech(symbol: string, freq: 'D'|'W'|'M'='D') {
    const url = new URL(`${this.base}/api/stocks/${symbol}/mc-tech`);
    url.searchParams.set('freq', freq);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async yahooFull(symbol: string, range='1y', interval='1d', modules='price,summaryDetail,assetProfile,financialData,defaultKeyStatistics') {
    const url = new URL(`${this.base}/api/stocks/${symbol}/yahoo-full`);
    url.searchParams.set('range', range);
    url.searchParams.set('interval', interval);
    url.searchParams.set('modules', modules);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // External data
  async etIndices() {
    const res = await fetch(`${this.base}/api/external/et/indices`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async etSectorPerformance() {
    const res = await fetch(`${this.base}/api/external/et/sector-performance`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async etIndexConstituents(indexId: string, pagesize=200, pageno=1) {
    const url = new URL(`${this.base}/api/external/et/index-constituents`);
    url.searchParams.set('indexId', indexId);
    url.searchParams.set('pagesize', String(pagesize));
    url.searchParams.set('pageno', String(pageno));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async mcPriceVolume(scId: string) {
    const url = new URL(`${this.base}/api/external/mc/price-volume`);
    url.searchParams.set('scId', scId);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async mcStockHistory(symbol: string, resolution='1D', from?: number, to?: number) {
    const url = new URL(`${this.base}/api/external/mc/stock-history`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('resolution', resolution);
    if (from) url.searchParams.set('from', String(from));
    if (to) url.searchParams.set('to', String(to));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async tickertapeMmi() {
    const res = await fetch(`${this.base}/api/external/tickertape/mmi`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async marketsMojoValuation() {
    const res = await fetch(`${this.base}/api/external/marketsmojo/valuation`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Moneycontrol quick bundle
  async mcQuick(symbol: string, fid?: string) {
    const url = new URL(`${this.base}/api/external/mc/quick`, window.location.origin);
    url.searchParams.set('symbol', symbol);
    if (fid) url.searchParams.set('fid', fid);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Trendlyne
  async tlAdvTechBySymbol(symbol: string) {
    const url = new URL(`${this.base}/api/external/trendlyne/adv-tech`);
    url.searchParams.set('symbol', symbol);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async tlDerivatives(date: string, tlid?: string) {
    const url = new URL(`${this.base}/api/external/trendlyne/derivatives`);
    url.searchParams.set('date', date);
    if (tlid) url.searchParams.set('tlid', tlid);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // AlphaVantage (via stocks route)
  async alphaVantageIngest(symbol: string) {
    const res = await fetch(`${this.base}/api/stocks/alpha/ingest/${symbol}`, { method:'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Yahoo specific routes
  async yahooIngest(symbol: string, range='1y', interval='1d') {
    const url = new URL(`${this.base}/api/stocks/yahoo/ingest/${symbol}`);
    url.searchParams.set('range', range);
    url.searchParams.set('interval', interval);
    const res = await fetch(url.toString(), { method:'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Resolve ticker mapping
  async resolveTicker(input: string) {
    const res = await fetch(`${this.base}/api/resolve/${input}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // RAG helpers
  async ragIndex(namespace: string, urls: string[]) {
    const res = await fetch(`${this.base}/api/rag/index`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ namespace, urls }) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async ragQuery(namespace: string, query: string, k=5, withAnswer=true) {
    const res = await fetch(`${this.base}/api/rag/query`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ namespace, query, k, withAnswer }) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  ragStream(namespace: string, query: string, k=5) {
    return fetch(`${this.base}/api/rag/stream`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ namespace, query, k }) });
  }

  agentStream(q: string, symbol?: string) {
    return fetch(`${this.base}/api/agent/stream`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ q, symbol }) });
  }
}
