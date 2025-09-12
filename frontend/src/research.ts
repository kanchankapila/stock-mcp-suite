// @ts-nocheck
import { Api } from './app/services/api.service';

const api = new Api();
let activeSymbol: string | null = null;
let compareSyms: string[] = [];
// Added: in-memory stock list + suggestions state
let stockList: Array<{ name:string; symbol:string; yahoo?:string }> = [];
let suggIndex = -1; // keyboard navigation index

function $(id: string){ return document.getElementById(id); }
function text(el: HTMLElement | null, v: string){ if(el) el.textContent = v; }
function fmtPct(v: number){ if(!Number.isFinite(v)) return '-'; return (v*100).toFixed(2)+'%'; }
function fmtNum(v: number){ if(!Number.isFinite(v)) return '-'; return v.toFixed(2); }
function loadWatchlist(){ try { return JSON.parse(localStorage.getItem('watchlist')||'[]'); } catch { return []; } }
function saveWatchlist(list: string[]){ localStorage.setItem('watchlist', JSON.stringify(Array.from(new Set(list)).slice(0,200))); }
function renderWatchlist(){ const list = loadWatchlist(); const wrap = $('watchlist'); if(!wrap) return; wrap.innerHTML=''; list.forEach(sym=>{ const btn = document.createElement('button'); btn.className='sym'+(sym===activeSymbol?' active':''); btn.textContent=sym; btn.onclick=()=>{ setActiveSymbol(sym); }; wrap.appendChild(btn); }); }

async function health(){ try { const h = await api.health(); const dot=$('healthDot'); const txt=$('healthText'); if(dot) dot.classList.add('ok'); if(txt) text(txt, 'OK'); } catch(e){ const dot=$('healthDot'); const txt=$('healthText'); if(dot) dot.classList.add('err'); if(txt) text(txt, 'ERR'); } }

function setActiveSymbol(sym: string){ activeSymbol = sym.toUpperCase().trim(); const input = $('symInput') as HTMLInputElement | null; if(input) input.value = activeSymbol; hideSuggestions(); renderWatchlist(); loadAll(); }

async function loadAll(){ if(!activeSymbol) return; await Promise.allSettled([
  loadOverview(activeSymbol),
  loadHistoryAndChart(activeSymbol),
  loadOptions(activeSymbol),
  loadNews(activeSymbol),
  runAnalysis(activeSymbol)
]); }

async function loadOverview(sym: string){ const body=$('overviewBody'); const raw=$('rawJson'); if(body) body.innerHTML='<span class="spinner"></span> Loading overview'; try {
    // Fetch core overview + MC insight in parallel
    const [ovRes, mcRes] = await Promise.allSettled([ api.overview(sym), api.mcInsight(sym) ]);
    const j = ovRes.status==='fulfilled'? ovRes.value : null;
    const mc = mcRes.status==='fulfilled' && mcRes.value?.ok !== false ? (mcRes.value?.data || mcRes.value) : null;
    if(raw) raw.textContent = JSON.stringify({ overview: j, mcInsight: mc }, null, 2);
    const d=j?.data||j; const lines: string[] = [];
    if(d){ const keys = Object.keys(d).slice(0,40); keys.forEach(k=>{ const v=d[k]; if(typeof v==='number') lines.push(`<div><strong>${esc(k)}</strong>: ${fmtNum(v)}</div>`); else if(typeof v==='string' && v.length<120) lines.push(`<div><strong>${esc(k)}</strong>: ${esc(v)}</div>`); }); }
    if(mc){
      if(mc.stockScore!=null) lines.push(`<div><strong>MC Score</strong>: ${esc(String(mc.stockScore))}</div>`);
      if(mc.shortDesc) lines.push(`<div><strong>MC Short</strong>: ${esc(String(mc.shortDesc).slice(0,140))}</div>`);
      if(mc.longDesc) lines.push(`<div style="font-size:11px; line-height:1.3;">${esc(String(mc.longDesc).slice(0,320))}${mc.longDesc.length>320?'…':''}</div>`);
    }
    if(!lines.length) lines.push('<div class="muted">No overview data.</div>');
    if(body) body.innerHTML = lines.join('');
  } catch(e:any){ if(body) body.innerHTML = `<span class="danger-text">${esc(e?.message||e)}</span>`; }
}

async function runAnalysis(sym: string){ const body=$('analysisBody'); if(body) body.innerHTML='<span class="spinner"></span> Analyzing'; try { const j = await api.analyze(sym); const d=j?.data||{}; const reco = d.recommendation||'HOLD'; const cls = reco==='BUY'? 'pill buy': (reco==='SELL'?'pill sell':'pill'); const bt = d.backtest||{}; body.innerHTML = `<div class="flex"><div class="${cls}">${reco}</div><div>Score: <strong>${d.score}</strong></div><div>Sent: ${fmtNum(d.sentiment)}</div><div>Pred Close: ${fmtNum(d.predictedClose)}</div><div>Total Return(backtest): ${fmtPct(bt.totalReturn||0)}</div></div>`;
  } catch(e:any){ if(body) body.innerHTML = `<span class="danger-text">${esc(e?.message||e)}</span>`; }
}

async function loadOptions(sym: string){ const daysSel = $('optDays') as HTMLSelectElement | null; const days = Number(daysSel?.value||60); const body=$('optionsBody'); if(body) body.innerHTML='<span class="spinner"></span>'; try { const j = await api.optionsMetrics(sym, days, 120); const rows = j?.data || j || []; if(!rows.length){ body.innerHTML='<span class="muted">No data.</span>'; return; } const recent = rows.slice(-10).reverse(); const head = '<tr><th>Date</th><th>OI Chg</th><th>Vol</th><th>Avg IV</th><th>Call/Put OI</th></tr>'; const trs = recent.map(r=> `<tr><td>${r.date?.slice(0,10)||''}</td><td>${fmtPct(r.oiChange||0)}</td><td>${r.volume||'-'}</td><td>${fmtPct(r.avgIv||0)}</td><td>${fmtNum(r.callPutOiRatio||0)}</td></tr>`).join(''); body.innerHTML = `<table>${head}${trs}</table>`; } catch(e:any){ if(body) body.innerHTML = `<span class="danger-text">${esc(e?.message||e)}</span>`; } }

async function loadNews(sym: string){ const body=$('newsBody'); if(body) body.innerHTML=''; try { const j = await api.news(sym); const arr = j?.data || j || []; if(!arr.length){ body.innerHTML='<div class="muted">No news.</div>'; return; } const limited = arr.slice(-25); body.innerHTML = limited.map(n=> `<div class="news-item"><div class="title">${esc(n.title||'')}</div><div class="muted">${(n.date||'').slice(0,10)} &bull; Sent: ${fmtNum(n.sentiment)}</div><div class="muted" style="font-size:11px;">${esc((n.summary||'').slice(0,140))}</div></div>`).join(''); } catch(e:any){ if(body) body.innerHTML = `<span class="danger-text">${esc(e?.message||e)}</span>`; } }

function esc(s:string){ return String(s).replace(/[&<>]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c)); }

async function loadHistoryAndChart(sym: string){ const canvas = $('priceChart') as HTMLCanvasElement | null; const hint=$('chartHint'); if(hint) text(hint,''); if(!canvas) return; const fastSel = $('smaFast') as HTMLSelectElement | null; const slowSel = $('smaSlow') as HTMLSelectElement | null; const fW = Number(fastSel?.value||20); const sW = Number(slowSel?.value||100); const ctx = canvas.getContext('2d'); if(!ctx) return; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#64748b'; ctx.font='12px system-ui'; ctx.fillText('Loading…', 12, 22); try { const j = await api.history(sym); const rows = j?.data || j || []; if(!rows.length){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillText('No price history', 12, 22); return; } const data = rows.map(r=> ({ date: r.date, close: Number(r.close) })).filter(r=> Number.isFinite(r.close)); const closes = data.map(d=>d.close); const smaF = SMA(closes, fW); const smaS = SMA(closes, sW); drawLines(canvas, [ { data: closes, color:'#0f172a', label:'Close' }, { data: smaF, color:'#3b82f6', label:`SMA${fW}` }, { data: smaS, color:'#8b5cf6', label:`SMA${sW}` } ]); if(hint) text(hint, `Points=${closes.length}`); } catch(e:any){ if(hint) text(hint, `Error: ${e?.message||e}`); } }

function SMA(arr:number[], w:number){ const out=[]; for(let i=0;i<arr.length;i++){ const start=Math.max(0,i-w+1); const slice=arr.slice(start,i+1); out.push(slice.reduce((a,b)=>a+b,0)/slice.length); } return out; }
function drawLines(canvas: HTMLCanvasElement, series: Array<{data:number[], color:string, label:string}>){ const ctx=canvas.getContext('2d'); if(!ctx) return; const w=canvas.width = canvas.clientWidth * devicePixelRatio; const h=canvas.height = canvas.clientHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio); const max=Math.max(...series.flatMap(s=>s.data.filter(Number.isFinite))); const min=Math.min(...series.flatMap(s=>s.data.filter(Number.isFinite))); const pad=24; function y(v:number){ return pad + ( (max-v)/(max-min||1) ) * ( (h/devicePixelRatio) - pad*2 ); } function x(i:number, n:number){ return pad + i/(Math.max(1,n-1)) * ( (w/devicePixelRatio)-pad*2 ); }
  ctx.clearRect(0,0,w,h); ctx.lineWidth=1.4; ctx.font='11px system-ui'; ctx.fillStyle='#334155'; ctx.fillText(fmtNum(max), 4, 10); ctx.fillText(fmtNum(min), 4, h/devicePixelRatio-4);
  series.forEach(s=>{ ctx.beginPath(); ctx.strokeStyle=s.color; s.data.forEach((v,i)=>{ const xv=x(i,s.data.length); const yv=y(v); if(i===0) ctx.moveTo(xv,yv); else ctx.lineTo(xv,yv); }); ctx.stroke(); });
  let lx=pad; series.forEach(s=>{ ctx.fillStyle=s.color; ctx.fillRect(lx, h/devicePixelRatio-18, 12, 12); ctx.fillStyle='#0f172a'; ctx.fillText(s.label, lx+16, h/devicePixelRatio-8); lx += ctx.measureText(s.label).width + 40; });
}

async function agentAsk(stream=false){ if(!activeSymbol) return; const qEl=$('agentQ') as HTMLInputElement|null; const out=$('agentOut'); const q=qEl?.value?.trim(); if(!q){ if(out) out.textContent='Enter a question.'; return; } if(!out) return; out.textContent = stream? '' : 'Loading...'; try {
  if(!stream){ const j = await api.agent(q, activeSymbol); const ans = j?.data?.answer || JSON.stringify(j); out.textContent = ans; }
  else {
    const resp = await api.agentStream(q, activeSymbol); if(!resp?.body){ out.textContent='No stream'; return; }
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let acc=''; while(true){ const {done, value} = await reader.read(); if(done) break; acc += dec.decode(value,{stream:true}); out.textContent = acc; }
  }
 } catch(e:any){ out.textContent = 'Error: '+ (e?.message||e); }
}

async function ragQuery(){ if(!activeSymbol) return; const qEl=$('ragQ') as HTMLInputElement|null; const out=$('ragOut'); const q=qEl?.value?.trim(); if(!q){ if(out) out.textContent='Enter a query.'; return; } if(out) out.textContent='Searching...'; try { const j = await api.ragQuery(activeSymbol, q, 5, true); const answer = j?.answer || j?.data?.answer; const refs = j?.results || j?.data?.results || []; out.textContent = (answer? answer+"\n\n":"") + refs.map((r,i)=>`[${i+1}] ${(r?.metadata?.url||'').slice(0,120)}`).join('\n'); } catch(e:any){ if(out) out.textContent = 'Error: '+(e?.message||e); } }

function addCompareSymbol(sym: string){ sym = sym.toUpperCase().trim(); if(!sym) return; if(!compareSyms.includes(sym)) compareSyms.push(sym); renderCompareChipList(); }
function renderCompareChipList(){ const wrap=$('compareTableWrap'); if(!wrap) return; const chips = compareSyms.map(s=>`<span class="pill" data-sym="${s}">${s}</span>`).join(' '); wrap.innerHTML = chips + '<div id="compareResults" style="margin-top:6px"></div>'; }
async function runCompare(){ if(compareSyms.length<2) return; const resWrap = $('compareResults'); if(resWrap) resWrap.innerHTML='Computing...'; const data: Array<{symbol:string, ret:number}> = []; for(const s of compareSyms){ try { const j = await api.history(s); const rows = j?.data || j || []; const recent = rows.slice(-90); if(recent.length>1){ const ret = (Number(recent[recent.length-1].close)-Number(recent[0].close))/Number(recent[0].close); data.push({symbol:s, ret}); } } catch{} } data.sort((a,b)=> b.ret-a.ret); if(resWrap) resWrap.innerHTML = '<table class="compare-table"><tr><th>Symbol</th><th>Return(90d)</th></tr>'+ data.map(r=>`<tr><td>${r.symbol}</td><td>${fmtPct(r.ret)}</td></tr>`).join('') + '</table>'; }

// Autocomplete helpers
function initStockAutocomplete(){ const input = $('symInput') as HTMLInputElement|null; const box = $('symSuggest'); if(!input || !box) return;
  input.addEventListener('input', ()=> updateSuggestions(input.value));
  input.addEventListener('keydown', (e)=> handleSuggestKey(e));
  document.addEventListener('click', (e)=> { if(!box.contains(e.target as any) && e.target!==input) hideSuggestions(); });
  box.addEventListener('click', (e)=> { const item = (e.target as HTMLElement).closest('.item') as HTMLElement | null; if(!item) return; const sym = item.dataset.sym; if(sym) setActiveSymbol(sym); });
}
function updateSuggestions(q: string){ const box = $('symSuggest'); const input = $('symInput') as HTMLInputElement|null; if(!box || !input){ return; } q = q.trim().toLowerCase(); if(!q){ box.innerHTML=''; box.classList.add('hidden'); return; } const matches = stockList.filter(r=> r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)).slice(0,50); if(!matches.length){ box.innerHTML='<div class="item muted" style="cursor:default;">No matches</div>'; box.classList.remove('hidden'); return; } box.innerHTML = matches.map(m=> `<div class="item" data-sym="${esc(m.yahoo|| (m.symbol+'.NS'))}"><div class="sym">${esc(m.yahoo|| (m.symbol+'.NS'))}</div><div class="name">${esc(m.name)}</div></div>`).join(''); box.classList.remove('hidden'); suggIndex = -1; }
function hideSuggestions(){ const box=$('symSuggest'); if(box) box.classList.add('hidden'); suggIndex=-1; }
function handleSuggestKey(e: KeyboardEvent){ const box=$('symSuggest'); if(!box || box.classList.contains('hidden')) return; const items = Array.from(box.querySelectorAll('.item')) as HTMLElement[]; if(!items.length) return; if(e.key==='ArrowDown'){ e.preventDefault(); suggIndex = (suggIndex+1)%items.length; highlightSuggestion(items); } else if(e.key==='ArrowUp'){ e.preventDefault(); suggIndex = (suggIndex-1+items.length)%items.length; highlightSuggestion(items); } else if(e.key==='Enter'){ if(suggIndex>=0 && suggIndex<items.length){ e.preventDefault(); const sym=items[suggIndex].dataset.sym; if(sym) setActiveSymbol(sym); } hideSuggestions(); } else if(e.key==='Escape'){ hideSuggestions(); } }
function highlightSuggestion(items: HTMLElement[]){ items.forEach((it,i)=>{ if(i===suggIndex) it.style.background='#e0f2fe'; else it.style.background=''; }); }

async function fetchStockList(){ try { const res = await api.listStocks(); const arr = res?.data || res || []; stockList = Array.isArray(arr)? arr : []; } catch { stockList = []; } }

// Event wiring
window.addEventListener('DOMContentLoaded', async () => {
  health();
  await fetchStockList();
  initStockAutocomplete();
  renderWatchlist();
  $('loadBtn')?.addEventListener('click', ()=> { const inp=$('symInput') as HTMLInputElement|null; if(inp?.value) setActiveSymbol(inp.value); });
  $('addWatchBtn')?.addEventListener('click', ()=> { const inp=$('symInput') as HTMLInputElement|null; if(!inp?.value) return; const list=loadWatchlist(); list.push(inp.value.toUpperCase().trim()); saveWatchlist(list); renderWatchlist(); });
  $('runAnalyze')?.addEventListener('click', ()=> { if(activeSymbol) runAnalysis(activeSymbol); });
  $('optDays')?.addEventListener('change', ()=> { if(activeSymbol) loadOptions(activeSymbol); });
  $('smaFast')?.addEventListener('change', ()=> { if(activeSymbol) loadHistoryAndChart(activeSymbol); });
  $('smaSlow')?.addEventListener('change', ()=> { if(activeSymbol) loadHistoryAndChart(activeSymbol); });
  $('askBtn')?.addEventListener('click', ()=> agentAsk(false));
  $('askStreamBtn')?.addEventListener('click', ()=> agentAsk(true));
  $('ragBtn')?.addEventListener('click', ()=> ragQuery());
  $('compareAdd')?.addEventListener('click', ()=> { const inp=$('compareInput') as HTMLInputElement|null; if(inp?.value){ addCompareSymbol(inp.value); inp.value=''; } });
  $('compareRun')?.addEventListener('click', ()=> runCompare());

  const wl = loadWatchlist(); if(wl.length) setActiveSymbol(wl[0]);
});
