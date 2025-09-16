import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

function ensureCard() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container || document.getElementById('strategyLab')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'strategyLab';
  card.innerHTML = `
    <div class="muted">Strategy Lab</div>
    <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
      <select id="slStrategy"><option value="ma_crossover">MA Crossover</option><option value="momentum">Momentum</option></select>
      <input id="slSymbols" placeholder="Symbols (comma)" style="min-width:220px" />
      <input id="slFast" type="number" min="2" step="1" value="20" title="Fast MA" style="width:90px" />
      <input id="slSlow" type="number" min="2" step="1" value="50" title="Slow MA" style="width:90px" />
      <input id="slStart" type="date" />
      <input id="slEnd" type="date" />
      <button id="slRun" class="btn">Run</button>
      <button id="slWF" class="btn">Walk-forward</button>
    </div>
    <div id="slOut" class="mono" style="margin-top:8px; white-space:pre-wrap"></div>
    <div id="slMetrics" class="muted" style="margin-top:8px"></div>
    <canvas id="slChart" style="margin-top:8px; max-height:220px"></canvas>
    <canvas id="slDD" style="margin-top:8px; max-height:160px"></canvas>`;
  container.appendChild(card);
}

async function runBacktest() {
  const out = document.getElementById('slOut');
  const sSel = document.getElementById('slStrategy') as HTMLSelectElement | null;
  const sy = (document.getElementById('slSymbols') as HTMLInputElement | null)?.value || '';
  const start = (document.getElementById('slStart') as HTMLInputElement | null)?.value || '';
  const end = (document.getElementById('slEnd') as HTMLInputElement | null)?.value || '';
  const fast = Number((document.getElementById('slFast') as HTMLInputElement | null)?.value || 20);
  const slow = Number((document.getElementById('slSlow') as HTMLInputElement | null)?.value || 50);
  const cfg = { strategy: sSel?.value || 'ma_crossover', symbols: sy.split(/\s*,\s*/g).filter(Boolean), start, end, params: { fast, slow } };
  try {
    out && (out.textContent = 'Running backtest...');
    const run = await fetch('/api/backtest/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg) }).then(r=>r.json());
    out && (out.textContent = JSON.stringify(run, null, 2));
    const id = run?.id || run?.data?.id;
    if (!id) return;
    const res = await fetch(`/api/backtest/${encodeURIComponent(id)}`).then(r=>r.json());
    const data = res?.data || {};
    const metrics = data?.metrics || data?.data?.metrics || {};
    const eq = data?.equity || data?.data?.equity || [];
    const metDiv = document.getElementById('slMetrics');
    if (metDiv) metDiv.innerHTML = `Sharpe: <b>${(metrics.sharpe ?? 0).toFixed(2)}</b> &nbsp; MaxDD: <b>${(metrics.maxdd ?? 0).toFixed(2)}</b>`;
    const ctx = (document.getElementById('slChart') as HTMLCanvasElement)?.getContext('2d');
    if (ctx && Array.isArray(eq) && eq.length) {
      const labels = eq.map((_,i)=> String(i));
      // Drawdown
      let peak = eq[0];
      const dd = eq.map(v => { peak = Math.max(peak, v); return (v/peak)-1; });
      // Benchmark: normalized close for first symbol (if any)
      const symbols = cfg.symbols || [];
      const datasets: any[] = [{ label: 'Strategy', data: eq, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 2, fill: true, tension: 0.2, pointRadius: 0 }];
      if (symbols.length) {
        try {
          const r = await fetch(`/api/stocks/${encodeURIComponent(symbols[0])}/history`).then(r=>r.json());
          const rows = r?.data || [];
          const closes = rows.map((x:any)=> Number(x.close)).filter((n:number)=> Number.isFinite(n) && n>0);
          if (closes.length) {
            const first = closes[0] || 1;
            const bench = closes.map((v:number)=> v/first);
            // Map length to equity length (align by tail if lengths differ)
            const b2 = bench.slice(-eq.length);
            const pad = eq.length - b2.length;
            const aligned = (pad>0) ? Array(pad).fill(b2.length?b2[0]:1).concat(b2) : b2;
            datasets.push({ label: 'Benchmark', data: aligned, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 2, fill: false, tension: 0.2, pointRadius: 0 });
          }
        } catch {}
      }
      const chart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { display: true }, y: { display: true } } } });
      const ddCtx = (document.getElementById('slDD') as HTMLCanvasElement)?.getContext('2d');
      if (ddCtx) new Chart(ddCtx, { type:'line', data: { labels, datasets: [{ label:'Drawdown', data: dd, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.15)', fill:true, borderWidth:2, pointRadius:0, tension:0.2 }] }, options:{ plugins:{ legend:{ display:true, position:'bottom' } }, scales:{ y:{ ticks:{ callback:(v:any)=> `${(v*100).toFixed(0)}%` } } } } });
      // Export buttons
      const met = { sharpe: metrics.sharpe ?? 0, maxdd: metrics.maxdd ?? 0, len: eq.length };
      const exportDiv = document.createElement('div');
      exportDiv.className = 'flex';
      exportDiv.style.gap = '8px';
      exportDiv.style.marginTop = '8px';
      const btnEq = document.createElement('button'); btnEq.className='btn-sm'; btnEq.textContent='Export Equity'; btnEq.onclick = ()=> downloadJson(eq, 'equity.json');
      const btnMx = document.createElement('button'); btnMx.className='btn-sm'; btnMx.textContent='Export Metrics'; btnMx.onclick = ()=> downloadJson(met, 'metrics.json');
      exportDiv.append(btnEq, btnMx);
      (metDiv?.parentElement)?.appendChild(exportDiv);
    }
  } catch (e:any) { out && (out.textContent = String(e?.message || e)); }
}

function downloadJson(obj: any, name='data.json') {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 5000);
  } catch {}
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCard();
  const btn = document.getElementById('slRun');
  btn?.addEventListener('click', runBacktest);
  const wf = document.getElementById('slWF');
  wf?.addEventListener('click', runWalkforward);
});

async function runWalkforward() {
  const out = document.getElementById('slOut');
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const sEl = document.getElementById('slSymbols') as HTMLInputElement | null;
  const sList = (sEl?.value || '').split(/\s*,\s*/g).filter(Boolean);
  const sym = sList[0] || sel?.value || '';
  const fast = Number((document.getElementById('slFast') as HTMLInputElement | null)?.value || 20);
  const slow = Number((document.getElementById('slSlow') as HTMLInputElement | null)?.value || 50);
  if (!sym) { out && (out.textContent = 'Provide at least one symbol.'); return; }
  try {
    out && (out.textContent = 'Running walk-forward...');
    const body = { folds: 5, params: { fast, slow } };
    const res = await fetch(`/api/walkforward/${encodeURIComponent(sym)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r=>r.json());
    out && (out.textContent = JSON.stringify(res, null, 2));
  } catch (e:any) { out && (out.textContent = String(e?.message || e)); }
}
