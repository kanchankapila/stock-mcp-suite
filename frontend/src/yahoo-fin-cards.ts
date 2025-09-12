import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

type YFull = {
  symbol: string; quote: any; chart: any; summary: any;
};

const api = new Api();

function ensureCards() {
  const container = document.querySelector('main.content .container') || document.querySelector('main.content') || document.body;
  if (!container) return;
  // KPIs card
  if (!document.getElementById('yfinKpis')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'yfinKpis';
    card.innerHTML = `<div class="muted">Yahoo KPIs</div><div id="yfinKpisBody" style="margin-top:6px">Loading…</div>`;
    container.appendChild(card);
  }
  // Profile card
  if (!document.getElementById('yfinProfile')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'yfinProfile';
    card.innerHTML = `<div class="muted">Company Profile</div><div id="yfinProfileBody" style="margin-top:6px">Loading…</div>`;
    container.appendChild(card);
  }
  // Financials chart card
  if (!document.getElementById('yfinFinancials')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'yfinFinancials';
    card.innerHTML = `<div class="muted">Financials</div><div class="muted" style="font-size:12px">Revenue / EPS</div><canvas id="yfinFinChart" style="margin-top:6px; max-height:240px"></canvas><div id="yfinFinHint" class="muted" style="font-size:11px; margin-top:6px"></div>`;
    container.appendChild(card);
  }
}

function fmtNum(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n/1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

function text(v: any): string { return v==null ? '-' : String(v); }

async function fetchYahooData(symbol: string): Promise<YFull | null> {
  try {
    const r: any = await api.yahooFull(symbol, '1y', '1d', 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics,earnings');
    if (!r?.ok) return null;
    return r.data as YFull;
  } catch { return null; }
}

function renderKpisFull(data: YFull) {
  const body = document.getElementById('yfinKpisBody');
  if (!body) return;
  try {
    const sm = data.summary?.result?.[0] || {};
    const priceMod = sm.price || {};
    const summaryDetail = sm.summaryDetail || {};
    const stats = sm.defaultKeyStatistics || {};
    const livePrice = priceMod.regularMarketPrice?.raw ?? priceMod.regularMarketPrice ?? data.quote?.price ?? null;
    const prevClose = priceMod.regularMarketPreviousClose?.fmt || priceMod.regularMarketPreviousClose?.raw || priceMod.regularMarketPreviousClose;
    const price = livePrice != null && isFinite(Number(livePrice)) ? Number(livePrice).toFixed(2) : (prevClose ?? '-');
    const marketCap = (priceMod.marketCap?.fmt || summaryDetail.marketCap?.fmt || stats.marketCap?.fmt || '-');
    const pe = priceMod.trailingPE?.fmt || summaryDetail.trailingPE?.fmt || stats.trailingPE?.fmt || '-';
    const eps = priceMod.trailingEps?.fmt || stats.trailingEps?.fmt || '-';
    const beta = priceMod.beta?.fmt || stats.beta?.fmt || '-';
    const fwdDivYield = summaryDetail.dividendYield ? (Number(summaryDetail.dividendYield.raw)*100).toFixed(2)+'%' : (summaryDetail.trailingAnnualDividendYield ? (Number(summaryDetail.trailingAnnualDividendYield.raw)*100).toFixed(2)+'%' : '-');
    const range52 = summaryDetail.fiftyTwoWeekRange?.fmt || `${summaryDetail.fiftyTwoWeekLow?.fmt || ''} - ${summaryDetail.fiftyTwoWeekHigh?.fmt || ''}`.trim() || '-';
    body.innerHTML = `
      <div class="grid-3" style="gap:12px; font-size:12px">
        <div><div class="muted">Price</div><div class="stat-sm">${price}</div></div>
        <div><div class="muted">Market Cap</div><div class="stat-sm">${marketCap}</div></div>
        <div><div class="muted">PE (TTM)</div><div class="stat-sm">${pe}</div></div>
        <div><div class="muted">EPS (TTM)</div><div class="stat-sm">${eps}</div></div>
        <div><div class="muted">Beta</div><div class="stat-sm">${beta}</div></div>
        <div><div class="muted">Div/Yield</div><div class="stat-sm">${fwdDivYield}</div></div>
        <div><div class="muted">52W Range</div><div class="stat-sm">${range52}</div></div>
      </div>`;
  } catch {
    body.innerHTML = '<div class="muted">No KPI data</div>';
  }
}

function renderProfileFull(data: YFull) {
  const body = document.getElementById('yfinProfileBody');
  if (!body) return;
  try {
    const sm = data.summary?.result?.[0] || {};
    const prof = sm.assetProfile || {};
    const sector = prof.sector || '-';
    const industry = prof.industry || '-';
    const website = prof.website || '';
    const employees = prof.fullTimeEmployees || prof.fulltimeEmployees || '-';
    const summary = prof.longBusinessSummary || '';
    body.innerHTML = `
      <div class="grid-2" style="gap:12px; font-size:12px">
        <div><div class="muted">Sector</div><div>${sector}</div></div>
        <div><div class="muted">Industry</div><div>${industry}</div></div>
        <div><div class="muted">Employees</div><div>${employees}</div></div>
        <div><div class="muted">Website</div><div>${website ? `<a href="${website}" target="_blank" rel="noopener">${website}</a>` : '-'}</div></div>
      </div>
      ${summary ? `<div class="muted" style="margin-top:8px">Summary</div><div style="margin-top:4px">${summary}</div>` : ''}
    `;
  } catch {
    body.innerHTML = '<div class="muted">No profile data</div>';
  }
}

function renderFinancialsFull(data: YFull) {
  const ctx = (document.getElementById('yfinFinChart') as HTMLCanvasElement)?.getContext('2d');
  const hint = document.getElementById('yfinFinHint');
  if (!ctx) return;
  try {
    const sm = data.summary?.result?.[0] || {};
    const earnings = sm.earnings || {};
    const chartData = earnings.earningsChart || {};
    const quarterly: Array<any> = chartData.quarterly || [];
    const labels: string[] = [];
    const rev: number[] = [];
    const eps: number[] = [];
    for (const q of quarterly.slice(-12)) {
      labels.push(q.date || q.quarter || '');
      rev.push(q.revenue?.raw ?? q.revenue ?? 0);
      eps.push(q.actual?.raw ?? q.actual ?? q.epsActual ?? 0);
    }
    // Fallback to financialData totalRevenue trend if quarterly empty
    if (!labels.length) {
      const fin = sm.financialData || {};
      if (fin.totalRevenue?.raw) {
        labels.push('Revenue'); rev.push(fin.totalRevenue.raw); eps.push(0);
      }
    }
    const ds: any[] = [];
    if (rev.length) ds.push({ type: 'bar', label: 'Revenue', data: rev, yAxisID: 'y1', backgroundColor: '#60a5fa' });
    if (eps.length) ds.push({ type: 'line', label: 'EPS', data: eps, yAxisID: 'y2', borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.15)', borderWidth: 2, fill: true, tension: 0.25, pointRadius: 0 });
    new Chart(ctx, { type: 'bar', data: { labels, datasets: ds }, options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y1: { type: 'linear', position: 'left' }, y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } } } } });
    if (hint) hint.textContent = 'Source: Yahoo (backend)';
  } catch {
    if (hint) hint.textContent = 'No financials data';
  }
}

async function renderYahooCards(symbol: string) {
  const data = await fetchYahooData(symbol);
  if (!data) {
    const k = document.getElementById('yfinKpisBody'); if (k) k.innerHTML = '<div class="muted">Failed to load KPIs</div>';
    const p = document.getElementById('yfinProfileBody'); if (p) p.innerHTML = '<div class="muted">Failed to load profile</div>';
    const h = document.getElementById('yfinFinHint'); if (h) h.textContent = 'Failed to load financials';
    return;
  }
  renderKpisFull(data);
  renderProfileFull(data);
  renderFinancialsFull(data);
}

function currentSelectedSymbol(): string {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const v = sel?.value || (localStorage.getItem('selectedSymbol') || '');
  return v ? v.toUpperCase() : v;
}

function attachYahooHandlers() {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  if (sel) sel.addEventListener('change', () => { const s = currentSelectedSymbol(); if (s) renderYahooCards(s); });
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCards();
  attachYahooHandlers();
  const s = currentSelectedSymbol(); if (s) renderYahooCards(s);
});

