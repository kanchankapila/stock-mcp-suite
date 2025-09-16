function ensureCard() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container || document.getElementById('providerHealth')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'providerHealth';
  card.innerHTML = `
    <div class="muted">Provider & Jobs Health</div>
    <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap; align-items:center">
      <button id="phRefresh" class="btn-sm">Refresh</button>
      <input id="bulkConcurrency" type="number" min="1" value="1" style="width:70px" title="Concurrency" />
      <label style="font-size:11px"><input type="checkbox" id="bulkRag" /> rag</label>
      <label style="font-size:11px"><input type="checkbox" id="bulkDryRun" /> dryRun</label>
      <button id="bulkIngestAll" class="btn-sm">Bulk Ingest All</button>
      <span style="flex:1"></span>
      <select id="phProviderSelect" style="font-size:11px; max-width:160px"></select>
      <button id="streamStart" class="btn-sm" title="Stream ingest (SSE)">Stream Ingest</button>
      <button id="streamStop" class="btn-sm" disabled>Stop</button>
    </div>
    <div id="streamArea" style="margin-top:6px; display:none">
      <div style="display:flex; gap:6px; align-items:center">
        <div id="streamStatus" class="mono" style="font-size:11px">Idle</div>
        <div style="flex:1; background:var(--bg2,#222); height:6px; border-radius:3px; position:relative">
          <div id="streamProg" style="position:absolute; left:0; top:0; bottom:0; width:0%; background:#3b82f6; border-radius:3px; transition:width .15s"></div>
        </div>
        <div id="streamPct" style="font-size:10px; width:40px; text-align:right">0%</div>
      </div>
      <pre id="streamLog" class="mono" style="margin:6px 0 0; max-height:140px; overflow:auto; font-size:10px; background:var(--bg2,#1a1a1a); padding:4px"></pre>
    </div>
    <div id="heatmapContainer" style="margin-top:10px; display:none">
      <div class="flex" style="justify-content:space-between; align-items:center; margin-bottom:4px">
        <div class="muted" style="font-size:11px">Symbol Timing Heatmap (avg ms per symbol per run)</div>
        <button id="heatmapRefresh" class="btn-sm" style="font-size:11px">Reload Heatmap</button>
      </div>
      <div id="heatmapLegend" style="font-size:10px; margin-bottom:4px"></div>
      <div id="heatmap" style="overflow:auto; max-height:260px; border:1px solid var(--border,#333);"></div>
    </div>
    <div id="phBody" class="mono" style="white-space:pre-wrap; margin-top:10px"></div>
    <div id="bulkResult" class="mono" style="white-space:pre-wrap; margin-top:10px; border-top:1px solid var(--border,#444); padding-top:6px; font-size:11px"></div>`;
  container.appendChild(card);
  injectHeatmapStyles();
}

function injectHeatmapStyles() {
  if (document.getElementById('heatmapStyles')) return;
  const style = document.createElement('style');
  style.id = 'heatmapStyles';
  style.textContent = `
    #heatmap table { border-collapse: collapse; width:100%; font-size:10px; }
    #heatmap th, #heatmap td { border:1px solid var(--border,#333); padding:2px 4px; text-align:center; }
    #heatmap th { position:sticky; top:0; background:var(--bg2,#222); z-index:2; }
    #heatmap td.symbol { position:sticky; left:0; background:var(--bg2,#222); text-align:right; font-weight:500; }
    .hm-cell { min-width:45px; cursor:pointer; }
    .hm-cell:hover { outline:1px solid #fff; }
    .batch-link { cursor:pointer; text-decoration:underline; }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .modal { background:#111; border:1px solid #444; padding:12px; width:640px; max-height:80vh; overflow:auto; font-size:12px; }
    .modal h3 { margin:0 0 8px; font-size:14px; }
    .modal pre { background:#1e1e1e; padding:6px; max-height:300px; overflow:auto; }
  `;
  document.head.appendChild(style);
}

async function fetchProviderDetails(ids: string[]): Promise<string[]> {
  const lines: string[] = [];
  await Promise.all(ids.map(async id => {
    try {
      const r = await fetch(`/api/providers/${id}/health`).then(r=>r.json());
      const last = r?.data?.lastRun || null;
      const disabled = r?.data?.disabled ? 'disabled' : 'enabled';
      if (last) {
        const meta = last.meta || {};
        const batched = meta.batched ? 'batched' : 'single';
        const prices = last.prices_count ?? meta.prices_count ?? '-';
        const news = last.news_count ?? meta.news_count ?? '-';
        const batches = meta.batches?.length || meta.batch_count || 0;
        lines.push(`  • ${id}: ${disabled}, ${batched}, prices=${prices}, news=${news}, batches=${batches}`);
      } else {
        lines.push(`  • ${id}: ${disabled}, no runs`);
      }
    } catch (e:any) {
      lines.push(`  • ${id}: err=${String(e?.message||e)}`);
    }
  }));
  return lines;
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
    const ids = providers.map((p:any)=>p.provider);
    const detailLines = await fetchProviderDetails(ids);
    lines.push('');
    lines.push('Last Runs:');
    lines.push(...detailLines);
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

async function bulkIngestAll() {
  const out = document.getElementById('bulkResult');
  if (out) out.textContent = 'Running bulk ingest...';
  try {
    const concurrency = Number((document.getElementById('bulkConcurrency') as HTMLInputElement)?.value || '1');
    const rag = (document.getElementById('bulkRag') as HTMLInputElement)?.checked || false;
    const dryRun = (document.getElementById('bulkDryRun') as HTMLInputElement)?.checked || false;
    const resp = await fetch('/api/providers/ingest/all', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ concurrency, rag, dryRun }) }).then(r=>r.json());
    if (!resp.ok) throw new Error(resp.error || 'bulk failed');
    const lines: string[] = [];
    lines.push(`Bulk Ingest: duration=${resp.durationMs}ms providers=${resp.totalProviders} ok=${resp.ok}`);
    for (const r of resp.results || []) {
      lines.push(`  ✔ ${r.providerId}: prices=${r.meta?.prices} news=${r.meta?.news} batches=${r.meta?.batches}`);
    }
    for (const e of resp.errors || []) {
      lines.push(`  ✖ ${e.providerId}: ${e.error}`);
    }
    if (out) out.textContent = lines.join('\n');
    await refreshHealth();
  } catch (e:any) {
    if (out) out.textContent = 'Error: ' + String(e?.message||e);
  }
}

async function populateProviderSelect() {
  try {
    const data = await fetch('/api/health/providers').then(r=>r.json()).catch(()=>({}));
    const providers = data?.data?.providers || [];
    const sel = document.getElementById('phProviderSelect') as HTMLSelectElement | null;
    if (!sel) return;
    sel.innerHTML = providers.map((p:any)=> `<option value="${p.provider}">${p.provider}</option>`).join('');
    if (providers.length) sel.value = providers[0].provider;
    toggleHeatmapVisibility();
  } catch {}
}

function toggleHeatmapVisibility() {
  const sel = document.getElementById('phProviderSelect') as HTMLSelectElement | null;
  const cont = document.getElementById('heatmapContainer');
  if (sel && sel.value) { if (cont) cont.style.display = 'block'; } else if (cont) cont.style.display = 'none';
}

async function fetchRuns(providerId: string, limit=15) {
  const r = await fetch(`/api/providers/${providerId}/runs?limit=${limit}`).then(r=>r.json()).catch(()=>({}));
  return r?.data || [];
}

async function fetchPerf(providerId: string) {
  const r = await fetch(`/api/providers/${providerId}/perf`).then(r=>r.json()).catch(()=>({}));
  return r?.data || null;
}

function buildColorScale(values: number[]) {
  if (!values.length) return (v:number)=>'#222';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = min + (max-min)/2;
  return (v:number) => {
    if (!isFinite(v)) return '#222';
    // Green -> Orange -> Red
    let ratio = (v - min) / (max - min || 1); ratio = Math.min(1, Math.max(0, ratio));
    const toHex = (n:number)=> ('0'+Math.round(n).toString(16)).slice(-2);
    // interpolate: 0 -> green (0,160,90), 0.5 -> orange (230,160,0), 1 -> red (200,40,40)
    function interp(a:number,b:number,t:number){ return a + (b-a)*t; }
    let r1,g1,b1,r2,g2,b2,t;
    if (ratio < 0.5) { // green to orange
      t = ratio / 0.5;
      r1=0; g1=160; b1=90; r2=230; g2=160; b2=0;
    } else { // orange to red
      t = (ratio-0.5)/0.5;
      r1=230; g1=160; b1=0; r2=200; g2=40; b2=40;
    }
    const R=interp(r1,r2,t), G=interp(g1,g2,t), B=interp(b1,b2,t);
    return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
  };
}

async function renderHeatmap() {
  const sel = document.getElementById('phProviderSelect') as HTMLSelectElement | null;
  if (!sel || !sel.value) return;
  const providerId = sel.value;
  const heatDiv = document.getElementById('heatmap');
  if (!heatDiv) return;
  heatDiv.innerHTML = 'Loading heatmap...';
  try {
    const [runs, perf] = await Promise.all([fetchRuns(providerId, 20), fetchPerf(providerId)]);
    // Collect symbol timings per run
    const runRows: Array<{ id:number; started_at:string; meta:any }> = runs.map((r:any)=> ({ id: r.id, started_at: r.started_at, meta: r.meta || {} }));
    const symbolSet = new Set<string>();
    if (perf?.topSymbols) for (const ts of perf.topSymbols) symbolSet.add(ts.symbol);
    for (const rr of runRows) {
      const st = rr.meta?.symbolTimings || {};
      Object.keys(st).forEach(s => symbolSet.add(s));
    }
    const symbols = Array.from(symbolSet).slice(0, 40); // cap to 40 symbols for display
    // Build matrix
    const values: number[] = [];
    const matrix: Array<{ symbol:string; cells:Array<{ runId:number; ms:number|null }> }> = symbols.map(sym => ({ symbol: sym, cells: runRows.map(rr => { const ms = rr.meta?.symbolTimings?.[sym]; if (typeof ms === 'number') values.push(ms); return { runId: rr.id, ms: (typeof ms==='number'? ms: null) }; }) }));
    const color = buildColorScale(values);

    const table: string[] = [];
    table.push('<table><thead><tr><th style="left:0; z-index:3">Symbol</th>');
    runRows.forEach((rr, idx)=> { table.push(`<th title="Run ${rr.id}\n${rr.started_at}" data-run="${rr.id}">R${idx}</th>`); });
    table.push('</tr></thead><tbody>');
    matrix.forEach(row => {
      table.push(`<tr><td class="symbol">${row.symbol}</td>`);
      row.cells.forEach(c => {
        if (c.ms==null) table.push('<td class="hm-cell" style="background:#111; color:#444">-</td>');
        else {
          const bg = color(c.ms);
          table.push(`<td class="hm-cell" style="background:${bg}" data-run="${c.runId}" data-symbol="${row.symbol}" title="${row.symbol} run ${c.runId}: ${c.ms.toFixed(1)}ms">${Math.round(c.ms)}</td>`);
        }
      });
      table.push('</tr>');
    });
    table.push('</tbody></table>');
    heatDiv.innerHTML = table.join('');
    const legend = document.getElementById('heatmapLegend');
    if (legend && values.length) {
      const min = Math.min(...values), max = Math.max(...values), mid = min + (max-min)/2;
      legend.innerHTML = `min ${min.toFixed(1)}ms | mid ${mid.toFixed(1)}ms | max ${max.toFixed(1)}ms (R* headers = chronological desc)`;
    }
    // Click handler to open batch modal
    heatDiv.querySelectorAll('.hm-cell').forEach(cell => {
      cell.addEventListener('click', (ev)=> {
        const el = ev.currentTarget as HTMLElement; const runId = Number(el.getAttribute('data-run'));
        if (runId) showBatchModal(runId);
      });
    });
  } catch (e:any) {
    heatDiv.textContent = 'Heatmap error: ' + String(e?.message||e);
  }
}

async function showBatchModal(runId: number) {
  try {
    const r = await fetch(`/api/providers/runs/${runId}/batches`).then(r=>r.json()).catch(()=>({}));
    const batches = r?.data || [];
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal"><h3>Run ${runId} Batches</h3><div style="font-size:11px; margin-bottom:6px">Total batches: ${batches.length}</div><table style="width:100%; font-size:11px; border-collapse:collapse">${batches.map((b:any)=> `<tr><td style=\"border:1px solid #333; padding:2px 4px\">#${b.batch_index}</td><td style=\"border:1px solid #333; padding:2px 4px\">size ${b.batch_size}</td><td style=\"border:1px solid #333; padding:2px 4px\">${b.duration_ms}ms</td><td style=\"border:1px solid #333; padding:2px 4px; max-width:280px; overflow:hidden; text-overflow:ellipsis\" title=\"${(b.symbols||[]).join(', ')}\">${(b.symbols||[]).slice(0,8).join(', ')}${(b.symbols||[]).length>8?'…':''}</td></tr>`).join('')}</table><div style="margin-top:8px"><button id="modalClose" class="btn-sm">Close</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=> { if (e.target===overlay) overlay.remove(); });
    overlay.querySelector('#modalClose')?.addEventListener('click', ()=> overlay.remove());
  } catch (e:any) {
    alert('Failed to load batches: ' + String(e?.message||e));
  }
}

// Streaming ingest (SSE)
let currentES: EventSource | null = null;
function startStream() {
  if (currentES) return;
  const sel = document.getElementById('phProviderSelect') as HTMLSelectElement | null; if (!sel || !sel.value) return;
  const providerId = sel.value;
  const rag = (document.getElementById('bulkRag') as HTMLInputElement)?.checked || false;
  const dryRun = (document.getElementById('bulkDryRun') as HTMLInputElement)?.checked || false;
  const url = `/api/providers/${providerId}/ingest/stream?rag=${rag}&dryRun=${dryRun}`;
  const area = document.getElementById('streamArea'); if (area) area.style.display='block';
  const log = document.getElementById('streamLog'); if (log) log.textContent='';
  const status = document.getElementById('streamStatus'); if (status) status.textContent = 'Connecting...';
  const btnStart = document.getElementById('streamStart') as HTMLButtonElement|null;
  const btnStop = document.getElementById('streamStop') as HTMLButtonElement|null;
  if (btnStart) btnStart.disabled = true; if (btnStop) btnStop.disabled = false;
  currentES = new EventSource(url);
  const progBar = document.getElementById('streamProg') as HTMLElement|null;
  const progPct = document.getElementById('streamPct') as HTMLElement|null;
  function append(line:string){ if (log) { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; } }
  currentES.addEventListener('start', (e:any)=> { status && (status.textContent = 'Started'); append('[start] '+ e.data); });
  currentES.addEventListener('progress', (e:any)=> {
    try { const data = JSON.parse(e.data); const bi = data.batchIndex+1; const tb = data.totalBatches || bi; const pct = tb? ((bi)/tb)*100 : 0; if (progBar) progBar.style.width = pct.toFixed(1)+'%'; if (progPct) progPct.textContent = Math.round(pct)+'%'; status && (status.textContent = `Batch ${bi}/${tb}`); append(`batch ${bi}/${tb} symbols=${data.symbols.length} dur=${data.durationMs}ms prices=${data.aggregate.prices} news=${data.aggregate.news} errors=${data.aggregate.errors}`);} catch(err){ append('progress parse err'); }
  });
  currentES.addEventListener('end', (e:any)=> { status && (status.textContent = 'Completed'); append('[end]'); stopStream(false); refreshHealth(); renderHeatmap(); });
  currentES.addEventListener('error', (e:any)=> { status && (status.textContent = 'Error'); append('[error]'); stopStream(false); });
}
function stopStream(manual=true) {
  if (currentES) { currentES.close(); currentES = null; }
  const btnStart = document.getElementById('streamStart') as HTMLButtonElement|null;
  const btnStop = document.getElementById('streamStop') as HTMLButtonElement|null;
  if (btnStart) btnStart.disabled = false; if (btnStop) btnStop.disabled = true;
  if (manual) { const status = document.getElementById('streamStatus'); if (status) status.textContent = 'Stopped'; }
}

// Hook into existing refresh to also repopulate select
async function refreshHealthExtended() {
  await refreshHealth();
  await populateProviderSelect();
  await renderHeatmap();
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCard();
  document.getElementById('phRefresh')?.addEventListener('click', refreshHealthExtended);
  document.getElementById('bulkIngestAll')?.addEventListener('click', bulkIngestAll);
  document.getElementById('heatmapRefresh')?.addEventListener('click', renderHeatmap);
  document.getElementById('phProviderSelect')?.addEventListener('change', ()=> { toggleHeatmapVisibility(); renderHeatmap(); });
  document.getElementById('streamStart')?.addEventListener('click', startStream);
  document.getElementById('streamStop')?.addEventListener('click', ()=> stopStream(true));
  refreshHealthExtended();
});

