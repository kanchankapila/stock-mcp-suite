import { registerCard } from './registry';
import { onSymbolChange } from '../lib/events';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

function ensure() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container) return;
  if (!document.getElementById('featuresStored')) {
    const card = document.createElement('div'); card.className='card'; card.id='featuresStored';
    card.innerHTML = `<div class="muted">Stored Features</div><div id="fsBody" style="margin-top:6px"></div>`;
    container.appendChild(card);
  }
}

async function render(symbol?: string) {
  const body = document.getElementById('fsBody'); if (!body) return;
  const sel = symbol || (document.getElementById('stockSelect') as HTMLSelectElement | null)?.value || '';
  if (!sel) { body.textContent = 'Select a stock.'; return; }
  body.innerHTML = '<span class="spinner"></span> Loading features...';
  try {
    const days = 180;
    const res = await fetch(`/api/features-stored/${encodeURIComponent(sel)}?days=${days}`).then(r=>r.json());
    const rows: Array<any> = Array.isArray(res?.data) ? res.data : [];
    if (!rows.length) { body.innerHTML = '<div class="muted">No stored features.</div>'; return; }
    const labels = rows.map(r=> String(r.date));
    const sma20 = rows.map(r=> Number(r.sma20 ?? NaN));
    const ema50 = rows.map(r=> Number(r.ema50 ?? NaN));
    const rsi = rows.map(r=> Number(r.rsi ?? NaN));
    const mom = rows.map(r=> Number(r.momentum ?? NaN));
    body.innerHTML = `<div class="muted">MA</div><canvas id="fsChartMa" style="max-height:220px"></canvas><div class="muted" style="margin-top:8px">RSI & Momentum</div><canvas id="fsChartOsc" style="max-height:220px"></canvas>`;
    const maCtx = (document.getElementById('fsChartMa') as HTMLCanvasElement)?.getContext('2d');
    const osCtx = (document.getElementById('fsChartOsc') as HTMLCanvasElement)?.getContext('2d');
    if (maCtx) new Chart(maCtx, { type:'line', data:{ labels, datasets:[
      { label:'SMA20', data: sma20, borderColor: '#3b82f6', backgroundColor:'rgba(59,130,246,0.12)', borderWidth:2, fill:true, tension:0.2, pointRadius:0 },
      { label:'EMA50', data: ema50, borderColor: '#10b981', backgroundColor:'rgba(16,185,129,0.10)', borderWidth:2, fill:true, tension:0.2, pointRadius:0 }
    ]}, options:{ plugins:{ legend:{ position:'bottom' } } } });
    if (osCtx) new Chart(osCtx, { type:'line', data:{ labels, datasets:[
      { label:'RSI', data: rsi, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.12)', borderWidth:2, fill:true, tension:0.2, pointRadius:0 },
      { label:'Momentum', data: mom, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.10)', borderWidth:2, fill:true, tension:0.2, pointRadius:0 }
    ]}, options:{ plugins:{ legend:{ position:'bottom' } } } });
  } catch (e:any) { body.innerHTML = `<div class="mono" style="color:#ff6b6b">${String(e?.message || e)}</div>`; }
}

registerCard({ id:'featuresStored', page:'insight', init: ensure, render: ()=> render() });
onSymbolChange((s)=> render(s));

