import { on, emit } from '../lib/events';
import { fetchJson, escapeHtml } from './fetch';

let _init = false;
let card: HTMLElement | null = null;
let nsInput: HTMLInputElement; let qInput: HTMLInputElement; let kInput: HTMLInputElement; let streamChk: HTMLInputElement; let results: HTMLElement; let answerEl: HTMLElement; let form: HTMLFormElement; let cutoffInput: HTMLInputElement; let minScoreInput: HTMLInputElement;
let includeMcChk: HTMLInputElement; let includeTlChk: HTMLInputElement; let reindexBtn: HTMLButtonElement; let sendAgentBtn: HTMLButtonElement;

function currentNs(){ return (nsInput?.value||'').trim().toUpperCase(); }

async function runQuery() {
  // Validate inputs
  const ns = currentNs(); const q = (qInput.value||'').trim(); if(!ns||!q) return;
  const cutoffVal = (cutoffInput.value||'').trim();
  if (cutoffVal && !/^\d{4}-\d{2}-\d{2}$/.test(cutoffVal)) { cutoffInput.setAttribute('aria-invalid','true'); results.innerHTML = '<div style=color:var(--danger)>Invalid cutoff date (YYYY-MM-DD)</div>'; return; } else cutoffInput.removeAttribute('aria-invalid');
  const minScoreStr = (minScoreInput.value||'').trim(); if (minScoreStr) { const n = Number(minScoreStr); if (!Number.isFinite(n)) { minScoreInput.setAttribute('aria-invalid','true'); results.innerHTML='<div style=color:var(--danger)>Invalid minScore</div>'; return; } else minScoreInput.removeAttribute('aria-invalid'); }
  const minScore = minScoreStr? Number(minScoreStr): undefined;
  results.innerHTML = '<div class="muted">Running…</div>'; answerEl.textContent='';
  const k = Number(kInput.value)||5; const dateCutoff = cutoffVal; const includeMc = includeMcChk.checked; const includeTl = includeTlChk.checked;
  // Save persistence
  try { localStorage.setItem('ragNs', ns); localStorage.setItem('ragCutoff', cutoffVal); } catch {}
  // Disable form controls during run
  Array.from(form.elements as any).forEach((el:any)=> el.disabled = true); sendAgentBtn.disabled = true; answerEl.setAttribute('data-running','1');
  const finish = ()=> { Array.from(form.elements as any).forEach((el:any)=> el.disabled = false); answerEl.removeAttribute('data-running'); };
  if (streamChk.checked) {
    try {
      const resp = await fetch('/api/rag/stream', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ namespace: ns, query: q, k, dateCutoff: dateCutoff||undefined, minScore }) });
      if(!resp.ok || !resp.body){ results.innerHTML = '<div class=muted>Stream failed</div>'; finish(); return; }
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf=''; const sources: any[] = []; answerEl.textContent='';
      while(true){ const {done,value} = await reader.read(); if(done) break; buf += dec.decode(value, { stream:true }); const chunks = buf.split(/\n\n/); buf = chunks.pop()||''; for(const raw of chunks){ let ev=''; let data=''; raw.split('\n').forEach(l=>{ if(l.startsWith('event:')) ev=l.slice(6).trim(); if(l.startsWith('data:')) data=l.slice(5).trim(); }); if(!ev) continue; if(ev==='sources'){ try { const arr = JSON.parse(data); if(Array.isArray(arr)) { sources.push(...arr); renderSources(sources); } } catch {} } if(ev==='answer'){ try { answerEl.textContent += JSON.parse(data); } catch { answerEl.textContent += data; } } } }
      // Focus management
      focusAfterResults();
    } catch(err:any){ results.innerHTML = `<div style=color:var(--danger)>${escapeHtml(String(err?.message||err))}</div>`; }
    finally { finish(); }
    return;
  }
  try {
    const body = { namespace: ns, query: q, k, withAnswer:true, dateCutoff: dateCutoff||undefined, minScore, includeMc, includeTl } as any;
    const data = await fetchJson<any>('/api/rag/query', { method:'POST', body });
    const hits = Array.isArray(data?.sources) ? data.sources : (Array.isArray(data?.hits)? data.hits: []);
    renderSources(hits);
    if (data?.answer) answerEl.textContent = data.answer;
    focusAfterResults();
  } catch(err:any){ results.innerHTML = `<div style=color:var(--danger)>${escapeHtml(String(err?.message||err))}</div>`; }
  finally { finish(); }
}

function renderSources(list: any[]) {
  if(!list.length){ results.innerHTML = '<div class=muted>No results.</div>'; return; }
  const frag = document.createDocumentFragment();
  const ul = document.createElement('ul'); ul.style.cssText='list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px'; ul.setAttribute('role','list');
  list.forEach((s,i)=> {
    const li = document.createElement('li'); li.style.cssText='border:1px solid var(--border);padding:6px 8px;border-radius:8px;background:var(--panel-2);font-size:11px;line-height:1.3';
    const md = s.metadata || {}; const score = md._score!==undefined? Number(md._score).toFixed(3):''; const date = md.date? `<span class=muted>${escapeHtml(String(md.date))}</span>`:'';
    li.innerHTML = `<div style=display:flex;justify-content:space-between;align-items:center><strong>${i+1}</strong><span style=font-family:ui-monospace>${score}</span></div>` +
      `<div style=margin-top:4px>${escapeHtml(String(s.text||'').slice(0,300))}${String(s.text||'').length>300?'…':''}</div>` +
      `<div style='margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;font-size:10px'>${date}${md.source? `<span class=muted>${escapeHtml(String(md.source))}</span>`:''}</div>`;
    li.tabIndex = 0;
    li.addEventListener('click', ()=> toggleSelectSource(li, s));
    li.addEventListener('keydown', (e)=> { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleSelectSource(li,s);} });
    ul.appendChild(li);
  });
  frag.appendChild(ul); results.innerHTML=''; results.appendChild(frag);
}

// Track selected sources
const selectedSources: any[] = [];
function toggleSelectSource(li: HTMLElement, s: any) {
  const idx = selectedSources.indexOf(s);
  if (idx>=0){ selectedSources.splice(idx,1); li.classList.remove('sel'); li.style.outline=''; }
  else { selectedSources.push(s); li.classList.add('sel'); li.style.outline='2px solid var(--brand)'; }
  sendAgentBtn.disabled = selectedSources.length===0;
}
function focusAfterResults(){ const first = results.querySelector('li'); if(first) (first as HTMLElement).focus(); else answerEl.focus(); }

export function initRag(){
  if (_init) return; _init = true;
  const container = document.querySelector('main.content .container'); if(!container) return;
  card = document.createElement('div'); card.className='card'; card.id='ragCard'; card.style.display='none'; card.setAttribute('role','tabpanel');
  card.innerHTML = `
    <div class=muted style=display:flex;justify-content:space-between;align-items:center><span>RAG Search</span><div style='display:flex;gap:6px;align-items:center'><button id=ragReindex class='btn-sm' type=button title='Reindex namespace'>Reindex</button><button id=ragSendAgent class='btn-sm' type=button disabled title='Send selected sources to Agent'>Send → Agent</button><small style=font-size:10px class=muted>Vector</small></div></div>
    <form id=ragForm class=flex style='gap:6px;margin-top:6px;flex-wrap:wrap'>
      <input id=ragNs placeholder=Namespace style='width:110px' aria-label='Namespace' />
      <input id=ragCutoff placeholder='Cutoff YYYY-MM-DD' style='width:140px' aria-label='Date cutoff' />
      <input id=ragMinScore type=number step=0.001 placeholder='min score' style='width:90px' aria-label='Min score' />
      <input id=ragQuery placeholder='Query' style='min-width:200px' aria-label='Query text' />
      <input id=ragK type=number value=5 min=1 max=20 style='width:60px' aria-label='Top K' />
      <label style='font-size:11px;display:flex;align-items:center;gap:4px'><input id=ragStream type=checkbox /> Stream</label>
      <label style='font-size:11px;display:flex;align-items:center;gap:4px'><input id=ragIncMc type=checkbox checked /> MC</label>
      <label style='font-size:11px;display:flex;align-items:center;gap:4px'><input id=ragIncTl type=checkbox checked /> TL</label>
      <button class='btn-sm' type=submit>Run</button>
    </form>
    <div style='margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:12px'>
      <div><div class=muted style='font-size:11px;margin-bottom:4px'>Sources (click to select)</div><div id=ragResults style='max-height:260px;overflow:auto'></div></div>
      <div><div class=muted style='font-size:11px;margin-bottom:4px'>Answer</div><pre id=ragAnswer aria-live='polite' tabindex='0' style='font:11px ui-monospace,monospace;white-space:pre-wrap;min-height:120px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:8px;margin:0'></pre></div>
    </div>`;
  container.appendChild(card);
  form = card.querySelector('#ragForm') as HTMLFormElement; nsInput = card.querySelector('#ragNs') as HTMLInputElement; qInput = card.querySelector('#ragQuery') as HTMLInputElement; kInput = card.querySelector('#ragK') as HTMLInputElement; streamChk = card.querySelector('#ragStream') as HTMLInputElement; results = card.querySelector('#ragResults') as HTMLElement; answerEl = card.querySelector('#ragAnswer') as HTMLElement; cutoffInput = card.querySelector('#ragCutoff') as HTMLInputElement; minScoreInput = card.querySelector('#ragMinScore') as HTMLInputElement;
  includeMcChk = card.querySelector('#ragIncMc') as HTMLInputElement; includeTlChk = card.querySelector('#ragIncTl') as HTMLInputElement; reindexBtn = card.querySelector('#ragReindex') as HTMLButtonElement; sendAgentBtn = card.querySelector('#ragSendAgent') as HTMLButtonElement;
  // persistence load
  try { const savedNs = localStorage.getItem('ragNs'); if(savedNs) nsInput.value = savedNs; const savedCut = localStorage.getItem('ragCutoff'); if(savedCut) cutoffInput.value = savedCut; } catch {}
  nsInput.addEventListener('change', ()=> { try { localStorage.setItem('ragNs', nsInput.value); } catch {} });
  cutoffInput.addEventListener('change', ()=> { try { localStorage.setItem('ragCutoff', cutoffInput.value); } catch {} });
  form.addEventListener('submit', (e)=>{ e.preventDefault(); runQuery(); });

  // Reindex handler
  reindexBtn.addEventListener('click', async ()=> { const ns = currentNs(); if(!ns) return; reindexBtn.disabled = true; reindexBtn.textContent='...'; try { await fetchJson(`/api/rag/reindex/${encodeURIComponent(ns)}`, { method:'POST' }); reindexBtn.textContent='Done'; setTimeout(()=>{ reindexBtn.textContent='Reindex'; },800);} catch { reindexBtn.textContent='Err'; setTimeout(()=>{ reindexBtn.textContent='Reindex'; },1200);} finally { reindexBtn.disabled=false; }});
  // Send to agent
  sendAgentBtn.addEventListener('click', ()=> { if(!selectedSources.length) return; const ctx = selectedSources.map(s=> s.text).join('\n---\n'); emit('agent:prefill', { context: ctx, ns: currentNs() }); location.hash = '#/insight'; });

  on('page:change', (p)=> { if(card) card.style.display = p==='insight' ? '' : 'none'; });
  // Pre-set ns when symbol changes
  on('symbol:changed', (sym)=> { if(sym && nsInput && !nsInput.value) nsInput.value = sym.toUpperCase(); });
  emit('rag:ready');
}
