import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

type YFin = any;

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

async function fetchYFin(symbol: string, period='1y', interval='1d'): Promise<YFin|null> {
  try { const r = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/yahoo-fin?period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`); if (!r.ok) throw new Error(await r.text()); return await r.json(); } catch { return null; }
}

function renderKpis(json: YFin) {
  const body = document.getElementById('yfinKpisBody');
  if (!body) return;
  try {
    const live = Number(json?.live_price ?? NaN);
    const qt = json?.quote_table || {};
    const price = Number.isFinite(live) ? live.toFixed(2) : text(qt['Previous Close']);
    const mcap = text(qt['Market Cap'] ?? (json?.stats_valuation?.[0]?.['Market Cap (intraday)'] ?? '-'));
    const pe = text(qt['PE Ratio (TTM)'] ?? '-');
    const eps = text(qt['EPS (TTM)'] ?? '-');
    const beta = text(qt['Beta (5Y Monthly)'] ?? '-');
    const div = text(qt['Forward Dividend & Yield'] ?? '-');
    const range52 = text(qt['52 Week Range'] ?? '-');
    body.innerHTML = `
      <div class="grid-3" style="gap:12px; font-size:12px">
        <div><div class="muted">Price</div><div class="stat-sm">${price}</div></div>
        <div><div class="muted">Market Cap</div><div class="stat-sm">${mcap}</div></div>
        <div><div class="muted">PE (TTM)</div><div class="stat-sm">${pe}</div></div>
        <div><div class="muted">EPS (TTM)</div><div class="stat-sm">${eps}</div></div>
        <div><div class="muted">Beta</div><div class="stat-sm">${beta}</div></div>
        <div><div class="muted">Div/Yield</div><div class="stat-sm">${div}</div></div>
        <div><div class="muted">52W Range</div><div class="stat-sm">${range52}</div></div>
      </div>`;
  } catch {
    body.innerHTML = '<div class="muted">No KPI data</div>';
  }
}

function renderProfile(json: YFin) {
  const body = document.getElementById('yfinProfileBody');
  if (!body) return;
  try {
    // yahoo_fin get_company_info returns DataFrame -> to_dict(); normalize common fields
    const info = json?.info || {};
    // Attempt common keys across shapes
    const sector = info?.sector ?? info?.Sector ?? info?.sector?.Value ?? '-';
    const industry = info?.industry ?? info?.Industry ?? info?.industry?.Value ?? '-';
    const website = info?.website ?? info?.Website ?? info?.website?.Value ?? '';
    const employees = info?.fullTimeEmployees ?? info?.FullTimeEmployees ?? info?.full_time_employees ?? '-';
    const summary = info?.longBusinessSummary ?? info?.long_business_summary ?? '';
    const holders = json?.holders || {};
    const inst = holders?.institutional_holders ? JSON.stringify(holders.institutional_holders).length : 0;
    body.innerHTML = `
      <div class="grid-2" style="gap:12px; font-size:12px">
        <div><div class="muted">Sector</div><div>${text(sector)}</div></div>
        <div><div class="muted">Industry</div><div>${text(industry)}</div></div>
        <div><div class="muted">Employees</div><div>${text(employees)}</div></div>
        <div><div class="muted">Website</div><div>${website ? `<a href="${website}" target="_blank" rel="noopener">${website}</a>` : '-'}</div></div>
      </div>
      ${summary ? `<div class="muted" style="margin-top:8px">Summary</div><div style="margin-top:4px">${summary}</div>` : ''}
    `;
  } catch {
    body.innerHTML = '<div class="muted">No profile data</div>';
  }
}

function renderFinancials(json: YFin) {
  const ctx = (document.getElementById('yfinFinChart') as HTMLCanvasElement)?.getContext('2d');
  const hint = document.getElementById('yfinFinHint');
  if (!ctx) return;
  try {
    // Parse revenue series from income_statement
    const isObj = json?.income_statement || {};
    const revMap = isObj?.totalRevenue || isObj?.TotalRevenue || null;
    const labels: string[] = [];
    const rev: number[] = [];
    if (revMap && typeof revMap === 'object') {
      const entries = Object.entries(revMap).filter(([k,_]) => /\d{4}/.test(String(k)) || /\d{4}-\d{2}-\d{2}/.test(String(k)));
      entries.sort((a,b)=> String(a[0]) < String(b[0]) ? -1 : 1);
      for (const [k,v] of entries) { labels.push(String(k)); rev.push(Number(v) || 0); }
    }
    // EPS from analysts_info (history) if present
    const epsArr: Array<any> = json?.earnings_history || [];
    const epsLabels: string[] = []; const eps: number[] = [];
    if (Array.isArray(epsArr)) {
      for (const row of epsArr.slice(-8)) {
        const d = row?.startdatetime || row?.quarter || row?.endDate || '';
        const val = Number(row?.epsactual ?? row?.epsActual ?? row?.eps_estimate ?? NaN);
        if (d) epsLabels.push(String(d)); eps.push(Number.isFinite(val) ? val : 0);
      }
    }
    // Build chart with two y-axes
    const dataLabels = labels.length ? labels : epsLabels;
    const ds: any[] = [];
    if (rev.length && dataLabels.length === labels.length) ds.push({ type:'bar', label:'Revenue', data: rev, yAxisID:'y1', backgroundColor:'#60a5fa' });
    if (eps.length && dataLabels.length === epsLabels.length) ds.push({ type:'line', label:'EPS', data: eps, yAxisID:'y2', borderColor:'#34d399', backgroundColor:'rgba(52,211,153,0.15)', borderWidth:2, fill:true, tension:0.25, pointRadius:0 });
    const chart = new Chart(ctx, { type:'bar', data: { labels: dataLabels, datasets: ds }, options: { responsive:true, plugins: { legend:{ position:'top' } }, scales: { y1: { type:'linear', position:'left', ticks:{ callback:(v)=> String(v) } }, y2: { type:'linear', position:'right', grid:{ drawOnChartArea:false } } } } });
    if (hint) hint.textContent = 'Source: yahoo_fin';
  } catch {
    if (hint) hint.textContent = 'No financials data';
  }
}

async function renderYahooFinCards(symbol: string) {
  const yfin = await fetchYFin(symbol).catch(()=>null);
  if (!yfin || yfin.ok === false) {
    const k = document.getElementById('yfinKpisBody'); if (k) k.innerHTML = '<div class="muted">Failed to load KPIs</div>';
    const p = document.getElementById('yfinProfileBody'); if (p) p.innerHTML = '<div class="muted">Failed to load profile</div>';
    const h = document.getElementById('yfinFinHint'); if (h) h.textContent = 'Failed to load financials';
    return;
  }
  renderKpis(yfin);
  renderProfile(yfin);
  renderFinancials(yfin);
}

function currentSelectedSymbol(): string {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const v = sel?.value || (localStorage.getItem('selectedSymbol') || '');
  return v ? v.toUpperCase() : v;
}

function attachYahooFinHandlers() {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  if (sel) sel.addEventListener('change', () => { const s = currentSelectedSymbol(); if (s) renderYahooFinCards(s); });
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCards();
  attachYahooFinHandlers();
  const s = currentSelectedSymbol(); if (s) renderYahooFinCards(s);
});

