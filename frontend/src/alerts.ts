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

window.addEventListener('DOMContentLoaded', () => ensureCard());

