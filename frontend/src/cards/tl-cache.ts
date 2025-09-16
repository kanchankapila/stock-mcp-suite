import { registerCard } from './registry';
import { onSymbolChange } from '../lib/events';

function ensure() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container) return;
  if (!document.getElementById('tlCache')) {
    const card = document.createElement('div'); card.className='card'; card.id='tlCache';
    card.innerHTML = `<div class="muted">Trendlyne Cache (SMA/ADV)</div><div id="tlCacheBody" style="margin-top:6px"></div>`;
    container.appendChild(card);
  }
}

async function render(symbol?: string) {
  const body = document.getElementById('tlCacheBody'); if (!body) return;
  const sel = symbol || (document.getElementById('stockSelect') as HTMLSelectElement | null)?.value || '';
  if (!sel) { body.textContent = 'Select a stock.'; return; }
  body.textContent = 'Loading TL cache...';
  try {
    const [smaRes, advRes] = await Promise.all([
      fetch(`/api/tl-cache/by-symbol/${encodeURIComponent(sel)}?kind=sma`).then(r=>r.json()).catch(()=>({})),
      fetch(`/api/tl-cache/by-symbol/${encodeURIComponent(sel)}?kind=adv`).then(r=>r.json()).catch(()=>({}))
    ]);
    const sma = smaRes?.data || null; const adv = advRes?.data || null;
    const lastSma = (()=>{ try { const arr = Array.isArray(sma?.data) ? sma.data : []; const tail = arr.slice(-5).map((p:any)=> Number(p?.v ?? p?.value ?? 0)).filter((n:number)=> Number.isFinite(n)); return tail.length ? tail.map(n=> n.toFixed(2)).join(', ') : '—'; } catch { return '—'; }})();
    const advSummary = (()=>{ try { const sum = adv?.summary || adv?.Summary || {}; const buy = Number(sum.buy ?? 0), neutral = Number(sum.neutral ?? 0), sell = Number(sum.sell ?? 0); if (buy||neutral||sell) return `Buy: ${buy}, Neutral: ${neutral}, Sell: ${sell}`; } catch {} return '—'; })();
    body.innerHTML = `<div class="grid-2" style="gap:10px"><div><div class="muted">SMA (last points)</div><div>${lastSma}</div></div><div><div class="muted">ADV Summary</div><div>${advSummary}</div></div></div>`;
  } catch (e:any) { body.innerHTML = `<div class="mono" style="color:#ff6b6b">${String(e?.message||e)}</div>`; }
}

registerCard({ id:'tlCache', page:'insight', init: ensure, render: ()=> render() });
onSymbolChange((s)=> render(s));

