// @ts-nocheck
import { Api } from './app/services/api.service';

const api = new Api();
let activeSymbol: string | null = null;
let lastRaw: any = null;

// State caches
const state: any = {
  indices: [],
  sectors: [],
  idxFilter: '',
  idxPage: 0,
  secFilter: '',
  secPage: 0,
  datasets: new Map<string, any>(),
  autoTimer: null as any,
};

function $(id:string){ return document.getElementById(id); }
function esc(s:string){ return String(s).replace(/[&<>]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c)); }
function pct(a:number){ if(!Number.isFinite(a)) return '-'; return (a*100).toFixed(2)+'%'; }
function num(a:number){ if(!Number.isFinite(a)) return '-'; return a.toFixed(2); }
function setRaw(obj:any){ lastRaw=obj; const out=$('rawOut'); if(out) out.textContent = JSON.stringify(obj, null, 2); }
function nowTs(){ return new Date().toLocaleTimeString(); }

function savePref(k:string,v:any){ try { localStorage.setItem('ext_'+k, JSON.stringify(v)); } catch{} }
function loadPref(k:string, def:any){ try { const v = localStorage.getItem('ext_'+k); return v? JSON.parse(v): def; } catch { return def; } }

async function initSymbols(){ const sel = $('symbolSelect') as HTMLSelectElement | null; if(!sel) return; sel.innerHTML = '<option value="">Loading...</option>'; try { const j = await api.listStocks(); const arr: string[] = (j?.data||j||[]).map((r:any)=> r.symbol || r).filter(Boolean).slice(0,500); if(!arr.length) throw new Error('empty'); sel.innerHTML = '<option value="">-- Select --</option>' + arr.map(s=>`<option>${s}</option>`).join(''); } catch { const fallback = ['AAPL','MSFT','GOOG','AMZN','TSLA','RELIANCE.NS','TCS.NS']; sel.innerHTML = '<option value="">-- Select --</option>' + fallback.map(s=>`<option>${s}</option>`).join(''); }
  const last = loadPref('symbol', ''); if(last){ sel.value = last; setSymbol(last); }
  sel.addEventListener('change', ()=> { const v = sel.value.trim(); if(v){ setSymbol(v); savePref('symbol', v); } }); }

function setSymbol(sym:string){ activeSymbol = sym.toUpperCase(); const hint = $('symbolHint'); if(hint) hint.textContent = activeSymbol; loadStockAll(); }

// Generic retry wrapper
async function withRetry<T>(fn:()=>Promise<T>, attempts=2): Promise<T>{ let lastErr:any; for(let i=0;i<attempts;i++){ try { return await fn(); } catch(e){ lastErr=e; await new Promise(r=> setTimeout(r, 400*(i+1))); } } throw lastErr; }

function setStatus(id:string, ok:boolean, latency:number, note=''){ const el=$(id); if(!el) return; el.textContent = (ok?'✅':'❌')+` ${nowTs()} ${latency? '('+latency+'ms)':''} ${note}`; el.style.color = ok? '#15803d':'#b91c1c'; }

// ===== Indices & Sectors (pagination + filtering + drilldown) =====
function filteredPage(items:any[], filter:string, page:number, pageSize:number){ const f = filter.trim().toLowerCase(); const arr = f? items.filter(r=> JSON.stringify(r).toLowerCase().includes(f)) : items; const pages = Math.max(1, Math.ceil(arr.length / pageSize)); const p = Math.min(Math.max(0,page), pages-1); const slice = arr.slice(p*pageSize, p*pageSize+pageSize); return { slice, total: arr.length, pages, page: p }; }

function renderIndices(){ const body=$('indicesBody'); if(!body) return; const pageSizeSel=$('idxPageSize') as HTMLSelectElement|null; const pageSize = Number(pageSizeSel?.value||15); const { slice, total, pages, page } = filteredPage(state.indices, state.idxFilter, state.idxPage, pageSize); const head='<tr><th>Name</th><th>Last</th><th>Chg%</th></tr>'; const trs = slice.map((r:any)=>{ const chg=Number(r.perChange||r.changePerc||r.change||0); const cls=chg>=0?'good':'bad'; const idxId = r.indexId || r.indexid || r.indexid_nse || r.id; return `<tr data-act="idx-drill" data-indexid="${esc(idxId||'')}"><td class="idx-name" style="cursor:pointer;">${esc(r.indexName||r.name||'')}</td><td>${num(Number(r.last)||Number(r.ltp)||Number(r.currentIndexValue)||0)}</td><td class="${cls}">${num(chg)}</td></tr>`; }).join(''); body.innerHTML = `<table>${head}${trs}</table>`; const status=$('indicesStatus'); if(status) status.textContent = `${total} rows • Page ${page+1}/${pages}`; }

function renderSectors(){ const body=$('sectorBody'); if(!body) return; const pageSizeSel=$('secPageSize') as HTMLSelectElement|null; const pageSize = Number(pageSizeSel?.value||15); const { slice, total, pages, page } = filteredPage(state.sectors, state.secFilter, state.secPage, pageSize); const head='<tr><th>Sector</th><th>1D%</th><th>1W%</th></tr>'; const trs = slice.map((r:any)=>{ const d=Number(r.dayChange||r.oneDay||r.oneDayChange||0); const w=Number(r.weekChange||r.oneWeek||r.oneWeekChange||0); return `<tr><td>${esc(r.sector||r.name||r.sectorName||'')}</td><td class="${d>=0?'good':'bad'}">${num(d)}</td><td class="${w>=0?'good':'bad'}">${num(w)}</td></tr>`; }).join(''); body.innerHTML = `<table>${head}${trs}</table>`; const status=$('sectorsStatus'); if(status) status.textContent = `${total} rows • Page ${page+1}/${pages}`; }

async function loadIndices(){ const body=$('indicesBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.etIndices()); const dataRaw = j?.data || j || {}; const rows = Array.isArray(dataRaw?.searchresult)? dataRaw.searchresult : (Array.isArray(dataRaw)? dataRaw : (dataRaw.searchresult||[])); state.indices = rows; state.idxPage = 0; renderIndices(); state.datasets.set('indices', rows); const t1=performance.now(); setStatus('indicesStatus', true, Math.round(t1-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('indicesStatus', false, 0, e?.message||e); } }
async function loadSectors(){ const body=$('sectorBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.etSectorPerformance()); const rows=j?.data?.data || j?.data || j || []; state.sectors = Array.isArray(rows)? rows : []; state.secPage = 0; renderSectors(); state.datasets.set('sectors', state.sectors); const t1=performance.now(); setStatus('sectorsStatus', true, Math.round(t1-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('sectorsStatus', false, 0, e?.message||e); } }

async function loadIndexConstituents(indexId:string){ const body=$('idxConBody'); if(body) body.innerHTML='<span class="spinner"></span> Loading constituents'; const t0=performance.now(); try { const j = await withRetry(()=> api.etIndexConstituents(indexId, 500, 1)); const d = j?.data || j || {}; const arr = d?.data || d?.searchresult || d?.constituents || (Array.isArray(d)? d : []); if(!Array.isArray(arr) || !arr.length){ body.innerHTML='No rows'; } else { const head='<tr><th>Symbol</th><th>Name</th><th>Weight%</th><th>Chg%</th></tr>'; const rows = arr.slice(0,120).map((r:any)=>{ const chg=Number(r.perChange||r.changePerc||r.change||r.pChange||0); const cls=chg>=0? 'good':'bad'; return `<tr><td>${esc(r.ticker||r.symbol||r.sid||'')}</td><td>${esc(r.companyName||r.name||'')}</td><td>${num(Number(r.weight)||Number(r.weightage)||0)}</td><td class="${cls}">${num(chg)}</td></tr>`; }).join(''); body.innerHTML = `<table>${head}${rows}</table>`; state.datasets.set('idxCon', arr); }
    const t1=performance.now(); setStatus('idxConStatus', true, Math.round(t1-t0), indexId); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('idxConStatus', false, 0, e?.message||e); }
}

// ===== MMI / Valuation / TL Cookie =====
async function loadMmi(){ const body=$('mmiBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.tickertapeMmi()); const d=j?.data||j; body.innerHTML = d ? `<div style="font-size:42px; font-weight:600;">${d.mmi ?? d.value ?? '-'}</div><div class="muted">${esc(d.label||d.state||'')}</div>` : 'No data'; state.datasets.set('mmi', d); setStatus('mmiStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('mmiStatus', false, 0, e?.message||e); } }
async function loadValuation(){ const body=$('valuationBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.marketsMojoValuation()); const d=j?.data||j; body.innerHTML = d ? `<div style="font-size:40px; font-weight:600;">${d.score ?? d.meter ?? '-'}</div><div class="muted">${esc(d.zone||d.state||d.message||'')}</div>` : 'No data'; state.datasets.set('valuation', d); setStatus('valuationStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('valuationStatus', false, 0, e?.message||e); } }
async function loadTlCookie(){ const body=$('tlCookieBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.tlCookieStatus()); const d=j?.data||j; body.innerHTML = d ? Object.keys(d).map(k=> `<div><strong>${esc(k)}</strong>: ${esc(String(d[k]))}</div>`).join('') : 'No data'; state.datasets.set('tlcookie', d); setStatus('tlCookieStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('tlCookieStatus', false, 0, e?.message||e); } }

// ===== Stock-specific loaders =====
function guardSym(bodyId:string){ if(!activeSymbol){ const b=$(bodyId); if(b) b.innerHTML='Select symbol.'; return false; } return true; }
async function loadMcQuick(){ if(!guardSym('mcQuickBody')) return; const body=$('mcQuickBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.mcQuick(activeSymbol!)); const d=j?.data||{}; setRaw(j); const f = d.forecast; const rsi = d.rsi||{}; body.innerHTML = `<div class="flex" style="flex-wrap:wrap; gap:6px"><div><strong>${esc(d.mcsymbol||'')}</strong></div>${f?`<div class="pill">Forecast: ${esc(f?.forecastText||f?.forecast||'-')}</div>`:''}<div class="pill">RSI D: ${num(Number(rsi?.D?.rsi||rsi?.D?.value||0))}</div><div class="pill">RSI W: ${num(Number(rsi?.W?.rsi||rsi?.W?.value||0))}</div><div class="pill">RSI M: ${num(Number(rsi?.M?.rsi||rsi?.M?.value||0))}</div></div>`; state.datasets.set('mcQuick', d); setStatus('mcQuickStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('mcQuickStatus', false, 0, e?.message||e); } }
async function loadMcPv(){ if(!guardSym('mcPvBody')) return; const body=$('mcPvBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.mcPriceVolume(activeSymbol!)); const d=j?.data||{}; setRaw(j); const arr = Array.isArray(d?.priceVolume) ? d.priceVolume.slice(-8).reverse() : []; body.innerHTML = arr.length? `<table><tr><th>Date</th><th>Close</th><th>Vol</th></tr>${arr.map((r:any)=>`<tr><td>${(r.date||'').slice(0,10)}</td><td>${num(Number(r.close||r.price||0))}</td><td>${r.volume||r.vol||'-'}</td></tr>`).join('')}</table>` : 'No rows'; state.datasets.set('mcPv', d); setStatus('mcPvStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('mcPvStatus', false, 0, e?.message||e); } }
async function loadMcTech(){ if(!guardSym('mcTechBody')) return; const body=$('mcTechBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const freqEl=$('mcTechFreq') as HTMLSelectElement|null; const freq=(freqEl?.value||'D') as any; savePref('mcTechFreq', freq); const j=await withRetry(()=> api.mcTech(activeSymbol!, freq)); const d=j?.data||{}; setRaw(j); const score = d?.score ?? d?.stockScore ?? '-'; body.innerHTML = `<div style="font-size:40px; font-weight:600;">${num(Number(score))}</div><div class="muted">Freq ${freq}</div>`; state.datasets.set('mcTech', d); setStatus('mcTechStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('mcTechStatus', false, 0, e?.message||e); } }
async function loadTlAdv(){ if(!guardSym('tlAdvBody')) return; const body=$('tlAdvBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const lookEl=$('tlLook') as HTMLSelectElement|null; const look= Number(lookEl?.value||24); savePref('tlLook', look); const j=await withRetry(()=> api.tlAdvTechBySymbol(activeSymbol!, { lookback: look })); const d=j?.data||{}; setRaw(j); const norm = d?.normalized || {}; const lines = Object.keys(norm).slice(0,8).map(k=> `<div><strong>${esc(k)}</strong>: ${esc(String(norm[k]))}</div>`).join(''); body.innerHTML = lines || 'No normalized data'; state.datasets.set('tlAdv', d); setStatus('tlAdvStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('tlAdvStatus', false, 0, e?.message||e); } }
async function loadTlSma(){ if(!guardSym('tlSmaBody')) return; const body=$('tlSmaBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.tlSmaBySymbol(activeSymbol!)); const d=j?.data||{}; setRaw(j); const arr = d?.sma?.data || d?.sma || []; body.innerHTML = Array.isArray(arr) && arr.length? `<div>${arr.length} pts (latest ${(arr[arr.length-1]?.date||'').slice(0,10)})</div>` : 'No SMA data'; state.datasets.set('tlSma', d); setStatus('tlSmaStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('tlSmaStatus', false, 0, e?.message||e); } }
async function loadTlDeriv(){ if(!guardSym('tlDerivBody')) return; const body=$('tlDerivBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const dateEl=$('tlDerivDate') as HTMLInputElement|null; if(!dateEl?.value){ const today = new Date().toISOString().slice(0,10); if(dateEl) dateEl.value = today; } const date = (dateEl?.value)|| new Date().toISOString().slice(0,10); const j=await withRetry(()=> api.tlDerivatives(date, undefined)); setRaw(j); const d=j?.data||{}; const b=d?.buildup; body.innerHTML = b? `<div>Total contracts: ${b.totalContracts||'-'}<br/>OI Chg: ${b.oiChange||'-'}<br/>Type: ${esc(b.buildUpType||'-')}</div>` : 'No buildup'; state.datasets.set('tlDeriv', d); setStatus('tlDerivStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('tlDerivStatus', false, 0, e?.message||e); } }
async function loadDbStats(){ if(!guardSym('dbStatsBody')) return; const body=$('dbStatsBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const j=await withRetry(()=> api.dbStats(activeSymbol!)); const d=j?.data||j||{}; setRaw(j); const rows = Object.keys(d).map(k=> `<div><strong>${esc(k)}</strong>: ${esc(String(d[k]))}</div>`).join(''); body.innerHTML = rows || 'Empty'; state.datasets.set('dbStats', d); setStatus('dbStatsStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('dbStatsStatus', false, 0, e?.message||e); } }

// New: Options Metrics (from /stocks/:symbol/options-metrics)
async function loadOptionsMetrics(){ if(!guardSym('optionsMetricsBody')) return; const body=$('optionsMetricsBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const daysSel=$('optDaysSel') as HTMLSelectElement|null; const days=Number(daysSel?.value||60); savePref('optDaysSel', days); const j=await withRetry(()=> api.optionsMetrics(activeSymbol!, days, 180)); const rows = j?.data||j||[]; if(!Array.isArray(rows)||!rows.length){ body.innerHTML='No data'; } else { const head='<tr><th>Date</th><th>PCR</th><th>PVR</th><th>Bias</th></tr>'; const trs= rows.slice(-60).reverse().map((r:any)=> `<tr><td>${(r.date||'').slice(0,10)}</td><td>${num(Number(r.pcr))}</td><td>${num(Number(r.pvr))}</td><td>${num(Number(r.bias))}</td></tr>`).join(''); body.innerHTML = `<table>${head}${trs}</table>`; }
    state.datasets.set('optionsMetrics', rows); setStatus('optionsMetricsStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML = `<span class="bad">${e?.message||e}</span>`; setStatus('optionsMetricsStatus', false, 0, e?.message||e); } }

// New: Sentiment Heatmap (reuse Trendlyne derivatives heatmap)
async function loadSentHeat(){ const body=$('sentHeatBody'); if(body) body.innerHTML='<span class="spinner"></span>'; const t0=performance.now(); try { const date = new Date().toISOString().slice(0,10); const j=await withRetry(()=> api.tlDerivatives(date, undefined)); const d=j?.data||{}; const heat = d?.heatmap || []; if(!Array.isArray(heat)||!heat.length){ body.innerHTML='No heatmap'; } else { const top = heat.slice(0,40); const head='<tr><th>Sym</th><th>OI Chg%</th><th>Vol Chg%</th><th>Type</th></tr>'; const trs = top.map((r:any)=> { const oi = Number(r.oiChangePct||r.oiChange||0); const vol = Number(r.volumeChangePct||r.volChange||0); const cls = oi>=0? 'good':'bad'; return `<tr><td>${esc(r.symbol||r.ticker||'')}</td><td class="${cls}">${num(oi)}</td><td>${num(vol)}</td><td>${esc(r.buildUpType||r.type||'')}</td></tr>`; }).join(''); body.innerHTML = `<table>${head}${trs}</table>`; }
    state.datasets.set('sentHeat', heat); setStatus('sentHeatStatus', true, Math.round(performance.now()-t0)); } catch(e:any){ if(body) body.innerHTML=`<span class="bad">${e?.message||e}</span>`; setStatus('sentHeatStatus', false, 0, e?.message||e); } }

async function loadStockAll(){ await Promise.allSettled([
  loadMcQuick(),
  loadMcPv(),
  loadMcTech(),
  loadTlAdv(),
  loadTlSma(),
  loadTlDeriv(),
  loadDbStats(),
  loadOptionsMetrics(),
  loadSentHeat(),
]); }

// Auto-refresh
function setupAuto(){ const toggle=$('autoToggle') as HTMLInputElement|null; const sel=$('autoInterval') as HTMLSelectElement|null; if(!toggle||!sel) return; function apply(){ if(state.autoTimer){ clearInterval(state.autoTimer); state.autoTimer=null; } if(toggle.checked){ const ms = Number(sel.value||60000); state.autoTimer = setInterval(()=> { if(activeSymbol) loadStockAll(); loadIndices(); loadSectors(); loadMmi(); loadValuation(); }, ms); } savePref('autoOn', toggle.checked); savePref('autoMs', sel.value); }
  toggle.addEventListener('change', apply); sel.addEventListener('change', apply); const savedOn = loadPref('autoOn', false); const savedMs = loadPref('autoMs', '60000'); toggle.checked = savedOn; sel.value = String(savedMs); apply(); }

// Export helpers
function toCsv(data:any): string { if(!data) return ''; if(Array.isArray(data)){ if(!data.length) return ''; const cols = Array.from(new Set(data.flatMap(r=> Object.keys(r||{})))); const lines=[cols.join(',')]; data.forEach(r=>{ lines.push(cols.map(c=> JSON.stringify((r||{})[c]??'').replace(/^"|"$/g,'')).join(',')); }); return lines.join('\n'); } if(typeof data==='object'){ return toCsv([data]); } return String(data); }
function triggerDownload(name:string, content:string, mime='text/plain'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content], {type:mime})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=> { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

function handleExport(target:string, type:'json'|'csv'){ const data = state.datasets.get(target); if(type==='json'){ triggerDownload(`${target}.json`, JSON.stringify(data, null, 2), 'application/json'); } else { triggerDownload(`${target}.csv`, toCsv(data), 'text/csv'); } }

function wireButtons(){ document.querySelectorAll('[data-act]')?.forEach(btn=>{ btn.addEventListener('click', (ev)=>{ const act=(ev.currentTarget as HTMLElement).getAttribute('data-act'); switch(act){ case 'mcQuick': loadMcQuick(); break; case 'mcPV': loadMcPv(); break; case 'mcTech': loadMcTech(); break; case 'tlAdv': loadTlAdv(); break; case 'tlSma': loadTlSma(); break; case 'tlDeriv': loadTlDeriv(); break; case 'dbStats': loadDbStats(); break; case 'reload-options': loadOptionsMetrics(); break; case 'reload-heat': loadSentHeat(); break; case 'exp-json': { const target=(ev.currentTarget as HTMLElement).getAttribute('data-target')||''; handleExport(target,'json'); break; } case 'exp-csv': { const target=(ev.currentTarget as HTMLElement).getAttribute('data-target')||''; handleExport(target,'csv'); break; } } }); }); $('refreshSymbol')?.addEventListener('click', ()=> loadStockAll());
  // Pagination & filters
  $('idxFilter')?.addEventListener('input', (e:any)=> { state.idxFilter = e.target.value; state.idxPage=0; renderIndices(); });
  $('secFilter')?.addEventListener('input', (e:any)=> { state.secFilter = e.target.value; state.secPage=0; renderSectors(); });
  $('idxPageSize')?.addEventListener('change', ()=> { state.idxPage=0; renderIndices(); });
  $('secPageSize')?.addEventListener('change', ()=> { state.secPage=0; renderSectors(); });
  $('idxPrev')?.addEventListener('click', ()=> { state.idxPage=Math.max(0,state.idxPage-1); renderIndices(); });
  $('idxNext')?.addEventListener('click', ()=> { state.idxPage=state.idxPage+1; renderIndices(); });
  $('secPrev')?.addEventListener('click', ()=> { state.secPage=Math.max(0,state.secPage-1); renderSectors(); });
  $('secNext')?.addEventListener('click', ()=> { state.secPage=state.secPage+1; renderSectors(); });
  // Table row delegation for index constituents
  $('indicesBody')?.addEventListener('click', (ev)=> { const tr=(ev.target as HTMLElement).closest('tr[data-act="idx-drill"]'); if(tr){ const idxId = tr.getAttribute('data-indexid')||''; if(idxId) loadIndexConstituents(idxId); }
  });
  // Restore selects
  const mcFreq = loadPref('mcTechFreq', 'D'); const mcSel=$('mcTechFreq') as HTMLSelectElement|null; if(mcSel){ mcSel.value = mcFreq; }
  const tlLook = loadPref('tlLook', 24); const tlSel=$('tlLook') as HTMLSelectElement|null; if(tlSel){ tlSel.value = String(tlLook); }
  const optDays = loadPref('optDaysSel', 60); const optSel=$('optDaysSel') as HTMLSelectElement|null; if(optSel){ optSel.value = String(optDays); }
}

window.addEventListener('DOMContentLoaded', () => {
  initSymbols();
  wireButtons();
  setupAuto();
  loadIndices();
  loadSectors();
  loadMmi();
  loadValuation();
  loadTlCookie();
  // Preload saved symbol preferences if selectors existed before initSymbols assign value
  const mcSel=$('mcTechFreq') as HTMLSelectElement|null; if(mcSel) mcSel.value = loadPref('mcTechFreq','D');
});
