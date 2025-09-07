import { Api } from './app/services/api.service';

(function initTopPicks(){
  const body = document.getElementById('tpBody');
  const hint = document.getElementById('tpHint');
  const btn = document.getElementById('tpRefresh');
  const daysEl = document.getElementById('tpDays') as HTMLInputElement | null;
  try {
    const parent = btn?.parentElement || null;
    if (parent && !document.getElementById('tpOnlyBuys')) {
      const wrap = document.createElement('label');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      const ck = document.createElement('input'); ck.type = 'checkbox'; ck.id = 'tpOnlyBuys';
      const sp = document.createElement('span'); sp.className = 'muted'; sp.textContent = 'Only BUYs';
      wrap.appendChild(ck); wrap.appendChild(sp); parent.appendChild(wrap);
    }
  } catch {}
  if (!body || !btn) return;
  async function render() {
    if (body) body.innerHTML = '<span class="spinner"></span>Loading.';
    const n = daysEl ? Number(daysEl.value || 0) : 60;
    const days = (Number.isFinite(n) && n > 0) ? n : 60;
    try {
      const res = await new Api().topPicks(days, 10);
      let arr: Array<any> = res?.data || [];
      // Fetch yesterday ranks
      let prevRanks = new Map<string, number>();
      try {
        const hist = await fetch(`/api/top-picks/history?days=2`).then(r=>r.json()).catch(()=>({ data: [] }));
        const rows: Array<any> = hist?.data || [];
        const today = new Date().toISOString().slice(0,10);
        const ys = rows.map(r=> String(r.snapshot_date).slice(0,10)).filter(d=> d !== today);
        const ydate = ys.length ? ys.sort().pop() : null;
        if (ydate) {
          const yrows = rows.filter(r => String(r.snapshot_date).slice(0,10) === ydate);
          const sorted = yrows.slice().sort((a,b)=> Number(b.score)-Number(a.score));
          sorted.forEach((x:any,i:number)=> prevRanks.set(String(x.symbol).toUpperCase(), i+1));
        }
      } catch {}
      // Only BUYs filter
      const only = (document.getElementById('tpOnlyBuys') as HTMLInputElement | null)?.checked ?? false;
      if (only) arr = arr.filter(r => String(r.recommendation||'').toUpperCase() === 'BUY');
      if (!arr.length) { if (body) body.innerHTML = '<div class="muted">No picks yet. Ingest first or try later.</div>'; return; }
      const head = '<tr><th style="text-align:left; padding:4px">Symbol</th><th style="text-align:right; padding:4px">Score</th><th style="text-align:right; padding:4px">Momentum</th><th style="text-align:right; padding:4px">Sentiment</th><th style="text-align:right; padding:4px">MC Score</th><th style="text-align:left; padding:4px">Reco</th></tr>';
      const rows = arr.map((r:any, idx:number)=>{
        const mom = (Number(r.momentum)*100).toFixed(1)+'%';
        const sent = Number(r.sentiment).toFixed(2);
        const mcs = (r.mcScore===null||r.mcScore===undefined) ? '-' : String(Number(r.mcScore).toFixed(0));
        const rec = String(r.recommendation || 'HOLD');
        const currentRank = idx + 1;
        const prev = prevRanks.get(String(r.symbol).toUpperCase());
        const delta = (prev !== undefined) ? (prev - currentRank) : null; // + means improved
        const arrow = (delta===null) ? '' : (delta>0 ? '▲' : (delta<0 ? '▼' : '•'));
        const symLabel = delta===null ? r.symbol : `${r.symbol} ${arrow}${delta>0?`(+${delta})`:`(${delta})`}`;
        return '<tr>'
          + `<td style="padding:4px">${symLabel}</td>`
          + `<td style="padding:4px; text-align:right">${Number(r.score).toFixed(3)}</td>`
          + `<td style="padding:4px; text-align:right">${mom}</td>`
          + `<td style="padding:4px; text-align:right">${sent}</td>`
          + `<td style="padding:4px; text-align:right">${mcs}</td>`
          + `<td style="padding:4px">${rec}</td>`
          + '</tr>';
      }).join('');
      if (body) body.innerHTML = `<table style="width:100%; border-collapse:collapse">${head}${rows}</table>`;
      if (hint) (hint as HTMLElement).textContent = `days=${days}, total=${res?.meta?.total ?? arr.length}`;
    } catch (e:any) {
      if (body) body.innerHTML = `<div class="mono" style="color:#ff6b6b">${String(e?.message || e)}</div>`;
    }
  }
  btn?.addEventListener('click', render);
  render();
})();
