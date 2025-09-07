import { Api } from './app/services/api.service';

(function ensureHistoryCard(){
  const container = document.querySelector('main.content .container');
  if (!container) return;
  if (document.getElementById('topPicksHistory')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'topPicksHistory';
  card.style.marginTop = '12px';
  card.innerHTML = `
    <div class="muted">Top Picks History</div>
    <div class="flex" style="gap:8px; margin-top:6px; align-items:center">
      <input id="tphDays" type="number" min="1" step="1" value="7" style="width:120px" aria-label="History lookback (days)" />
      <button id="tphRefresh" class="btn-sm">Refresh</button>
      <span id="tphHint" class="muted"></span>
    </div>
    <div id="tphBody" class="mono" style="margin-top:6px"></div>
  `;
  const after = document.getElementById('topPicks') || document.getElementById('marketOverview') || container.firstChild as Element | null;
  container.insertBefore(card, after ? after.nextSibling : null);
})();

(function initTopPicksHistory(){
  const body = document.getElementById('tphBody');
  const hint = document.getElementById('tphHint');
  const btn = document.getElementById('tphRefresh');
  const daysEl = document.getElementById('tphDays') as HTMLInputElement | null;
  if (!body || !btn) return;
  function computeRankChanges(data: Array<{ snapshot_date:string, symbol:string, score:number }>) {
    const byDate = new Map<string, Array<{symbol:string, score:number}>>();
    for (const r of data) {
      const date = String(r.snapshot_date).slice(0,10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push({ symbol: r.symbol, score: Number(r.score) });
    }
    const rankByDate = new Map<string, Map<string, number>>();
    for (const [d, arr] of byDate.entries()) {
      const sorted = arr.slice().sort((a,b)=> b.score - a.score);
      const ranks = new Map<string, number>();
      sorted.forEach((x, i)=> ranks.set(x.symbol, i+1));
      rankByDate.set(d, ranks);
    }
    const dates = Array.from(rankByDate.keys()).sort();
    const out: Array<{ date:string, rows:Array<{symbol:string, score:number, rank:number, delta:number|null}> }> = [];
    for (let i=0;i<dates.length;i++) {
      const d = dates[i];
      const prev = i>0 ? dates[i-1] : null;
      const ranks = rankByDate.get(d)!;
      const arr = (byDate.get(d) || []).slice().sort((a,b)=> (ranks.get(a.symbol)!)-(ranks.get(b.symbol)!));
      const prevRanks = prev ? rankByDate.get(prev)! : null;
      const rows = arr.map(x => {
        const rank = ranks.get(x.symbol)!;
        const delta = prevRanks && prevRanks.has(x.symbol) ? (prevRanks.get(x.symbol)! - rank) : null;
        return { symbol: x.symbol, score: x.score, rank, delta };
      });
      out.push({ date: d, rows });
    }
    return out;
  }
  async function render() {
    (body as HTMLElement).innerHTML = '<span class="spinner"></span>Loading.';
    const n = daysEl ? Number(daysEl.value || 0) : 7;
    const days = (Number.isFinite(n) && n>0) ? n : 7;
    try {
      const res = await fetch(`/api/top-picks/history?days=${encodeURIComponent(String(days))}`).then(r=>r.json());
      const arr: Array<any> = res?.data || [];
      const compact = arr.map((r:any)=> ({ snapshot_date: String(r.snapshot_date), symbol: String(r.symbol), score: Number(r.score) }));
      const grouped = computeRankChanges(compact);
      if (!grouped.length) { (body as HTMLElement).innerHTML = '<div class="muted">No history yet. Snapshot will be created automatically on startup.</div>'; return; }
      const sections = grouped.reverse().map(g => {
        const rows = g.rows.map(r => {
          const arrow = (r.delta===null) ? '' : (r.delta>0 ? '▲' : (r.delta<0 ? '▼' : '•'));
          const delta = (r.delta===null) ? '' : ` (${r.delta>0?'+':''}${r.delta})`;
          return `<tr>
            <td style="padding:4px">${r.symbol}</td>
            <td style="padding:4px; text-align:right">${r.rank}${delta} ${arrow}</td>
            <td style="padding:4px; text-align:right">${r.score.toFixed(3)}</td>
          </tr>`;
        }).join('');
        return `<div class="card" style="margin-top:8px"><div class="muted">${g.date}</div>
          <table style="width:100%; border-collapse:collapse; margin-top:6px">
            <tr><th style="text-align:left; padding:4px">Symbol</th><th style="text-align:right; padding:4px">Rank Δ</th><th style="text-align:right; padding:4px">Score</th></tr>
            ${rows}
          </table>
        </div>`;
      }).join('');
      (body as HTMLElement).innerHTML = sections;
      if (hint) (hint as HTMLElement).textContent = `days=${days}`;
    } catch (e:any) {
      (body as HTMLElement).innerHTML = `<div class="mono" style="color:#ff6b6b">${String(e?.message || e)}</div>`;
    }
  }
  btn?.addEventListener('click', render);
  render();
})();

