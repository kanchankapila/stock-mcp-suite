// Portfolio Management Module
// Provides Portfolio page (summary, add form, performance chart, holdings table)
// Relies on backend endpoints already exposed (/api/portfolio, /api/portfolio/add, /api/portfolio/summary, /api/portfolio/performance)

import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const api = new Api();
let _chart: Chart | null = null;

function ensureRootCard() {
  let card = document.getElementById('portfolioCard');
  if (!card) {
    card = document.createElement('div');
    card.id = 'portfolioCard';
    card.className = 'card';
    card.innerHTML = `
      <div class="muted" style="font-weight:600; margin-bottom:8px">💼 Portfolio</div>
      <div id="pfSummary" class="flex" style="gap:24px; flex-wrap:wrap; margin-bottom:12px"></div>
      <form id="pfForm" class="flex" style="gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px">
        <div style="display:flex; flex-direction:column">
          <label class="muted" for="pfSymbol">Symbol</label>
          <input id="pfSymbol" required placeholder="AAPL" style="min-width:100px" />
        </div>
        <div style="display:flex; flex-direction:column">
          <label class="muted" for="pfDate">Buy Date</label>
            <input id="pfDate" type="date" required />
        </div>
        <div style="display:flex; flex-direction:column">
          <label class="muted" for="pfPrice">Buy Price</label>
          <input id="pfPrice" type="number" step="0.01" required />
        </div>
        <div style="display:flex; flex-direction:column">
          <label class="muted" for="pfQty">Qty</label>
          <input id="pfQty" type="number" min="1" step="1" required />
        </div>
        <button id="pfAdd" type="submit" class="btn-sm" style="height:36px">Add</button>
        <span id="pfMsg" class="muted"></span>
      </form>
      <div style="margin-bottom:12px">
        <canvas id="pfChart" style="max-height:220px"></canvas>
      </div>
      <div style="overflow:auto">
        <table id="pfTable" class="data-grid" style="width:100%; font-size:12px">
          <thead><tr>
            <th>Symbol</th><th>Buy Date</th><th>Buy Px</th><th>Qty</th><th>Invested</th><th>Current Px</th><th>Current Value</th><th>P&L</th><th>P&L %</th><th></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    const container = document.querySelector('main.content .container');
    if (container) container.appendChild(card);
  }
  return card as HTMLElement;
}

async function loadSummary() {
  try {
    const res = await api.portfolioSummary();
    const data = res?.data || res; // adjust for wrapper
    const el = document.getElementById('pfSummary'); if (!el) return;
    if (!data) { el.textContent = 'No summary'; return; }
    const { totalInvested = 0, currentValue = 0, totalPL = 0 } = data;
    function pill(label: string, value: number, color?: string) {
      return `<div class="kpi"><div class="muted" style="font-size:11px; text-transform:uppercase">${label}</div><div class="stat" style="font-size:18px;">${value.toLocaleString(undefined,{maximumFractionDigits:2})}</div></div>`;
    }
    el.innerHTML = pill('Invested', totalInvested) + pill('Current', currentValue) + `<div class="kpi"><div class="muted" style="font-size:11px; text-transform:uppercase">P&L</div><div class="stat" style="font-size:18px; color:${totalPL>=0?'var(--success)':'var(--danger)'}">${totalPL.toLocaleString(undefined,{maximumFractionDigits:2})}</div></div>`;
  } catch (e:any) {
    const el = document.getElementById('pfSummary'); if (el) el.textContent = 'Summary error: ' + (e?.message||e);
  }
}

async function loadPortfolio() {
  try {
    const res = await api.portfolio();
    const rows: any[] = res?.data || res || [];
    const tbody = document.querySelector('#pfTable tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => {
      const pnlColor = r.pnl >= 0 ? 'style="color:var(--success);font-weight:600"' : 'style="color:var(--danger);font-weight:600"';
      return `<tr>
        <td>${r.symbol}</td>
        <td>${r.buy_date||r.buyDate||''}</td>
        <td>${Number(r.buy_price||r.buyPrice).toFixed(2)}</td>
        <td>${r.quantity}</td>
        <td>${Number(r.invested).toFixed(2)}</td>
        <td>${Number(r.currentPrice).toFixed(2)}</td>
        <td>${Number(r.currentValue).toFixed(2)}</td>
        <td ${pnlColor}>${Number(r.pnl).toFixed(2)}</td>
        <td ${pnlColor}>${Number(r.pnlPct).toFixed(2)}%</td>
        <td><button data-del="${r.id}" class="btn-sm" title="Delete">✕</button></td>
      </tr>`;
    }).join('');
    // wire delete
    tbody.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number((btn as HTMLElement).getAttribute('data-del'));
        if (!Number.isFinite(id)) return;
        try { await api.portfolioDelete(id); await refreshAll(); } catch(e){}
      });
    });
  } catch (e:any) {
    const tbody = document.querySelector('#pfTable tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="color:var(--danger)">Error: ${(e?.message||e)}</td></tr>`;
  }
}

async function loadPerformance() {
  try {
    const res = await api.portfolioPerformance();
    const perf: any[] = res?.data || res || [];
    const labels = perf.map(p => p.buy_date || p.buyDate);
    const invested = perf.map(p => p.invested);
    const currentValues = perf.map(p => p.currentValue);
    const ctxEl = document.getElementById('pfChart') as HTMLCanvasElement | null;
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d'); if (!ctx) return;
    if (_chart) { try { _chart.destroy(); } catch {}
    }
    _chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label:'Invested', data: invested, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.15)', tension:0.15 },
        { label:'Current Value', data: currentValues, borderColor:'#16a34a', backgroundColor:'rgba(22,163,74,0.15)', tension:0.15 }
      ]},
      options: { responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false }, plugins:{ legend:{ display:true } }, scales:{ x:{ ticks:{ maxRotation:0 } }, y:{ beginAtZero:false } } }
    });
  } catch (e) {
    const ctxEl = document.getElementById('pfChart');
    if (ctxEl) ctxEl.insertAdjacentHTML('afterend', `<div class="muted">Performance error.</div>`);
  }
}

async function addEntry(symbol: string, buyDate: string, buyPrice: number, quantity: number) {
  await api.portfolioAdd(symbol, buyDate, buyPrice, quantity);
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadPortfolio(), loadPerformance()]);
}

function wireForm() {
  const form = document.getElementById('pfForm') as HTMLFormElement | null;
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('pfMsg');
    const sym = (document.getElementById('pfSymbol') as HTMLInputElement).value.trim().toUpperCase();
    const date = (document.getElementById('pfDate') as HTMLInputElement).value;
    const price = Number((document.getElementById('pfPrice') as HTMLInputElement).value);
    const qty = Number((document.getElementById('pfQty') as HTMLInputElement).value);
    if (!sym || !date || !Number.isFinite(price) || !Number.isFinite(qty)) { if (msg) msg.textContent='Fill all fields'; return; }
    try {
      if (msg) msg.textContent='Saving...';
      await addEntry(sym, date, price, qty);
      if (msg) msg.textContent='Added.';
      form.reset();
      await refreshAll();
    } catch (e:any) {
      if (msg) msg.textContent = 'Error: ' + (e?.message||e);
    }
  });
}

(function initPortfolio(){
  const card = ensureRootCard();
  // Default date = today
  const d = new Date().toISOString().slice(0,10);
  const dateInput = document.getElementById('pfDate') as HTMLInputElement | null;
  if (dateInput && !dateInput.value) dateInput.value = d;
  wireForm();
  refreshAll();
})();
