function ensureCard() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container || document.getElementById('providerHealth')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'providerHealth';
  card.innerHTML = `
    <div class="muted">Provider & Jobs Health</div>
    <div class="flex" style="gap:8px; margin-top:6px"><button id="phRefresh" class="btn-sm">Refresh</button></div>
    <div id="phBody" class="mono" style="white-space:pre-wrap; margin-top:6px"></div>`;
  container.appendChild(card);
}

async function refreshHealth() {
  const body = document.getElementById('phBody');
  if (!body) return;
  body.textContent = 'Loading health...';
  try {
    const [prov, jobs] = await Promise.all([
      fetch('/api/health/providers').then(r=>r.json()).catch(()=>({})),
      fetch('/api/jobs/status').then(r=>r.json()).catch(()=>({}))
    ]);
    const providers = prov?.data?.providers || [];
    const metrics = jobs?.data?.metrics || {};
    const queues = jobs?.data?.queues || [];
    const enabled = jobs?.data?.enabled;
    const lines: string[] = [];
    lines.push('Providers:');
    for (const p of providers) {
      lines.push(`- ${p.provider}: key=${p.config?.key} suffix=${p.config?.suffix}`);
    }
    lines.push('');
    lines.push(`Jobs: enabled=${enabled}, queues=${queues.join(', ')}`);
    for (const [name, m] of Object.entries(metrics)) {
      const mm = m as any;
      lines.push(`  * ${name}: runs=${mm.runs||0} lastMs=${mm.lastMs||0} avgMs=${(mm.avgMs||0).toFixed ? (mm.avgMs as number).toFixed(0) : mm.avgMs}`);
    }
    body.textContent = lines.join('\n');
  } catch (e:any) {
    body.textContent = String(e?.message || e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCard();
  document.getElementById('phRefresh')?.addEventListener('click', refreshHealth);
  refreshHealth();
});

