function ensureCard() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container || document.getElementById('alertsCard')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'alertsCard';
  card.innerHTML = `
    <div class="muted">Alerts</div>
    <div class="muted" style="margin-top:6px">Define rules on price/vol/RSI/sentiment (stub).</div>`;
  container.appendChild(card);
}

function fetchAlerts() {
  return fetch('/api/alerts').then(r=>r.json()).then(j=> j.data || [] ).catch(()=>[]);
}
function evaluateAlerts() { return fetch('/api/alerts/evaluate', { method:'POST' }).then(r=>r.json()).catch(()=>null); }

function renderAlerts(rows:any[]) {
  const card = document.getElementById('alertsCard');
  if (!card) return;
  let html = `
    <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
      <div class="muted">Alerts</div>
      <div style="display:flex;gap:6px">
        <button id="alertsEvalBtn" class="btn btn-xs">Eval</button>
        <button id="alertsRefreshBtn" class="btn btn-xs">Refresh</button>
      </div>
    </div>`;
  if (!rows.length) html += '<div class="muted" style="margin-top:6px">No alerts defined.</div>';
  else {
    html += `<div class="table-wrapper" style="max-height:300px;overflow:auto;margin-top:6px">`;
    html += `<table class="simple compact" style="width:100%;font-size:12px"><thead><tr><th>Symbol</th><th>Kind</th><th>Level</th><th>Baseline</th><th>Created</th><th>Last Eval</th><th>Status</th></tr></thead><tbody>`;
    for (const r of rows) {
      const triggered = !!r.triggered_at;
      const cls = triggered ? 'style="background:#143016"' : '';
      const baseline = r.baseline_price ? `${r.baseline_price.toFixed(2)}<br><span class=muted>${r.baseline_date?.slice(0,10)||''}</span>` : '';
      const status = triggered ? `Triggered<br><span class=muted>${(r.triggered_at||'').slice(0,19).replace('T',' ')}</span>` : 'Active';
      html += `<tr ${cls}><td>${r.symbol}</td><td>${r.kind}</td><td>${r.level}</td><td>${baseline}</td><td>${(r.created_at||'').slice(0,10)}</td><td>${r.last_eval? r.last_eval.slice(0,19).replace('T',' '):''}</td><td>${status}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  card.innerHTML = html;
  const refreshBtn = document.getElementById('alertsRefreshBtn');
  if (refreshBtn) refreshBtn.onclick = () => loadAndRender();
  const evalBtn = document.getElementById('alertsEvalBtn');
  if (evalBtn) evalBtn.onclick = async () => { evalBtn.textContent='...'; await evaluateAlerts(); await loadAndRender(); };
}
async function loadAndRender(){ const rows = await fetchAlerts(); renderAlerts(rows); }
window.addEventListener('DOMContentLoaded', () => { ensureCard(); loadAndRender(); });

