import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

function baseHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9'
  } as Record<string,string>;
}

function domainHeaders(url: string) {
  const h: Record<string,string> = {};
  if (/moneycontrol\.com/i.test(url)) {
    h['Referer'] = 'https://www.moneycontrol.com/';
    h['Origin'] = 'https://www.moneycontrol.com';
  }
  if (/etmarketsapis\.indiatimes\.com|indiatimes\.com/i.test(url)) {
    h['Referer'] = 'https://economictimes.indiatimes.com/';
    h['Origin'] = 'https://economictimes.indiatimes.com';
    h['X-Requested-With'] = 'XMLHttpRequest';
  }
  if (/tickertape\.in/i.test(url)) {
    h['Referer'] = 'https://www.tickertape.in/';
    h['Origin'] = 'https://www.tickertape.in';
  }
  if (/marketsmojo\.com/i.test(url)) {
    h['Referer'] = 'https://www.marketsmojo.com/';
    h['Origin'] = 'https://www.marketsmojo.com';
  }
  return h;
}

async function fetchJson(url: string, extra?: Record<string,string>, timeoutMs=12000, attempts=2) {
  const headers = { ...baseHeaders(), ...domainHeaders(url), ...(extra||{}) };
  let lastErr: any;
  for (let i=0; i<attempts; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) {
        lastErr = new Error(`${res.status}`);
      } else {
        try { return await res.json(); } catch { return null; }
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r=>setTimeout(r, 300 + i*300));
  }
  logger.warn({ url, err: lastErr?.message || String(lastErr) }, 'external_fetch_failed');
  throw lastErr || new Error('fetch_failed');
}

async function safeJson(res: any) { try { return await res.json(); } catch { return null; } }

export async function etGetAllIndices() {
  const url = 'https://etmarketsapis.indiatimes.com/ET_Stats/getAllIndices?exchange=nse&sortby=value&sortorder=desc&pagesize=100';
  return await fetchJson(url);
}

export async function etSectorPerformance() {
  const url = 'https://etmarketsapis.indiatimes.com/ET_Stats/sectorperformance?pagesize=25&pageno=1&exchange=NSE&sortby=marketcappercentchange&sortorder=desc';
  return await fetchJson(url);
}

// ET Markets: Index constituents by indexId (NSE). API shape may vary; we proxy JSON directly.
export async function etIndexConstituents(indexId: string, pageSize=500, pageNo=1) {
  const id = String(indexId).trim();
  if (!id) throw new Error('indexId required');
  // Several endpoints exist; this one is commonly available
  const url = `https://etmarketsapis.indiatimes.com/ET_Stats/indexconstituents?indexid=${encodeURIComponent(id)}&pagesize=${pageSize}&pageno=${pageNo}`;
  return await fetchJson(url);
}

export async function mcPriceVolume(scId: string) {
  const id = scId.toUpperCase();
  const url = `https://api.moneycontrol.com/mcapi/v1/stock/price-volume?scId=${encodeURIComponent(id)}`;
  return await fetchJson(url);
}

export async function mcStockHistory(eqSymbol: string, resolution='1D', from?: number, to?: number) {
  const sym = eqSymbol.toUpperCase();
  const params = new URLSearchParams({ symbol: sym, resolution });
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  params.set('countback','365'); params.set('currencyCode','INR');
  const url = `https://priceapi.moneycontrol.com/techCharts/indianMarket/stock/history?${params.toString()}`;
  return await fetchJson(url);
}

export async function mcChartInfo(scId: string, resolution='1D') {
  const id = scId.toUpperCase();
  const url = `https://www.moneycontrol.com/mc/widget/stockdetails/getChartInfo?classic=true&scId=${encodeURIComponent(id)}&resolution=${encodeURIComponent(resolution)}`;
  return await fetchJson(url);
}

export async function mcPriceForecast(scId: string) {
  const id = scId.toUpperCase();
  const url = `https://api.moneycontrol.com/mcapi/v1/stock/estimates/price-forecast?scId=${encodeURIComponent(id)}&ex=N&deviceType=W`;
  return await fetchJson(url);
}

export async function mcFnoExpiries(fid: string) {
  const url = `https://api.moneycontrol.com/mcapi/v1/fno/futures/getExpDts?id=${encodeURIComponent(fid)}`;
  return await fetchJson(url);
}

export async function mcTechRsi(scId: string, freq: 'D'|'W'|'M'='D') {
  const id = scId.toUpperCase();
  const f = String(freq).toUpperCase() as 'D'|'W'|'M';
  const url = `https://priceapi.moneycontrol.com/pricefeed/techindicator/${encodeURIComponent(f)}/${encodeURIComponent(id)}?field=RSI`;
  return await fetchJson(url);
}

export async function tickertapeMmiNow() {
  const url = 'https://api.tickertape.in/mmi/now';
  return await fetchJson(url);
}

export async function marketsMojoValuationMeter() {
  const url = 'https://frapi.marketsmojo.com/stocks/valuationMeter';
  return await fetchJson(url);
}
