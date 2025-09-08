async function fetchHistory(days=2): Promise<Array<{snapshot_date:string,symbol:string,score:number}>> {
  const r = await fetch(`/api/top-picks/history?days=${encodeURIComponent(String(days))}`);
  const j = await r.json().catch(()=>({ ok:false }));
  if (!j || j.ok === false) return [];
  return j.data || [];
}

function ensureDeltaCard() {
  const container = document.querySelector('main.content .container') || document.querySelector('main.content') || document.body;
  if (!container) return null;
  if (!document.getElementById('topPicksDelta')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'topPicksDelta';
    card.innerHTML = `<div class="muted">Top Picks Daily Changes</div><div id="tpDeltaBody" style="margin-top:6px">Loading…</div>`;
    container.appendChild(card);
  }
  return document.getElementById('tpDeltaBody');
}

function summarizeDelta(rows: Array<{snapshot_date:string,symbol:string,score:number}>) {
  const byDate = new Map<string, Array<{symbol:string,score:number}>>();
  for (const r of rows) {
    const d = String(r.snapshot_date || '');
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push({ symbol: String(r.symbol||'').toUpperCase(), score: Number(r.score||0) });
  }
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length < 2) return { html: '<div class="muted">Need at least 2 days of data</div>' } as any;
  const prev = byDate.get(dates[0])!.sort((a,b)=> b.score-a.score);
  const curr = byDate.get(dates[1])!.sort((a,b)=> b.score-a.score);
  const prevSet = new Map(prev.map((x,i)=> [x.symbol, { idx:i, score:x.score }]));
  const currSet = new Map(curr.map((x,i)=> [x.symbol, { idx:i, score:x.score }]));
  const added = curr.filter(x=> !prevSet.has(x.symbol)).map(x=> x.symbol);
  const dropped = prev.filter(x=> !currSet.has(x.symbol)).map(x=> x.symbol);
  const changed = curr.filter(x=> prevSet.has(x.symbol)).map(x=>{
    const p = prevSet.get(x.symbol)!; const deltaRank = p.idx - currSet.get(x.symbol)!.idx; const deltaScore = x.score - p.score; return { symbol:x.symbol, deltaRank, deltaScore };
  }).filter(x=> x.deltaRank !== 0 || Math.abs(x.deltaScore) > 1e-6);
  const topNow = curr.slice(0, 10).map(x=> x.symbol).join(', ');
  const html = `
    <div class="grid-2" style="gap:10px; font-size:12px">
      <div><div class="muted">Today</div><div>${topNow || '-'}</div></div>
      <div><div class="muted">Δ Count</div><div>+${added.length} / -${dropped.length}</div></div>
    </div>
    ${added.length ? `<div class="muted" style="margin-top:6px">New</div><div>${added.join(', ')}</div>` : ''}
    ${dropped.length ? `<div class="muted" style="margin-top:6px">Dropped</div><div>${dropped.join(', ')}</div>` : ''}
    ${changed.length ? `<div class="muted" style="margin-top:6px">Moved</div><div>${changed.map(c=> `${c.symbol} (rank ${c.deltaRank>0? '↑':'↓'}${Math.abs(c.deltaRank)}, score ${c.deltaScore>=0?'+':''}${c.deltaScore.toFixed(3)})`).join('; ')}</div>` : ''}
    <div class="muted" style="font-size:11px; margin-top:6px">Source: /api/top-picks/history (last 2 days)</div>
  `;
  return { html };
}

async function renderTopPicksDelta() {
  const body = ensureDeltaCard();
  if (!body) return;
  body.textContent = 'Loading…';
  const rows = await fetchHistory(2);
  const { html } = summarizeDelta(rows);
  body.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', () => {
  renderTopPicksDelta();
});

