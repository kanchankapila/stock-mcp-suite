import { Api } from './app/services/api.service';

function ensureCard() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container || document.getElementById('predictionsCard')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'predictionsCard';
  card.innerHTML = `
    <div class="muted">Predictions</div>
    <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
      <select id="prHorizon"><option value="1">1 day</option><option value="5">5 days</option></select>
      <button id="prRun" class="btn">Predict</button>
    </div>
    <div id="prOut" class="mono" style="margin-top:8px; white-space:pre-wrap"></div>`;
  container.appendChild(card);
}

async function runPredict() {
  const out = document.getElementById('prOut');
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const horizon = Number((document.getElementById('prHorizon') as HTMLSelectElement | null)?.value || 1);
  const symbol = sel?.value || '';
  if (!symbol) { out && (out.textContent = 'Select a stock.'); return; }
  try {
    out && (out.textContent = 'Predicting...');
    const r = await fetch(`/api/predict/${encodeURIComponent(symbol)}?horizon=${encodeURIComponent(String(horizon))}`, { method:'POST' }).then(r=>r.json());
    out && (out.textContent = JSON.stringify(r, null, 2));
  } catch (e:any) { out && (out.textContent = String(e?.message || e)); }
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCard();
  const btn = document.getElementById('prRun');
  btn?.addEventListener('click', runPredict);
});

