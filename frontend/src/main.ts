// Lightweight bootstrapping for the demo UI using vanilla TS + Vite.
// If you want a full Angular project, generate one with Angular CLI and port the components/services.

import { Api } from './app/services/api.service';

// Use default base from service (Vite env/proxy). Avoid hardcoding ports.
const api = new Api();

const root = document.getElementById('app')!;
root.innerHTML = `
  <div class="container">
    <div class="card">
      <div class="flex">
        <input id="stockSearch" placeholder="Search stocks..." style="min-width:220px" />
        <select id="stockSelect" style="min-width:260px">
          <option value="" selected disabled>— Select a stock —</option>
        </select>
        <input id="symbol" placeholder="Enter stock symbol (e.g., AAPL)" list="stocksList" />
        <!-- Auto-fetches on selection; buttons removed -->
        <button id="dbstatsBtn">DB Data</button>
        
      </div>
      <datalist id="stocksList"></datalist>
      <div class="muted" style="margin-top:8px">Pulls prices & news (sample data if keys missing), then runs sentiment, prediction, strategy & backtest.</div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="card" id="marketOverview"><div class="muted">Market Overview</div></div>
      <div class="card" id="status"><div class="muted">Status</div></div>
      <div class="card" id="overview"><div class="muted">Overview</div></div>
      <div class="card" id="sentiment"><div class="muted">Sentiment & Recommendation</div></div>
      <div class="card" id="mcinsight"><div class="muted">MC Insight</div></div>
      <div class="card" id="mcquick"><div class="muted">MC Quick</div></div>
      <div class="card" id="mctech">
        <div class="muted">MC Technicals</div>
        <div class="flex" style="gap:8px; margin-top:6px">
          <label class="muted">Pivots:</label>
          <button id="pivotClassic" class="btn-sm">Classic</button>
          <button id="pivotFibo" class="btn-sm">Fibonacci</button>
          <button id="pivotCama" class="btn-sm">Camarilla</button>
        </div>
        <div id="mctechBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="history" style="grid-column: span 2"><div class="muted">Price History</div></div>
      <div class="card" id="yahooData" style="grid-column: span 2">
        <div class="muted">Yahoo Data</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <label class="muted">Range:</label>
          <select id="ydRange">
            <option value="1y" selected>1y</option>
            <option value="6mo">6mo</option>
            <option value="3mo">3mo</option>
            <option value="1mo">1mo</option>
            <option value="5y">5y</option>
            <option value="max">max</option>
          </select>
          <label class="muted">Interval:</label>
          <select id="ydInterval">
            <option value="1d" selected>1d</option>
            <option value="1wk">1wk</option>
            <option value="1mo">1mo</option>
          </select>
        </div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <label class="muted">Modules:</label>
          <label><input type="checkbox" id="ydm_price" checked /> <span class="muted">price</span></label>
          <label><input type="checkbox" id="ydm_summaryDetail" checked /> <span class="muted">summaryDetail</span></label>
          <label><input type="checkbox" id="ydm_assetProfile" checked /> <span class="muted">assetProfile</span></label>
          <label><input type="checkbox" id="ydm_financialData" checked /> <span class="muted">financialData</span></label>
          <label><input type="checkbox" id="ydm_defaultKeyStatistics" checked /> <span class="muted">defaultKeyStatistics</span></label>
          <label><input type="checkbox" id="ydm_earnings" /> <span class="muted">earnings</span></label>
          <label><input type="checkbox" id="ydm_calendarEvents" /> <span class="muted">calendarEvents</span></label>
          <label><input type="checkbox" id="ydm_recommendationTrend" /> <span class="muted">recommendationTrend</span></label>
          <label><input type="checkbox" id="ydm_secFilings" /> <span class="muted">secFilings</span></label>
          <label><input type="checkbox" id="ydm_incomeStatementHistory" /> <span class="muted">incomeStatementHistory</span></label>
        </div>
        <div id="yahooDataBody" class="mono" style="margin-top:8px"></div>
      </div>
      <div class="card" id="news" style="grid-column: span 2"><div class="muted">News (RAG)</div></div>
      <div class="card" id="dbstats" style="grid-column: span 2"><div class="muted">DB Data</div></div>
      <div class="card" id="connectivity" style="grid-column: span 2">
        <div class="muted">Connectivity</div>
        <div class="flex" style="margin-top:6px">
          <button id="connRun" class="btn-sm">Run Checks</button>
          <div id="connHint" class="muted">Pings external APIs and shows status</div>
        </div>
        <div id="connBody" class="mono" style="margin-top:8px"></div>
      </div>
      <div class="card" id="agent" style="grid-column: span 2">
        <div class="muted">Agent Q&A</div>
        <div class="flex" style="margin-top:8px">
          <input id="agentq" placeholder="Ask about the stock (e.g., Why did AAPL move?)" style="flex:1" />
          <button id="ask">Ask</button>
        </div>
        <div class="muted" style="margin-top:6px">
          Examples: "Ingest BEL", "Analyze BEL", "Backtest BEL", "Resolve BEL", "DB stats BEL", "MC insight BEL",
          "Index to RAG for BEL: https://example.com/a https://example.com/b", "Why did BEL move recently?"
        </div>
        <div class="grid-3" style="margin-top:8px">
          <div class="card" style="background:#0e1320">
            <div class="muted">Prompt History</div>
            <div id="historyBox" class="mono" style="margin-top:6px; max-height:200px; overflow:auto; white-space:pre-wrap"></div>
          </div>
          <div class="card" style="background:#0e1320">
            <div class="muted">RAG Q&A (stream)</div>
            <div class="flex" style="margin-top:6px">
              <input id="ragq" placeholder="Ask RAG (uses namespace = symbol)" style="flex:1" />
              <button id="ragAsk">Ask</button>
            </div>
            <div class="muted" style="font-size:12px; margin-top:4px">Use "Index URLs" to add sources first.</div>
            <pre id="ragStream" class="mono" style="white-space:pre-wrap; margin-top:6px"></pre>
          </div>
          <div class="card" style="background:#0e1320">
            <div class="muted">RAG Index URLs</div>
            <textarea id="ragUrls" placeholder="One or more URLs separated by spaces or newlines" style="width:100%; height:96px; background:#0b0f1c; color:#e8edf2; border:1px solid #253149; border-radius:8px; padding:8px"></textarea>
            <button id="ragIndexBtn" style="margin-top:6px">Index URLs to Namespace (symbol)</button>
            <div id="ragIndexStatus" class="muted" style="margin-top:6px"></div>
          </div>
        </div>
        <div class="card" style="background:#0e1320; margin-top:8px">
          <div class="muted">Live Quotes (WebSocket)</div>
          <div class="flex" style="margin-top:6px">
            <input id="wsSymbol" placeholder="Symbol to subscribe (e.g., BEL)" />
            <button id="wsSub">Subscribe</button>
            <button id="wsUnsub">Unsubscribe</button>
          </div>
          <div id="wsStatus" class="muted" style="margin-top:6px"></div>
          <div id="wsQuotes" class="mono" style="margin-top:6px; max-height:160px; overflow:auto; white-space:pre-wrap"></div>
        </div>
        <pre class="mono" id="agentAnswer" style="white-space:pre-wrap; margin-top:8px"></pre>
      </div>
    </div>
  </div>
`;
// Normalize any garbled placeholder text in the stock select
const _ph = document.querySelector('#stockSelect option[disabled]') as HTMLOptionElement | null;
if (_ph) { _ph.textContent = 'Select a stock'; }

// Kick off market overview immediately on app load
renderMarketOverview().catch(()=>{});

// Theme toggle (light/dark) using CSS variables on :root
(function initThemeToggle(){
  const btn = document.getElementById('themeToggle');
  const key = 'app-theme';
  function apply(mode: 'light'|'dark') {
    document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
  }
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') {
      apply(saved as any);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      apply(prefersDark ? 'dark' : 'light');
    }
  } catch {}
  btn?.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    apply(next as any);
    try { localStorage.setItem(key, next); } catch {}
  });
})();

// Small debouncer for connectivity checks
function scheduleConnectivity(symbol: string, delayMs=800) {
  const key = '_connTimer' as any;
  const w = (window as any);
  if (w[key]) clearTimeout(w[key]);
  w[key] = setTimeout(()=>{ renderConnectivity(symbol).catch(()=>{}); }, delayMs);
}

async function onIngest() {
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!symbol) return;
  const statusEl = document.getElementById('status')!;
  statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Ingesting ${symbol}...</div>`;
  try {
    const res = await api.ingest(symbol);
    const msgs: string[] = (res.messages || []) as any;
    const list = msgs.length ? `<ul>${msgs.map(m=>`<li>${m}</li>`).join('')}</ul>` : '';
    statusEl.innerHTML = `
      <div class="muted">Status</div>
      <div class="mono" style="margin-top:8px">Ingested ${symbol} (prices: ${res.insertedPrices}, news: ${res.insertedNews})</div>
      <div class="muted">Price: <span class="mono">${res.priceSource || res.alphaSource || 'unknown'}</span>, NewsAPI: <span class="mono">${res.newsSource || 'unknown'}</span></div>
      ${list}
    `;
    await refresh(symbol);
  } catch (e:any) {
    // Try to parse JSON error message
    try {
      const msg = e.message;
      const json = JSON.parse(msg);
      const text = json?.error || msg;
      statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px; color:#ff6b6b">Error: ${text}</div>`;
    } catch {
      statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px; color:#ff6b6b">Error: ${e.message || e}</div>`;
    }
  }
}

async function onAnalyze() {
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!symbol) return;
  const res = await api.analyze(symbol);
  (document.getElementById('sentiment')!).innerHTML = `
    <div class="grid-3">
      <div><div class="muted">Sentiment</div><div class="stat">${res.data.sentiment.toFixed(3)}</div></div>
      <div><div class="muted">Predicted Close</div><div class="stat">${res.data.predictedClose.toFixed(2)}</div></div>
      <div><div class="muted">Score</div><div class="stat">${res.data.score} → ${res.data.recommendation}</div></div>
    </div>
  `;
  try { await renderYahooForSymbol(symbol); } catch {}
  scheduleConnectivity(symbol, 1000);
}

function renderLineChart(points: Array<{x: string, y: number}>, opts: { w?: number, h?: number, volumes?: number[] } = {}) {
  const w = opts.w ?? 520; const h = opts.h ?? 160; const pad = 30;
  if (!points.length) return '<div class="muted">No data</div>';
  const ys = points.map(p=>Number(p.y));
  const xs = points.map(p=>new Date(p.x).getTime());
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const sx = (t:number)=> pad + (w-2*pad) * ((t - minX)/Math.max(1, (maxX - minX)));
  const sy = (v:number)=> (h-pad) - (h-2*pad) * ((v - minY)/Math.max(1e-9, (maxY - minY)));
  const d = points.map((p,i)=> `${i? 'L':'M'}${sx(new Date(p.x).getTime()).toFixed(1)},${sy(Number(p.y)).toFixed(1)}`).join(' ');
  const last = points[points.length-1];
  const lastX = sx(new Date(last.x).getTime()); const lastY = sy(Number(last.y));
  // Optional volume bars along the bottom background
  let volSvg = '';
  const vols = opts.volumes || [];
  if (vols.length === points.length) {
    const vmax = Math.max(1, ...vols.map(v=>Number(v)||0));
    const barAreaH = 36; const baseY = h - pad;
    const barW = (w - 2*pad) / points.length;
    volSvg = points.map((p, i) => {
      const v = Math.max(0, Number(vols[i]) || 0);
      const bh = (barAreaH * v) / vmax;
      const x = pad + i*barW;
      const date = String(p.x);
      return `<g><title>${date} • Vol ${v.toLocaleString()}</title><rect x="${x.toFixed(1)}" y="${(baseY - bh).toFixed(1)}" width="${Math.max(1, barW-1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#233452"/></g>`;
    }).join('');
  }
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      ${volSvg}
      <path d="${d}" fill="none" stroke="#60a5fa" stroke-width="2"><title>Price trend (close)</title></path>
      <g><title>Last • ${last.y}</title><circle cx="${lastX}" cy="${lastY}" r="3.5" fill="#60a5fa" /></g>
    </svg>`;
}

async function renderMarketOverview() {
  try {
    const [indices, sector, mmi, val] = await Promise.all([
      api.etIndices(), api.etSectorPerformance(), api.tickertapeMmi(), api.marketsMojoValuation()
    ]);
    const card = document.getElementById('marketOverview'); if (!card) return;
    const idx = (indices?.data?.searchresult || indices?.data || []).slice(0, 6);
    const mmiVal = mmi?.data?.mmi?.now?.value ?? mmi?.data?.data?.value ?? '-';
    const meter = (v:number)=>{
      const w=200,h=60; const x=16+(w-32)*(Math.max(0, Math.min(100, Number(v)||0))/100);
      return `<svg width="${w}" height="${h}"><g><title>Market Mood Index ${v}</title><line x1="16" y1="30" x2="${w-16}" y2="30" stroke="#233452" stroke-width="6"/><circle cx="${x}" cy="30" r="7" fill="#4dabf7"/><text x="${w/2}" y="54" text-anchor="middle" fill="#9aa7bd" font-size="11">MMI ${v}</text></g></svg>`;
    };
    const idxCard = (it:any) => {
      const name = it.indexName || it.index_symbol || it.symbol || '-';
      const cur = Number(it.currentIndexValue ?? it.current_value ?? it.value ?? NaN);
      const ch = Number(it.netChange ?? it.changeValue ?? 0);
      const pct = Number(it.perChange ?? it.percentChange ?? 0);
      const adv = Number(it.advances ?? 0), dec = Number(it.declines ?? 0);
      const color = ch>0?'#22c55e':(ch<0?'#ef4444':'#9aa7bd');
      const id = String(it.indexId || it.indexid || '');
      const total = Math.max(1, adv+dec);
      const advPct = Math.round((adv/total)*100);
      const changeMeter = (()=>{
        const w=120,h=8; const mid=w/2; const span=Math.min(w/2, Math.abs(pct)*(w/2)/3); // scale +/-3%
        const x = pct>=0 ? mid : (mid - span);
        return `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#233452"/><rect x="${x}" y="0" width="${span}" height="${h}" rx="4" fill="${color}"/></svg>`;
      })();
      return `<div class="card" style="background:#0e1320">
        <div class="muted">${name}</div>
        <div class="mono" style="margin-top:6px;color:${color}">${isFinite(cur)?cur.toLocaleString():cur} (${ch>=0?'+':''}${ch.toFixed?ch.toFixed(2):ch}, ${pct>=0?'+':''}${pct}%)</div>
        <div class="muted" style="margin-top:6px">Adv: <strong>${adv}</strong> · Dec: <strong>${dec}</strong></div>
        <div class="muted" style="margin-top:6px;display:flex;align-items:center;gap:8px">
          <span>Change</span>${changeMeter}
        </div>
        <div style="margin-top:6px"><div style="height:6px;background:#233452;border-radius:4px;overflow:hidden"><div style="width:${advPct}%;height:6px;background:#22c55e"></div></div></div>
        ${id?`<button class="btn-sm" data-idx="${id}">Constituents</button>`:''}
        <div id="idx-${id}" class="mono" style="margin-top:6px; max-height:180px; overflow:auto"></div>
      </div>`;
    };
    card.innerHTML = `
      <div class="muted">Market Overview</div>
      <div class="grid-3" style="margin-top:8px">
        <div class="card" style="background:#0e1320">
          <div class="muted">Market Mood</div>
          <div style="margin-top:6px">${meter(Number(mmiVal))}</div>
        </div>
        ${idx.map((x:any)=> idxCard(x)).join('')}
      </div>
    `;
    // Append Top Sectors tiles
    try {
      const topSec = (sector?.data?.searchresult || sector?.data || []).slice(0,8);
      const secWrap = document.createElement('div');
      const tiles = topSec.map((s:any)=>{ const n=s.sector_name||s.name||'-'; const p=Number(s.marketcappercentchange??s.percentChange??0); const c=p>0?'#22c55e':(p<0?'#ef4444':'#9aa7bd'); return `<div class="card" style="background:#0e1320"><div class="muted">${n}</div><div class="mono" style="margin-top:6px;color:${c}">${p>=0?'+':''}${p}%</div></div>`; }).join('');
      secWrap.innerHTML = `<div class="muted" style="margin-top:12px">Top Sectors</div><div class="row" style="margin-top:6px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px">${tiles}</div>`;
      card.appendChild(secWrap);
    } catch {}
    // Modal helpers
    function ensureModal(){
      let m = document.getElementById('modalWrap');
      if (!m) {
        m = document.createElement('div');
        m.id = 'modalWrap';
        m.innerHTML = `<div id="modalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:2000"></div>
          <div id="modal" style="position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:2001">
            <div style="background:#0e1320;border:1px solid #233452;border-radius:12px;max-width:800px;width:90%;max-height:80vh;overflow:auto;padding:16px">
              <div id="modalTitle" class="muted"></div>
              <div id="modalBody" class="mono" style="margin-top:8px"></div>
              <div style="text-align:right;margin-top:12px"><button id="modalClose" class="btn-sm">Close</button></div>
            </div>
          </div>`;
        document.body.appendChild(m);
        const hide = ()=>{ (document.getElementById('modal') as HTMLElement).style.display='none'; (document.getElementById('modalBackdrop') as HTMLElement).style.display='none'; };
        document.getElementById('modalClose')?.addEventListener('click', hide);
        document.getElementById('modalBackdrop')?.addEventListener('click', hide);
      }
    }
    function openModal(title: string, html: string){
      ensureModal();
      (document.getElementById('modalTitle') as HTMLElement).textContent = title;
      (document.getElementById('modalBody') as HTMLElement).innerHTML = html;
      (document.getElementById('modalBackdrop') as HTMLElement).style.display='block';
      (document.getElementById('modal') as HTMLElement).style.display='flex';
    }
    // Simple in-memory cache for index constituents
    (window as any)._idxConsCache = (window as any)._idxConsCache || new Map<string, any[]>();
    const consCache: Map<string, any[]> = (window as any)._idxConsCache;

    // Bind constituents buttons (open modal)
    Array.from(card.querySelectorAll('button[data-idx]')).forEach((btn:any)=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-idx')||''; if (!id) return;
        openModal('Constituents', '<div class="muted">Loading...</div>');
        try {
          let items: any[] | undefined = consCache.get(id);
          if (!items) {
            const res = await api.etIndexConstituents(id, 200, 1);
            const arr = res?.data?.searchresult || res?.data?.data || res?.data?.results || [];
            items = (Array.isArray(arr)?arr:[]);
            consCache.set(id, items);
          }
          const nameFor = (r:any)=> r.companyName || r.companyname || r.name || r.symbol || r.ticker || r.secName || '-';
          const chFor = (r:any)=> Number(r.perChange ?? r.percentChange ?? r.chg ?? r.change ?? 0);
          const html = `<ul style="padding-left:16px">${(items||[]).map((r:any)=>{
            const n=nameFor(r); const p=chFor(r); const c=p>0?'#22c55e':(p<0?'#ef4444':'#9aa7bd');
            return `<li>${n} <span style=\"color:${c}\">${p>=0?'+':''}${p}%</span></li>`;
          }).join('')}</ul>`;
          (document.getElementById('modalBody') as HTMLElement).innerHTML = html || '<div class="muted">No data</div>';
        } catch (e:any) {
          (document.getElementById('modalBody') as HTMLElement).innerHTML = `<span class="muted">Failed to load constituents: ${e?.message || e}</span>`;
        }
      });
    });

    // Bind Top Sector tiles to open modal listing related indices -> constituents
    const allIdx: any[] = idx;
    Array.from(document.querySelectorAll('#marketOverview .row .card')).forEach((tile:any)=>{
      const titleEl = tile.querySelector('.muted');
      if (!titleEl) return;
      const nm = String(titleEl.textContent||'Sector').trim();
      tile.style.cursor = 'pointer';
      tile.addEventListener('click', ()=>{
        // Find indices that seem to match the sector name
        const low = nm.toLowerCase();
        const matches = (allIdx||[]).filter((x:any)=> String(x.indexName||x.index_symbol||'').toLowerCase().includes(low));
        if (!matches.length) {
          openModal(nm, '<div class="muted">No direct index found for this sector. Use the Index cards above to view constituents.</div>');
          return;
        }
        const buttons = matches.map((m:any)=>{
          const id = String(m.indexId||m.indexid||'');
          const name = String(m.indexName||m.index_symbol||'-');
          return `<button class=\"btn-sm\" data-modal-idx=\"${id}\">${name}</button>`;
        }).join(' ');
        openModal(nm, `<div class=\"muted\">Select an index</div><div style=\"margin-top:8px;display:flex;flex-wrap:wrap;gap:8px\">${buttons}</div><div id=\"modalList\" style=\"margin-top:12px\"></div>`);
        Array.from(document.querySelectorAll('button[data-modal-idx]')).forEach((b:any)=>{
          b.addEventListener('click', async ()=>{
            const id = b.getAttribute('data-modal-idx')||''; if (!id) return;
            (document.getElementById('modalList') as HTMLElement).innerHTML = '<div class="muted">Loading constituents...</div>';
            try {
              let items: any[] | undefined = consCache.get(id);
              if (!items) {
                const res = await api.etIndexConstituents(id, 200, 1);
                const arr = res?.data?.searchresult || res?.data?.data || res?.data?.results || [];
                items = (Array.isArray(arr)?arr:[]);
                consCache.set(id, items);
              }
              const nameFor = (r:any)=> r.companyName || r.companyname || r.name || r.symbol || r.ticker || r.secName || '-';
              const chFor = (r:any)=> Number(r.perChange ?? r.percentChange ?? r.chg ?? r.change ?? 0);
              const html = `<ul style=\"padding-left:16px\">${(items||[]).map((r:any)=>{ const n=nameFor(r); const p=chFor(r); const c=p>0?'#22c55e':(p<0?'#ef4444':'#9aa7bd'); return `<li>${n} <span style=\\\"color:${c}\\\">${p>=0?'+':''}${p}%</span></li>`; }).join('')}</ul>`;
              (document.getElementById('modalList') as HTMLElement).innerHTML = html || '<div class="muted">No data</div>';
            } catch (e:any) {
              (document.getElementById('modalList') as HTMLElement).innerHTML = `<span class=\"muted\">Failed to load constituents: ${e?.message || e}</span>`;
            }
          });
        });
      });
    });
  } catch {}
}

async function renderMcQuick(symbol: string) {
  const card = document.getElementById('mcquick'); if (!card) return;
  card.innerHTML = `<div class="muted">MC Quick</div><div class="mono" style="margin-top:6px">Loading...</div>`;
  try {
    const res = await api.mcQuick(symbol);
    const d = (res?.data)||{}; const fc = d?.forecast?.summary || d?.forecast || {};
    const rsi = d?.rsi || {};
    const bar = (v:number)=>{
      const pct = Math.max(0, Math.min(100, Number(v)||0));
      return `<div style="height:8px;background:#233452;border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:8px;background:#4dabf7"></div></div>`;
    };
    const rBox = (lab:string, obj:any)=> obj? `<div class="card" style="background:#0e1320">
      <div class="muted">RSI ${lab}</div>
      <div class="mono" style="margin-top:6px">${Number(obj?.RSI?.value ?? obj?.value ?? NaN).toFixed(2)}</div>
      <div style="margin-top:6px">${bar(Number(obj?.RSI?.value ?? obj?.value ?? 0))}</div>
    </div>`:'';
    const fBox = fc && (fc?.buy || fc?.sell || fc?.hold) ? `<div class="card" style="background:#0e1320">
      <div class="muted">Forecast</div>
      <div class="mono" style="margin-top:6px">Buy: ${fc.buy ?? '-'}, Hold: ${fc.hold ?? '-'}, Sell: ${fc.sell ?? '-'}</div>
    </div>`:'';
    card.innerHTML = `
      <div class="muted">MC Quick</div>
      <div class="grid-3" style="margin-top:6px">${rBox('D', rsi?.D)}${rBox('W', rsi?.W)}${rBox('M', rsi?.M)}</div>
      ${fBox}
    `;
  } catch {
    card.innerHTML = `<div class=\"muted\">MC Quick</div><div class=\"mono\" style=\"margin-top:6px\">No data</div>`;
  }
}

function renderSentimentPie(pos: number, neu: number, neg: number) {
  const total = Math.max(1, pos + neu + neg);
  const pct = (v:number)=> (v/total) * Math.PI * 2;
  const slices = [
    { label:'Positive', v: pos, color:'#22c55e' },
    { label:'Neutral', v: neu, color:'#9aa7bd' },
    { label:'Negative', v: neg, color:'#ef4444' }
  ];
  let start = -Math.PI / 2;
  const cx = 70, cy = 70, r = 48;
  const arc = (sx:number, sy:number, ex:number, ey:number, large:number, color:string)=>
    `<path d="M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z" fill="${color}"/>`;
  const parts: string[] = [];
  for (const s of slices) {
    const ang = pct(s.v);
    const end = start + ang;
    const sx = cx + r*Math.cos(start), sy = cy + r*Math.sin(start);
    const ex = cx + r*Math.cos(end),   ey = cy + r*Math.sin(end);
    const large = ang > Math.PI ? 1 : 0;
    parts.push(`<g><title>${s.label}: ${s.v}</title>${arc(sx, sy, ex, ey, large, s.color)}</g>`);
    start = end;
  }
  return `<div class="flex" style="gap:12px;align-items:center">
    <svg width="140" height="140" viewBox="0 0 140 140">${parts.join('')}</svg>
    <div class="mono" style="font-size:12px">
      <div style="color:#22c55e">Positive: ${pos}</div>
      <div style="color:#9aa7bd">Neutral: ${neu}</div>
      <div style="color:#ef4444">Negative: ${neg}</div>
    </div>
  </div>`;
}

async function refresh(symbol: string) {
  try {
    const ov = await api.overview(symbol);
    (document.getElementById('overview')!).innerHTML = `
      <div class="grid-3">
        <div><div class="muted">Symbol</div><div class="stat">${ov.data.symbol}</div></div>
        <div><div class="muted">Last Close</div><div class="stat">${ov.data.lastClose.toFixed(2)}</div></div>
        <div><div class="muted">Period Change</div><div class="stat">${ov.data.periodChangePct.toFixed(2)}%</div></div>
      </div>
    `;
    const hist = await api.history(symbol);
    const allPoints = hist.data.map((p:any)=>({x: p.date, y: p.close}));
    const allVols = hist.data.map((p:any)=> Number(p.volume||0));
    (window as any)._histCache = { symbol, points: allPoints, vols: allVols };
    const tfKey = localStorage.getItem('histTF') || '1Y';
    renderHistoryWithTf(tfKey);
    const news = await api.news(symbol);
    const sCounts = (()=>{
      let pos=0, neu=0, neg=0;
      for (const n of news.data||[]) {
        const s = Number(n.sentiment);
        if (isFinite(s)) { if (s > 0.2) pos++; else if (s < -0.2) neg++; else neu++; } else neu++;
      }
      return { pos, neu, neg };
    })();
    (document.getElementById('news')!).innerHTML = `
      <div class="muted">Latest News</div>
      <div style="margin-top:6px">${renderSentimentPie(sCounts.pos, sCounts.neu, sCounts.neg)}</div>
      <ul>${
        news.data.map((n:any)=>`<li><a href="${n.url}" target="_blank">${n.title}</a> — <span class="muted">${new Date(n.date).toLocaleString()}</span><br/><span class="muted">${n.summary}</span></li>`).join('')
      }</ul>
      <div class="muted">Tip: use the Agent panel to ask RAG-aware questions.</div>
    `;
    // Clear DB stats panel when symbol changes
    (document.getElementById('dbstats')!).innerHTML = `<div class="muted">DB Data</div>`;
    // Clear sentiment and status panels before analyze
    (document.getElementById('sentiment')!).innerHTML = `<div class="muted">Sentiment & Recommendation</div>`;
    // Load MC Insight
    try {
      const mci = await api.mcInsight(symbol);
      const d = mci.data || {};
      const score = (d.stockScore != null) ? ` (Score: ${d.stockScore})` : '';
      (document.getElementById('mcinsight')!).innerHTML = `
        <div class="muted">MC Insight</div>
        <div class="mono" style="margin-top:8px">${d.shortDesc || '-'}</div>
        <div class="muted" style="margin-top:6px">${d.longDesc || ''}${score}</div>
      `;
    } catch {
      (document.getElementById('mcinsight')!).innerHTML = `<div class=\"muted\">MC Insight</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
    }
    // Load MC Technicals (D/W/M)
    try {
      const [td, tw, tm] = await Promise.all([
        api.mcTech(symbol, 'D'), api.mcTech(symbol, 'W'), api.mcTech(symbol, 'M')
      ]);
      const card = document.getElementById('mctech')!;
      const fmt = (x: any) => x==null?'-':String(x);
      const num = (x:any)=>{ const n=Number(x); return isFinite(n)?n:NaN; };
      const pick = (resp:any, id:string)=>{
        const arr = (resp?.data?.indicators||[]) as any[]; return arr.find(x=>String(x.id).toLowerCase()===id);
      };
      const piv = (resp:any)=>{
        const arr = (resp?.data?.pivotLevels||[]) as any[]; return arr.find((p:any)=>String(p.key).toLowerCase()==='classic')?.pivotLevel || {};
      };
      const svgFor = (label:string, resp:any)=>{
        const d = resp?.data||{};
        const pv = piv(resp);
        const low = Math.min(num(d.low), num(pv.s3), num(pv.s2), num(pv.s1));
        const high = Math.max(num(d.high), num(pv.r1), num(pv.r2), num(pv.r3));
        const min = isFinite(low)?low:0, max = isFinite(high)?high:1; const w=300, h=150, pad=30;
        const x = (v:number)=> pad + (w-2*pad) * ((v-min)/(max-min||1));
        const yMid = h/2;
        const line = (x1:number,y1:number,x2:number,y2:number,cls:string)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" stroke-width="2"/>`;
        const tick = (val:number, name:string, color:string)=>{
          const xi = x(val); return `
            <line x1="${xi}" y1="${yMid-25}" x2="${xi}" y2="${yMid+25}" stroke="${color}" stroke-width="2"/>
            <text x="${xi}" y="${yMid-30}" fill="${color}" font-size="10" text-anchor="middle">${name}</text>
            <text x="${xi}" y="${yMid+38}" fill="${color}" font-size="10" text-anchor="middle">${val.toFixed(2)}</text>`;
        };
        const close = num(d.close);
        const axis = line(pad,yMid,w-pad,yMid,'axis');
        const parts = [
          axis,
          isFinite(num(pv.s3))?tick(num(pv.s3),'S3','#ff6b6b'):'' ,
          isFinite(num(pv.s2))?tick(num(pv.s2),'S2','#ff8f6b'):'',
          isFinite(num(pv.s1))?tick(num(pv.s1),'S1','#ffb36b'):'',
          isFinite(num(pv.pivotPoint))?tick(num(pv.pivotPoint),'P','#9ad'):'',
          isFinite(num(pv.r1))?tick(num(pv.r1),'R1','#6bd28f'):'',
          isFinite(num(pv.r2))?tick(num(pv.r2),'R2','#53c27f'):'',
          isFinite(num(pv.r3))?tick(num(pv.r3),'R3','#3bb26f'):'',
          isFinite(close)?`<circle cx="${x(close)}" cy="${yMid}" r="5" fill="#ffd166" />
            <text x="${x(close)}" y="${yMid+55}" fill="#ffd166" font-size="10" text-anchor="middle">Close ${close.toFixed(2)}</text>`:''
        ].join('');
        // RSI gauge
        const rsi = Number(pick(resp,'rsi')?.value);
        const rsiY = h-28; const rsiW = w-2*pad;
        const rsiBar = isFinite(rsi)?`
          <rect x="${pad}" y="${rsiY}" width="${rsiW}" height="8" fill="#253149" rx="4"/>
          <rect x="${pad}" y="${rsiY}" width="${rsiW*(rsi/100)}" height="8" fill="#4dabf7" rx="4"/>
          <text x="${pad+rsiW/2}" y="${rsiY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">RSI ${rsi.toFixed(2)}</text>`:'';
        // MACD histogram (centered bar)
        const macdVal = Number(pick(resp,'macd')?.value);
        const macdY = h-14; const macdW = rsiW; const macdCenter = pad + macdW/2; const macdScale = 20; // cap at +/-20
        const macdPx = isFinite(macdVal) ? (macdW/2) * Math.min(1, Math.abs(macdVal)/macdScale) : 0;
        const macdColor = (macdVal||0) >= 0 ? '#6bd28f' : '#ff6b6b';
        const macdBar = isFinite(macdVal)?`
          <rect x="${pad}" y="${macdY}" width="${macdW}" height="8" fill="#253149" rx="4"/>
          <rect x="${macdCenter - macdPx}" y="${macdY}" width="${2*macdPx}" height="8" fill="${macdColor}" rx="4"/>
          <text x="${pad+macdW/2}" y="${macdY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">MACD ${macdVal.toFixed(2)}</text>`:'';
        // SMA/EMA compact table
        const sma = Array.isArray(d.sma)? d.sma : [];
        const ema = Array.isArray(d.ema)? d.ema : [];
        const sMap: any = {}; sma.forEach((s:any)=> sMap[String(s.key)] = s);
        const eMap: any = {}; ema.forEach((s:any)=> eMap[String(s.key)] = s);
        const keys = Array.from(new Set([...sma.map((s:any)=>String(s.key)), ...ema.map((s:any)=>String(s.key))])).sort((a,b)=> Number(a)-Number(b));
        const col = (ind?: string)=> ind && /^bull/i.test(ind) ? '#6bd28f' : ind && /^bear/i.test(ind) ? '#ff6b6b' : '#9aa7bd';
        const table = `
          <table class="mono" style="font-size:11px;margin-top:6px;border-collapse:collapse;width:100%">
            <thead><tr><th style="text-align:left;color:#9aa7bd">K</th><th style="text-align:left;color:#9aa7bd">SMA</th><th style="text-align:left;color:#9aa7bd">EMA</th></tr></thead>
            <tbody>
              ${keys.map((k:any)=>{
                const s = sMap[k]; const e = eMap[k];
                return `<tr>
                  <td style="padding:2px 6px;color:#9aa7bd">${k}</td>
                  <td style="padding:2px 6px;color:${col(s?.indication)}" title="SMA ${k}: ${s?.value ?? '-'}${s?.indication?` (${s.indication})`:''}">${s?.value ?? '-'}</td>
                  <td style="padding:2px 6px;color:${col(e?.indication)}" title="EMA ${k}: ${e?.value ?? '-'}${e?.indication?` (${e.indication})`:''}">${e?.value ?? '-'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
        return `
          <div class="card" style="background:#0e1320">
            <div class="muted">${label} — ${fmt(d?.sentiments?.indication)}</div>
            <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
              <style>.axis{stroke:#9aa7bd}</style>
              ${parts}
              ${rsiBar}
              ${macdBar}
            </svg>
            ${table}
          </div>`;
      };
      card.innerHTML = `
        <div class="muted">MC Technicals</div>
        <div class="tech-grid" style="margin-top:8px">
          ${svgFor('Daily', td)}
          ${svgFor('Weekly', tw)}
          ${svgFor('Monthly', tm)}
        </div>
      `;
    } catch {
      (document.getElementById('mctech')!).innerHTML = `<div class=\"muted\">MC Technicals</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
    }
    // Moneycontrol Quick bundle
    try { await renderMcQuick(symbol); } catch {}
    // Trendlyne Advanced Technicals & Derivatives
    try {
      const adv = await api.tlAdvTechBySymbol(symbol);
      const advCard = document.getElementById('tlAdv');
      if (advCard) {
        const a = adv?.data || {};
        const ind = a?.adv?.indicators || a?.adv || {};
        const keys = Object.keys(ind).slice(0,6);
        advCard.innerHTML = `<div class="muted">Trendlyne Advanced Technicals</div>
          <ul class="mono" style="margin-top:6px; padding-left:16px">${keys.map(k=>`<li>${k}: ${typeof ind[k]==='object'? (ind[k]?.signal || ind[k]?.score || JSON.stringify(ind[k])) : ind[k]}</li>`).join('')}</ul>`;
      }
      const today = new Date(); const y=today.getFullYear(); const m=String(today.getMonth()+1).padStart(2,'0'); const d=String(today.getDate()).padStart(2,'0');
      const dateKey = `${y}-${m}-${d}`;
      const deriv = await api.tlDerivatives(dateKey);
      const dvCard = document.getElementById('tlDeriv');
      if (dvCard) {
        const hm = deriv?.data?.heatmap || deriv?.data || {};
        const items = (hm?.data || hm?.results || []).slice(0,8);
        dvCard.innerHTML = `<div class="muted">Derivatives Heatmap (near)</div>
          <ul class="mono" style="margin-top:6px; padding-left:16px">${items.map((x:any)=>`<li>${x.symbol || x.ticker || x.name || '-'} <span class=muted>${x.change || x.pChange || ''}</span></li>`).join('')}</ul>`;
      }
    } catch {}
    (document.getElementById('status')!).innerHTML = `<div class="muted">Status</div>`;
  } catch (e:any) {
    (document.getElementById('overview')!).innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

function filterByTf(points: Array<{x:string,y:number}>, vols: number[], tf: '1M'|'3M'|'6M'|'1Y'|'ALL') {
  if (tf === 'ALL') return { pts: points, v: vols };
  const now = new Date();
  const ms = tf==='1M' ? 30*24*3600*1000 : tf==='3M' ? 90*24*3600*1000 : tf==='6M' ? 180*24*3600*1000 : 365*24*3600*1000;
  const cutoff = now.getTime() - ms;
  const outPts: any[] = []; const outV: number[] = [];
  for (let i=0;i<points.length;i++) {
    const t = new Date(points[i].x).getTime();
    if (t >= cutoff) { outPts.push(points[i]); outV.push(vols[i] ?? 0); }
  }
  return { pts: outPts, v: outV };
}

function renderHistoryWithTf(tf: string) {
  const hc = (window as any)._histCache || {};
  const container = document.getElementById('history'); if (!container) return;
  const tfNorm = (String(tf || '1Y').toUpperCase() as any);
  const { pts, v } = filterByTf(hc.points||[], hc.vols||[], tfNorm);
  const btn = (k:string,label:string)=>`<button class="btn-sm" data-tf="${k}" style="${tfNorm===k?'border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,0.15) inset':''}">${label}</button>`;
  container.innerHTML = `
    <div class="muted">Price History</div>
    <div class="flex" style="gap:6px; margin-top:6px">${btn('1M','1M')}${btn('3M','3M')}${btn('6M','6M')}${btn('1Y','1Y')}${btn('ALL','All')}</div>
    <div style="margin-top:8px">${renderLineChart(pts, { volumes: v })}</div>
    <div class="muted" style="font-size:11px;margin-top:4px">
      <span style="display:inline-flex;align-items:center;gap:6px;margin-right:12px"><span style="display:inline-block;width:10px;height:10px;background:#60a5fa;border-radius:2px"></span>Price</span>
      <span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;background:#233452;border-radius:2px"></span>Volume</span>
    </div>
  `;
  Array.from(container.querySelectorAll('button[data-tf]')).forEach((el:any)=>{
    el.addEventListener('click', ()=>{ const k = el.getAttribute('data-tf')||'1Y'; localStorage.setItem('histTF', k); renderHistoryWithTf(k); });
  });
}

// Ingest/Analyze are triggered automatically on stock selection
// Persist selection whenever dropdown changes (in addition to populateDropdown handler)
document.getElementById('stockSelect')?.addEventListener('change', ()=>{
  try {
    const sel = document.getElementById('stockSelect') as HTMLSelectElement;
    if (sel?.value) localStorage.setItem('selectedSymbol', sel.value);
  } catch {}
});
const historyBox = document.getElementById('historyBox')!;
function appendHistory(q: string, a: string) {
  const prev = historyBox.textContent || '';
  const line = `> ${q}\n${a}\n\n`;
  historyBox.textContent = prev + line;
  historyBox.scrollTop = historyBox.scrollHeight;
}

document.getElementById('ask')!.addEventListener('click', async ()=>{
  const q = (document.getElementById('agentq') as HTMLInputElement).value;
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  // Quick prompt-level WS subscribe/unsubscribe
  const low = q.toLowerCase();
  if (/^subscribe\s+/.test(low)) {
    const parts = q.split(/\s+/); const s = (parts[1]||symbol).toUpperCase();
    if (s) { const w=ensureWs(); w!.send(JSON.stringify({ type:'subscribe', symbol: s })); appendHistory(q, `Subscribed ${s}`); }
  } else if (/^unsubscribe\s+/.test(low)) {
    const parts = q.split(/\s+/); const s = (parts[1]||symbol).toUpperCase();
    if (s && ws) { ws.send(JSON.stringify({ type:'unsubscribe', symbol: s })); appendHistory(q, `Unsubscribed ${s}`); }
  }
  const res = await api.agent(q, symbol);
  (document.getElementById('agentAnswer')!).textContent = res.answer;
  appendHistory(q, res.answer || '');
});

// Chat: streaming agent answer
// Simple second input path: if user types 'chat: ...' send via SSE
document.getElementById('agentq')!.addEventListener('keydown', async (ev:any)=>{
  if (ev.key === 'Enter' && ev.ctrlKey) {
    const inp = ev.target as HTMLInputElement;
    const q = inp.value;
    const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
    const out = document.getElementById('agentAnswer')!;
    out.textContent = '';
    try {
      const resp = await api.agentStream(q, symbol);
      const reader = (resp.body as any).getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const p of parts) {
          const line = p.trim(); if (!line) continue;
          const evMatch = line.match(/^event: (\w+)/); const dataMatch = line.match(/data: (.*)$/m);
          if (!evMatch || !dataMatch) continue; const evName = evMatch[1]; const data = JSON.parse(dataMatch[1]);
          if (evName === 'chunk') { out.textContent += String(data); acc += String(data); }
          if (evName === 'done') { appendHistory(q, acc); }
        }
      }
    } catch (e:any) {
      out.textContent = `Error: ${e.message}`;
    }
  }
});

// RAG streaming Q&A
document.getElementById('ragAsk')!.addEventListener('click', async ()=>{
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  const q = (document.getElementById('ragq') as HTMLInputElement).value;
  if (!symbol || !q) return;
  const out = document.getElementById('ragStream')!;
  out.textContent = '';
  const resp = await api.ragStream(symbol, q, 5);
  const reader = (resp.body as any).getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const p of parts) {
      const line = p.trim();
      if (!line) continue;
      const evMatch = line.match(/^event: (\w+)/);
      const dataMatch = line.match(/data: (.*)$/m);
      if (evMatch && dataMatch) {
        const ev = evMatch[1];
        const data = JSON.parse(dataMatch[1]);
        if (ev === 'answer') {
          out.textContent += String(data || '');
        }
        if (ev === 'sources') {
          out.textContent += `Sources loaded (k=${data.length}).\n`;
        }
      }
    }
  }
});

// RAG index URLs
document.getElementById('ragIndexBtn')!.addEventListener('click', async ()=>{
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!symbol) return;
  const txt = (document.getElementById('ragUrls') as HTMLTextAreaElement).value;
  const urls = txt.split(/\s+/).map(s=>s.trim()).filter(Boolean);
  const status = document.getElementById('ragIndexStatus')!;
  status.textContent = 'Indexing...';
  try {
    const res = await api.ragIndex(symbol, urls);
    status.textContent = `Indexed ${res.added} chunk(s)`;
  } catch (e:any) {
    status.textContent = `Error: ${e.message}`;
  }
});

// Live WS quotes via prompt
let ws: WebSocket | null = null;
const quotes = new Map<string,{price:number,time:string}>();
function ensureWs() {
  if (ws && ws.readyState === 1) return ws;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Point to same host; Vite dev server proxies /ws to backend
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  const status = document.getElementById('wsStatus')!;
  const box = document.getElementById('wsQuotes')!;
  ws.onopen = ()=>{ status.textContent = 'Connected'; };
  ws.onclose = ()=>{ status.textContent = 'Closed'; };
  ws.onerror = ()=>{ status.textContent = 'Error'; };
  ws.onmessage = (ev)=>{
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === 'quote') {
        quotes.set(msg.symbol, { price: msg.price, time: msg.time });
        box.textContent = Array.from(quotes.entries()).map(([s,v])=>`${s}: ${v.price} @ ${v.time}`).join('\n');
      }
    } catch {}
  };
  return ws;
}
document.getElementById('wsSub')!.addEventListener('click', ()=>{
  const s = (document.getElementById('wsSymbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!s) return; const w = ensureWs(); w!.send(JSON.stringify({ type:'subscribe', symbol: s }));
});
document.getElementById('wsUnsub')!.addEventListener('click', ()=>{
  const s = (document.getElementById('wsSymbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!s || !ws) return; ws.send(JSON.stringify({ type:'unsubscribe', symbol: s }));
});

document.getElementById('dbstatsBtn')!.addEventListener('click', async ()=>{
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!symbol) return;
  try {
    const res = await api.dbstats?.(symbol) || await (api as any).dbStats(symbol);
    const d = res.data;
    (document.getElementById('dbstats')!).innerHTML = `
      <div class="muted">DB Data for <span class="mono">${d.symbol}</span></div>
      <div class="grid-3" style="margin-top:8px">
        <div class="card" style="background:#0e1320">
          <div class="muted">Prices</div>
          <div class="stat">${d.prices.count}</div>
          <div class="muted">${d.prices.firstDate || '-'} → ${d.prices.lastDate || '-'}</div>
        </div>
        <div class="card" style="background:#0e1320">
          <div class="muted">News</div>
          <div class="stat">${d.news.count}</div>
          <div class="muted">${d.news.firstDate || '-'} → ${d.news.lastDate || '-'}</div>
        </div>
        <div class="card" style="background:#0e1320">
          <div class="muted">Docs</div>
          <div class="stat">${d.docs.count}</div>
          <div class="muted">chunks indexed</div>
        </div>
      </div>
      <div class="muted" style="margin-top:8px">Analyses stored: <span class="mono">${d.analyses.count}</span></div>
    `;
  } catch (e:any) {
    (document.getElementById('dbstats')!).innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
});

// Connectivity diagnostics
async function renderConnectivity(symbol?: string) {
  const out = document.getElementById('connBody')!;
  const sym = (symbol || (document.getElementById('symbol') as HTMLInputElement)?.value || '').trim().toUpperCase() || 'BEL.NS';
  const items: Array<{name:string, run: ()=>Promise<any>}> = [
    { name: 'ET Indices', run: ()=> api.etIndices() },
    { name: 'ET Sector Performance', run: ()=> api.etSectorPerformance() },
    { name: 'TickerTape MMI', run: ()=> api.tickertapeMmi() },
    { name: 'MarketsMojo Valuation', run: ()=> api.marketsMojoValuation() },
    { name: 'MC Quick', run: ()=> api.mcQuick(sym) },
    { name: 'Trendlyne Adv Tech', run: ()=> api.tlAdvTechBySymbol(sym) },
  ];
  out.innerHTML = `<div class="muted">Checking with symbol <span class="mono">${sym}</span>...</div>`;
  const rows: string[] = [];
  for (const it of items) {
    const t0 = performance.now();
    try {
      await it.run();
      const ms = Math.round(performance.now() - t0);
      rows.push(`<tr><td>${it.name}</td><td style="color:#16a34a">OK</td><td class="muted">${ms} ms</td></tr>`);
    } catch (e:any) {
      const ms = Math.round(performance.now() - t0);
      rows.push(`<tr><td>${it.name}</td><td style="color:#ef4444">FAIL</td><td class="muted">${ms} ms</td></tr>`);
    }
  }
  out.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr><th style="text-align:left">Endpoint</th><th style="text-align:left">Status</th><th style="text-align:left">Time</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

document.getElementById('connRun')!.addEventListener('click', async ()=>{
  try { await renderConnectivity(); } catch {}
});

// Yahoo full data fetch and render
// Helper to collect Yahoo controls and persist to localStorage
function collectYahooOptions() {
  const range = (document.getElementById('ydRange') as HTMLSelectElement)?.value || '1y';
  const interval = (document.getElementById('ydInterval') as HTMLSelectElement)?.value || '1d';
  const ids = [
    'price','summaryDetail','assetProfile','financialData','defaultKeyStatistics','earnings','calendarEvents',
    'recommendationTrend','secFilings','incomeStatementHistory'
  ];
  const mods = ids.filter(k => (document.getElementById('ydm_'+k) as HTMLInputElement)?.checked);
  // Persist
  try { localStorage.setItem('ydRange', range); } catch {}
  try { localStorage.setItem('ydInterval', interval); } catch {}
  try { localStorage.setItem('ydModules', mods.join(',')); } catch {}
  return { range, interval, modules: mods.join(',') };
}

async function renderYahooForSymbol(symbol: string) {
  const body = document.getElementById('yahooDataBody')!;
  body.innerHTML = `<div class="mono" style="margin-top:8px">Loading...</div>`;
  const { range, interval, modules } = collectYahooOptions();
  try {
    const res = await api.yahooFull(symbol, range, interval, modules);
    const d = res.data || {};
    const q = d.quote || {};
    const chart = d.chart || {};
    const summary = d.summary || {};
    const closes: number[] = (chart?.indicators?.quote?.[0]?.close || []).filter((x:any)=>Number.isFinite(x));
    const ts: number[] = chart?.timestamp || [];
    // Sparkline
    let spark = '<div class="muted" style="margin-top:6px">No chart</div>';
    if (closes.length && ts.length) {
      const w=500, h=120, pad=20;
      const min = Math.min(...closes), max = Math.max(...closes);
      const x = (i:number)=> pad + (w-2*pad) * (i/(closes.length-1));
      const y = (v:number)=> pad + (h-2*pad) * (1- (v-min)/(max-min||1));
      const lastIdx = closes.length-1;
      const minIdx = closes.indexOf(min);
      const maxIdx = closes.indexOf(max);
      const linePts = closes.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const mk = (i:number, color:string, label:string)=> `<g><title>${label}: ${closes[i]?.toFixed(2)} @ ${new Date((ts[i]||0)*1000).toLocaleString()}</title><circle cx="${x(i).toFixed(1)}" cy="${y(closes[i]).toFixed(1)}" r="2.8" fill="${color}"/></g>`;
      spark = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <polyline fill="none" stroke="#4dabf7" stroke-width="2" points="${linePts}"/>
        ${mk(0,'#9aa7bd','First')}
        ${mk(minIdx,'#ef4444','Min')}
        ${mk(maxIdx,'#22c55e','Max')}
        ${mk(lastIdx,'#ffd166','Last')}
        <text x="${w-4}" y="${pad}" text-anchor="end" fill="#9aa7bd" font-size="10">${range} close</text>
      </svg>`;
    }
    const sres = Array.isArray(summary?.result) ? summary.result[0] : {} as any;
    const price = sres?.price || {};
    const details = sres?.summaryDetail || {};
    const profile = sres?.assetProfile || {};
    const stats = sres?.defaultKeyStatistics || {};
    const fin = sres?.financialData || {};
    const rec = sres?.recommendationTrend || sres?.recommendationTrendHistory || {};
    const earningsMod = sres?.earnings || {};
    const detailJson = (()=>{ try { return JSON.stringify(sres, null, 2); } catch { return ''; } })();
    const toMillions = (n:any)=>{ const v=Number(n); if(!isFinite(v)) return '-'; return (v/1e6).toFixed(1)+'M'; };
    const fmtNum = (n:any)=> Number.isFinite(Number(n)) ? Number(n).toLocaleString() : String(n ?? '-');
    const renderRecChart = () => {
      const trend = Array.isArray(rec?.trend) ? rec.trend : [];
      if (!trend.length) return '';
      const w=520,h=140,pad=30; const cats=['strongBuy','buy','hold','sell','strongSell']; const colors=['#1b9e77','#66a61e','#9aa7bd','#e6ab02','#d95f02'];
      const max = Math.max(1, ...trend.map((t:any)=> cats.reduce((s,c)=> s + Number(t[c]||0), 0)));
      const barW = (w-2*pad)/trend.length * 0.7; const gap = (w-2*pad)/trend.length * 0.3;
      let x=pad;
      const bars = trend.map((t:any)=>{
        let y=h-pad; const total = cats.reduce((s,c)=> s + Number(t[c]||0), 0);
        const pieces = cats.map((c,idx)=>{ const v=Number(t[c]||0); const hgt = ((h-2*pad) * v)/max; y -= hgt; const rect = `<rect x="${x}" y="${y}" width="${barW}" height="${hgt}" fill="${colors[idx]}"/>`; return rect; }).join('');
        const label = `<text x="${x+barW/2}" y="${h-8}" font-size="10" text-anchor="middle" fill="#9aa7bd">${t.period || ''}</text>`;
        const g = `<g>${pieces}${label}</g>`; x += barW + gap; return g;
      }).join('');
      const legend = cats.map((c,i)=> `<rect x="${pad + i*95}" y="10" width="10" height="10" fill="${colors[i]}"/><text x="${pad + i*95 + 14}" y="19" fill="#9aa7bd" font-size="10">${c}</text>`).join('');
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>${legend}${bars}</svg>`;
    };
    const renderEarnings = () => {
      const fc = earningsMod?.financialsChart || {};
      const yr = Array.isArray(fc?.yearly) ? fc.yearly : [];
      if (!yr.length) return '';
      const w=520,h=160,pad=30; const max = Math.max(1, ...yr.flatMap((y:any)=> [Number(y.revenue?.raw||y.revenue||0), Number(y.earnings?.raw||y.earnings||0)]));
      const barW = (w-2*pad)/(yr.length*2+ (yr.length-1)) ;
      let x=pad;
      const bars = yr.map((yrow:any)=>{
        const rev = Number(yrow.revenue?.raw || yrow.revenue || 0); const ear = Number(yrow.earnings?.raw || yrow.earnings || 0);
        const revH = ((h-2*pad) * rev)/max; const earH = ((h-2*pad) * ear)/max; const base = h-pad;
        const g = `<g>
          <rect x="${x}" y="${base-revH}" width="${barW}" height="${revH}" fill="#4dabf7"/>
          <rect x="${x+barW+4}" y="${base-earH}" width="${barW}" height="${earH}" fill="#6bd28f"/>
          <text x="${x+barW}" y="${h-8}" text-anchor="middle" fill="#9aa7bd" font-size="10">${yrow?.date || yrow?.year || ''}</text>
        </g>`; x += barW*2 + 12; return g;
      }).join('');
      const legend = `<rect x="${pad}" y="10" width="10" height="10" fill="#4dabf7"/><text x="${pad+14}" y="19" fill="#9aa7bd" font-size="10">Revenue</text>
        <rect x="${pad+90}" y="10" width="10" height="10" fill="#6bd28f"/><text x="${pad+104}" y="19" fill="#9aa7bd" font-size="10">Earnings</text>`;
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${legend}${bars}</svg>`;
    };
    const renderStatements = () => {
      const bs = sres?.balanceSheetHistory?.balanceSheetStatements || [];
      const cf = sres?.cashflowStatementHistory?.cashflowStatements || [];
      const pick = (arr:any[], key:string)=> Array.isArray(arr) ? arr.map((x:any)=> ({ date: x?.endDate?.fmt || x?.endDate?.raw || '', v: x?.[key]?.raw })) : [];
      const netDebt = pick(bs,'netDebt');
      const freeCash = pick(cf,'freeCashFlow');
      if (!netDebt.length && !freeCash.length) return '';
      const w=520,h=160,pad=30; const vals=[...netDebt.map(x=>Number(x.v||0)), ...freeCash.map(x=>Number(x.v||0))]; const max=Math.max(1, ...vals.map(v=>Math.abs(v)));
      const keys = Array.from(new Set([...netDebt.map(x=>x.date), ...freeCash.map(x=>x.date)])).slice(-8);
      const barW = (w-2*pad)/(keys.length*2 + (keys.length-1)); let x=pad;
      const bars = keys.map((k:any)=>{
        const nd = Number((netDebt.find(x=>x.date===k)?.v)||0); const fcV = Number((freeCash.find(x=>x.date===k)?.v)||0);
        const ndH = ((h-2*pad) * Math.abs(nd))/max; const fcH = ((h-2*pad) * Math.abs(fcV))/max; const base=h-pad;
        const ndY = nd>=0 ? base-ndH : base; const fcY = fcV>=0 ? base-fcH : base;
        const g = `<g>
          <rect x="${x}" y="${ndY}" width="${barW}" height="${ndH}" fill="#ff8f6b"/>
          <rect x="${x+barW+4}" y="${fcY}" width="${barW}" height="${fcH}" fill="#ffd166"/>
          <text x="${x+barW}" y="${h-8}" text-anchor="middle" fill="#9aa7bd" font-size="10">${k}</text>
        </g>`; x += barW*2 + 12; return g;
      }).join('');
      const legend = `<rect x="${pad}" y="10" width="10" height="10" fill="#ff8f6b"/><text x="${pad+14}" y="19" fill="#9aa7bd" font-size="10">Net Debt</text>
        <rect x="${pad+90}" y="10" width="10" height="10" fill="#ffd166"/><text x="${pad+104}" y="19" fill="#9aa7bd" font-size="10">Free Cash Flow</text>`;
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${legend}${bars}</svg>`;
    };
    const recSvg = renderRecChart();
    const earnSvg = renderEarnings();
    const stmtSvg = renderStatements();
    body.innerHTML = `
      <div class="muted">Yahoo Data for <span class="mono">${d.symbol}</span></div>
      <div class="grid-3" style="margin-top:8px">
        <div class="card" style="background:#0e1320">
          <div class="muted">Quote</div>
          <div class="mono" style="margin-top:6px">Price: ${fmtNum(q.price)} @ ${q.time || '-'}</div>
          <div class="muted" style="margin-top:4px">Market Cap: ${toMillions(price.marketCap?.raw ?? details.marketCap?.raw)}</div>
          <div class="muted" style="margin-top:4px">PE: ${fmtNum(details.trailingPE?.raw ?? price.trailingPE?.raw)}</div>
          <div class="muted" style="margin-top:4px">EPS: ${fmtNum(price.epsTrailingTwelveMonths?.raw ?? stats.trailingEps?.raw)}</div>
          <div class="muted" style="margin-top:4px">Target Mean: ${fmtNum(fin.targetMeanPrice?.raw)}</div>
        </div>
        <div class="card" style="background:#0e1320">
          <div class="muted">Profile</div>
          <div class="muted" style="margin-top:6px">Sector: ${profile.sector || '-'}</div>
          <div class="muted" style="margin-top:4px">Industry: ${profile.industry || '-'}</div>
          <div class="muted" style="margin-top:4px">Employees: ${fmtNum(profile.fullTimeEmployees)}</div>
          <div class="muted" style="margin-top:4px">Country: ${profile.country || '-'}</div>
        </div>
        <div class="card" style="background:#0e1320">
          <div class="muted">Chart</div>
          ${spark}
        </div>
      </div>
      ${(recSvg||earnSvg||stmtSvg) ? `<div class=\"grid-3\" style=\"margin-top:8px\">${recSvg?`<div class=\"card\" style=\"background:#0e1320\"><div class=\"muted\">Recommendation Trend</div>${recSvg}</div>`:''}${earnSvg?`<div class=\"card\" style=\"background:#0e1320\"><div class=\"muted\">Earnings (Yearly)</div>${earnSvg}</div>`:''}${stmtSvg?`<div class=\"card\" style=\"background:#0e1320\"><div class=\"muted\">Balance Sheet & Cash Flow</div>${stmtSvg}</div>`:''}</div>` : ''}
      <div class="card" style="background:#0e1320; margin-top:8px">
        <div class="muted">quoteSummary (modules)</div>
        <pre class="mono" style="white-space:pre-wrap; margin-top:6px">${detailJson || '-'}</pre>
      </div>
    `;
  } catch (e:any) {
    body.innerHTML = `<div class="mono" style="margin-top:8px; color:#ff6b6b">Error: ${e.message}</div>`;
  }
}

// Removed Yahoo Data button; Yahoo auto-loads on dropdown change and Analyze

async function populateDropdown() {
  try {
    const res = await api.listStocks();
    const data: Array<{name:string, symbol:string, yahoo:string}> = res.data || [];
    // cache for search filtering
    (window as any)._stockListCache = data;
    // populate datalist for symbol autocomplete
    const dl = document.getElementById('stocksList') as HTMLDataListElement | null;
    if (dl) {
      dl.innerHTML = data.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
    }
    const sel = document.getElementById('stockSelect') as HTMLSelectElement;
    if (!sel) return;
    sel.innerHTML = '<option value="" selected disabled>— Select a stock —</option>' +
      data.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
    // Restore last selected symbol if present
    try {
      const saved = localStorage.getItem('selectedSymbol') || '';
      if (saved && data.some(d=>d.yahoo===saved)) {
        sel.value = saved;
        (document.getElementById('symbol') as HTMLInputElement).value = saved;
        // Kick off load flow
        setTimeout(()=> sel.dispatchEvent(new Event('change')), 0);
      }
    } catch {}
    sel.addEventListener('change', async ()=>{
      const v = sel.value;
      (document.getElementById('symbol') as HTMLInputElement).value = v;
      // Persist selection
      try { localStorage.setItem('selectedSymbol', v); } catch {}
      // Status: start ingest
      const statusEl = document.getElementById('status')!;
      statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Loading ${v}...</div>`;
      // 1) Ingest prices + news into DB
      try {
        const ing = await api.ingest(v);
        const list = (ing.messages||[]).map((m:any)=>`<li>${m}</li>`).join('');
        statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Ingested ${v} (prices: ${ing.insertedPrices}, news: ${ing.insertedNews})</div>${list?`<ul>${list}</ul>`:''}`;
      } catch (e:any) {
        // Show error but continue to refresh using any existing data
        statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px; color:#ff6b6b">Ingest error: ${e.message||e}</div>`;
      }
      // 2) Load core stock data panels
      try { await refresh(v); } catch {}
      // 3) Analyze to populate sentiment/recommendation
      try {
        const res = await api.analyze(v);
        (document.getElementById('sentiment')!).innerHTML = `
          <div class="grid-3">
            <div><div class="muted">Sentiment</div><div class="stat">${res.data.sentiment.toFixed(3)}</div></div>
            <div><div class="muted">Predicted Close</div><div class="stat">${res.data.predictedClose.toFixed(2)}</div></div>
            <div><div class="muted">Score</div><div class="stat">${res.data.score} — ${res.data.recommendation}</div></div>
          </div>
        `;
      } catch {}
      const card = document.getElementById('mcinsight')!;
      card.innerHTML = `<div class="muted">MC Insight</div><div class="mono" style="margin-top:8px">Loading...</div>`;
      try {
        const mci = await api.mcInsight(v);
        const d = (mci as any).data || {};
        const score = (d.stockScore != null) ? ` (Score: ${d.stockScore})` : '';
        card.innerHTML = `
          <div class="muted">MC Insight</div>
          <div class="mono" style="margin-top:8px">${d.shortDesc || '-'}</div>
          <div class="muted" style="margin-top:6px">${d.longDesc || ''}${score}</div>
        `;
      } catch {
        card.innerHTML = `<div class=\"muted\">MC Insight</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
      }
      // Tech for selected symbol
      const tcard = document.getElementById('mctech')!;
      tcard.innerHTML = `<div class="muted">MC Technicals</div><div class="mono" style="margin-top:8px">Loading...</div>`;
      try {
        const [td, tw, tm] = await Promise.all([
          api.mcTech(v, 'D'), api.mcTech(v, 'W'), api.mcTech(v, 'M')
        ]);
    const pick = (resp: any, id: string) => {
      const arr = (resp?.data?.indicators || []) as any[];
      return arr.find(x=>String(x.id).toLowerCase()===id);
    };
    // Reuse the same svg-based rendering as other paths
    const num = (x:any)=>{ const n=Number(x); return isFinite(n)?n:NaN; };
    const piv = (resp:any, style:string)=>{
      const arr = (resp?.data?.pivotLevels||[]) as any[]; return arr.find((p:any)=>String(p.key).toLowerCase()===style)?.pivotLevel || {};
    };
    const svgFor = (label:string, resp:any, style:string)=>{
      const d = resp?.data||{}; const pv = piv(resp);
      const low = Math.min(num(d.low), num(pv.s3), num(pv.s2), num(pv.s1));
      const high = Math.max(num(d.high), num(pv.r1), num(pv.r2), num(pv.r3));
      const min = isFinite(low)?low:0, max = isFinite(high)?high:1; const w=300, h=150, pad=30;
      const x = (v:number)=> pad + (w-2*pad) * ((v-min)/(max-min||1)); const yMid = h/2;
      const line = (x1:number,y1:number,x2:number,y2:number,cls:string)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" stroke-width="2"/>`;
      const tick = (val:number, name:string, color:string)=>{ const xi=x(val); return `<line x1="${xi}" y1="${yMid-25}" x2="${xi}" y2="${yMid+25}" stroke="${color}" stroke-width="2"/><text x="${xi}" y="${yMid-30}" fill="${color}" font-size="10" text-anchor="middle">${name}</text><text x="${xi}" y="${yMid+38}" fill="${color}" font-size="10" text-anchor="middle">${val.toFixed(2)}</text>`; };
      const close = num(d.close); const axis = line(pad,yMid,w-pad,yMid,'axis');
      const parts = [axis,
        isFinite(num(pv.s3))?tick(num(pv.s3),'S3','#ff6b6b'):'',
        isFinite(num(pv.s2))?tick(num(pv.s2),'S2','#ff8f6b'):'',
        isFinite(num(pv.s1))?tick(num(pv.s1),'S1','#ffb36b'):'',
        isFinite(num(pv.pivotPoint))?tick(num(pv.pivotPoint),'P','#9ad'):'',
        isFinite(num(pv.r1))?tick(num(pv.r1),'R1','#6bd28f'):'',
        isFinite(num(pv.r2))?tick(num(pv.r2),'R2','#53c27f'):'',
        isFinite(num(pv.r3))?tick(num(pv.r3),'R3','#3bb26f'):'',
        isFinite(close)?`<circle cx="${x(close)}" cy="${yMid}" r="5" fill="#ffd166" /><text x="${x(close)}" y="${yMid+55}" fill="#ffd166" font-size="10" text-anchor="middle">Close ${close.toFixed(2)}</text>`:''
      ].join('');
      const rsi = Number(pick(resp,'rsi')?.value); const rsiY=h-28; const rsiW=w-2*pad;
      const rsiBar = isFinite(rsi)?`<g><title>RSI ${rsi.toFixed(2)}</title><rect x="${pad}" y="${rsiY}" width="${rsiW}" height="8" fill="#253149" rx="4"/><rect x="${pad}" y="${rsiY}" width="${rsiW*(rsi/100)}" height="8" fill="#4dabf7" rx="4"/></g><text x="${pad+rsiW/2}" y="${rsiY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">RSI ${rsi.toFixed(2)}</text>`:'';
      const macdVal = Number(pick(resp,'macd')?.value); const macdY=h-14; const macdW=rsiW; const macdCenter=pad+macdW/2; const macdScale=20; const macdPx=isFinite(macdVal)?(macdW/2)*Math.min(1, Math.abs(macdVal)/macdScale):0; const macdColor=(macdVal||0)>=0?'#6bd28f':'#ff6b6b';
      const macdBar = isFinite(macdVal)?`<g><title>MACD ${macdVal.toFixed(2)}</title><rect x="${pad}" y="${macdY}" width="${macdW}" height="8" fill="#253149" rx="4"/><rect x="${macdCenter - macdPx}" y="${macdY}" width="${2*macdPx}" height="8" fill="${macdColor}" rx="4"/></g><text x="${pad+macdW/2}" y="${macdY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">MACD ${macdVal.toFixed(2)}</text>`:'';
      const sma = Array.isArray(d.sma)? d.sma : []; const ema = Array.isArray(d.ema)? d.ema : [];
      const sMap:any = {}; sma.forEach((s:any)=> sMap[String(s.key)] = s); const eMap:any = {}; ema.forEach((s:any)=> eMap[String(s.key)] = s);
      const keys = Array.from(new Set([...sma.map((s:any)=>String(s.key)), ...ema.map((s:any)=>String(s.key))])).sort((a,b)=> Number(a)-Number(b));
      const col = (ind?: string)=> ind && /^bull/i.test(ind) ? '#6bd28f' : ind && /^bear/i.test(ind) ? '#ff6b6b' : '#9aa7bd';
      const table = `<table class="mono" style="font-size:11px;margin-top:6px;border-collapse:collapse;width:100%"><thead><tr><th style=\"text-align:left;color:#9aa7bd\">K</th><th style=\"text-align:left;color:#9aa7bd\">SMA</th><th style=\"text-align:left;color:#9aa7bd\">EMA</th></tr></thead><tbody>${keys.map(k=>{ const s=sMap[k]; const e=eMap[k]; return `<tr><td style=\"padding:2px 6px;color:#9aa7bd\">${k}</td><td style=\"padding:2px 6px;color:${col(s?.indication)}\" title=\"SMA ${k}: ${s?.value ?? '-'}${s?.indication?` (${s.indication})`:''}\">${s?.value ?? '-'}</td><td style=\"padding:2px 6px;color:${col(e?.indication)}\" title=\"EMA ${k}: ${e?.value ?? '-'}${e?.indication?` (${e.indication})`:''}\">${e?.value ?? '-'}</td></tr>`; }).join('')}</tbody></table>`;
      return `<div class=\"card\" style=\"background:#0e1320\"><div class=\"muted\">${label}</div><svg width=\"300\" height=\"150\" viewBox=\"0 0 300 150\" xmlns=\"http://www.w3.org/2000/svg\"><style>.axis{stroke:#9aa7bd}</style>${parts}${rsiBar}${macdBar}</svg>${table}</div>`;
    };
    const renderWithStyle = (styleKey: string) => {
      const key = styleKey.toLowerCase();
      tcard.innerHTML = `<div class=\"tech-grid\" style=\"margin-top:8px\">${svgFor('Daily', td, key)}${svgFor('Weekly', tw, key)}${svgFor('Monthly', tm, key)}</div>`;
    };
    (window as any)._pivotStyle = (window as any)._pivotStyle || 'classic';
    renderWithStyle((window as any)._pivotStyle);
      } catch {
        tcard.innerHTML = `<div class=\"muted\">MC Technicals</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
      }
      // Auto-load Yahoo data as well
      try { await renderYahooForSymbol(v); } catch {}
      scheduleConnectivity(v, 1000);
    });
  } catch {
    // ignore
  }
}

populateDropdown();

// Text search to filter dropdown by name or symbol
const _sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
const _search = document.getElementById('stockSearch') as HTMLInputElement | null;
if (_sel && _search) {
  const baseOption = '<option value="" selected disabled>�?" Select a stock �?"</option>';
  const render = (list: Array<{name:string, symbol:string, yahoo:string}>) => {
    _sel.innerHTML = baseOption + list.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
  };
  _search.addEventListener('input', ()=>{
    const data: Array<{name:string, symbol:string, yahoo:string}> = (window as any)._stockListCache || [];
    const q = (_search.value || '').trim().toLowerCase();
    if (!q) { render(data); return; }
    const filtered = data.filter(d => d.name.toLowerCase().includes(q) || d.symbol.toLowerCase().includes(q));
    render(filtered);
  });
  _search.addEventListener('keydown', (ev: any)=>{
    if (ev.key === 'Enter') {
      const data: Array<{name:string, symbol:string, yahoo:string}> = (window as any)._stockListCache || [];
      const q = (_search.value || '').trim().toLowerCase();
      if (!q) return;
      const m = data.find(d => d.name.toLowerCase().includes(q) || d.symbol.toLowerCase().includes(q));
      if (m) {
        _sel.value = m.yahoo;
        (document.getElementById('symbol') as HTMLInputElement).value = m.yahoo;
        _sel.dispatchEvent(new Event('change'));
      }
    }
  });
}

// Enhance keyboard navigation for search: ArrowUp/Down to preview selection, Esc to clear
if (_sel && _search) {
  let _navIdx = 0;
  _search.addEventListener('keydown', (ev: KeyboardEvent)=>{
    const opts = Array.from(_sel.options).slice(1); // skip placeholder
    if (!opts.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); _navIdx = Math.min(opts.length-1, _navIdx+1); _sel.selectedIndex = _navIdx + 1; (document.getElementById('symbol') as HTMLInputElement).value = (_sel.value||''); }
    if (ev.key === 'ArrowUp')   { ev.preventDefault(); _navIdx = Math.max(0, _navIdx-1); _sel.selectedIndex = _navIdx + 1; (document.getElementById('symbol') as HTMLInputElement).value = (_sel.value||''); }
    if (ev.key === 'Escape') { _search.value=''; _navIdx = 0; _sel.selectedIndex = 0; }
  });
}

// Update MC Insight when user types a symbol manually
const symbolInput = document.getElementById('symbol') as HTMLInputElement;
if (symbolInput) {
  const loadMcFor = async (v: string) => {
    const sym = (v || '').trim().toUpperCase();
    if (!sym) return;
    const card = document.getElementById('mcinsight')!;
    card.innerHTML = `<div class="muted">MC Insight</div><div class="mono" style="margin-top:8px">Loading...</div>`;
    try {
      const mci = await api.mcInsight(sym);
      const d = (mci as any).data || {};
      const score = (d.stockScore != null) ? ` (Score: ${d.stockScore})` : '';
      card.innerHTML = `
        <div class="muted">MC Insight</div>
        <div class="mono" style="margin-top:8px">${d.shortDesc || '-'}</div>
        <div class="muted" style="margin-top:6px">${d.longDesc || ''}${score}</div>
      `;
    } catch {
      card.innerHTML = `<div class=\"muted\">MC Insight</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
    }
    // Load tech as well when symbol changes manually
    const techCard = document.getElementById('mctech')!;
    techCard.innerHTML = `<div class="muted">MC Technicals</div><div class="mono" style="margin-top:8px">Loading...</div>`;
    try {
      const [td, tw, tm] = await Promise.all([
        api.mcTech(sym, 'D'), api.mcTech(sym, 'W'), api.mcTech(sym, 'M')
      ]);
      // Render with SVG + tables
      const num = (x:any)=>{ const n=Number(x); return isFinite(n)?n:NaN; };
      const pick = (resp:any, id:string)=>{ const arr=(resp?.data?.indicators||[]) as any[]; return arr.find(x=>String(x.id).toLowerCase()===id); };
      const piv = (resp:any)=>{ const arr=(resp?.data?.pivotLevels||[]) as any[]; return arr.find((p:any)=>String(p.key).toLowerCase()==='classic')?.pivotLevel || {}; };
      const svgFor = (label:string, resp:any)=>{
        const d = resp?.data||{}; const pv = piv(resp);
        const low = Math.min(num(d.low), num(pv.s3), num(pv.s2), num(pv.s1)); const high = Math.max(num(d.high), num(pv.r1), num(pv.r2), num(pv.r3));
        const min = isFinite(low)?low:0, max = isFinite(high)?high:1; const w=300, h=150, pad=30; const x=(v:number)=> pad + (w-2*pad) * ((v-min)/(max-min||1)); const yMid=h/2;
        const line=(x1:number,y1:number,x2:number,y2:number,cls:string)=>`<line x1=\"${x1}\" y1=\"${y1}\" x2=\"${x2}\" y2=\"${y2}\" class=\"${cls}\" stroke-width=\"2\"/>`;
        const tick=(val:number,name:string,color:string)=>{ const xi=x(val); return `<line x1=\"${xi}\" y1=\"${yMid-25}\" x2=\"${xi}\" y2=\"${yMid+25}\" stroke=\"${color}\" stroke-width=\"2\"/><text x=\"${xi}\" y=\"${yMid-30}\" fill=\"${color}\" font-size=\"10\" text-anchor=\"middle\">${name}</text><text x=\"${xi}\" y=\"${yMid+38}\" fill=\"${color}\" font-size=\"10\" text-anchor=\"middle\">${val.toFixed(2)}</text>`; };
        const close=num(d.close); const axis=line(pad,yMid,w-pad,yMid,'axis');
        const parts=[axis, isFinite(num(pv.s3))?tick(num(pv.s3),'S3','#ff6b6b'):'', isFinite(num(pv.s2))?tick(num(pv.s2),'S2','#ff8f6b'):'', isFinite(num(pv.s1))?tick(num(pv.s1),'S1','#ffb36b'):'', isFinite(num(pv.pivotPoint))?tick(num(pv.pivotPoint),'P','#9ad'):'', isFinite(num(pv.r1))?tick(num(pv.r1),'R1','#6bd28f'):'', isFinite(num(pv.r2))?tick(num(pv.r2),'R2','#53c27f'):'', isFinite(num(pv.r3))?tick(num(pv.r3),'R3','#3bb26f'):'', isFinite(close)?`<circle cx=\"${x(close)}\" cy=\"${yMid}\" r=\"5\" fill=\"#ffd166\" /><text x=\"${x(close)}\" y=\"${yMid+55}\" fill=\"#ffd166\" font-size=\"10\" text-anchor=\"middle\">Close ${close.toFixed(2)}</text>`:'' ].join('');
        const rsi = Number(pick(resp,'rsi')?.value); const rsiY=h-28; const rsiW=w-2*pad; const rsiBar = isFinite(rsi)?`<rect x=\"${pad}\" y=\"${rsiY}\" width=\"${rsiW}\" height=\"8\" fill=\"#253149\" rx=\"4\"/><rect x=\"${pad}\" y=\"${rsiY}\" width=\"${rsiW*(rsi/100)}\" height=\"8\" fill=\"#4dabf7\" rx=\"4\"/><text x=\"${pad+rsiW/2}\" y=\"${rsiY-4}\" fill=\"#9aa7bd\" font-size=\"10\" text-anchor=\"middle\">RSI ${rsi.toFixed(2)}</text>`:'';
        const macdVal=Number(pick(resp,'macd')?.value); const macdY=h-14; const macdW=rsiW; const macdCenter=pad+macdW/2; const macdScale=20; const macdPx=isFinite(macdVal)?(macdW/2)*Math.min(1, Math.abs(macdVal)/macdScale):0; const macdColor=(macdVal||0)>=0?'#6bd28f':'#ff6b6b';
        const macdBar = isFinite(macdVal)?`<rect x=\"${pad}\" y=\"${macdY}\" width=\"${macdW}\" height=\"8\" fill=\"#253149\" rx=\"4\"/><rect x=\"${macdCenter - macdPx}\" y=\"${macdY}\" width=\"${2*macdPx}\" height=\"8\" fill=\"${macdColor}\" rx=\"4\"/><text x=\"${pad+macdW/2}\" y=\"${macdY-4}\" fill=\"#9aa7bd\" font-size=\"10\" text-anchor=\"middle\">MACD ${macdVal.toFixed(2)}</text>`:'';
        const sma = Array.isArray(d.sma)? d.sma : []; const ema = Array.isArray(d.ema)? d.ema : [];
        const sMap:any = {}; sma.forEach((s:any)=> sMap[String(s.key)] = s); const eMap:any = {}; ema.forEach((s:any)=> eMap[String(s.key)] = s);
        const keys = Array.from(new Set([...sma.map((s:any)=>String(s.key)), ...ema.map((s:any)=>String(s.key))])).sort((a,b)=> Number(a)-Number(b)); const col=(ind?:string)=> ind && /^bull/i.test(ind) ? '#6bd28f' : ind && /^bear/i.test(ind) ? '#ff6b6b' : '#9aa7bd';
        const table = `<table class=\"mono\" style=\"font-size:11px;margin-top:6px;border-collapse:collapse;width:100%\"><thead><tr><th style=\"text-align:left;color:#9aa7bd\">K</th><th style=\"text-align:left;color:#9aa7bd\">SMA</th><th style=\"text-align:left;color:#9aa7bd\">EMA</th></tr></thead><tbody>${keys.map(k=>{ const s=sMap[k]; const e=eMap[k]; return `<tr><td style=\"padding:2px 6px;color:#9aa7bd\">${k}</td><td style=\"padding:2px 6px;color:${col(s?.indication)}\" title=\"SMA ${k}: ${s?.value ?? '-'}${s?.indication?` (${s.indication})`:''}\">${s?.value ?? '-'}</td><td style=\"padding:2px 6px;color:${col(e?.indication)}\" title=\"EMA ${k}: ${e?.value ?? '-'}${e?.indication?` (${e.indication})`:''}\">${e?.value ?? '-'}</td></tr>`; }).join('')}</tbody></table>`;
        return `<div class=\"card\" style=\"background:#0e1320\"><div class=\"muted\">${label}</div><svg width=\"300\" height=\"150\" viewBox=\"0 0 300 150\" xmlns=\"http://www.w3.org/2000/svg\"><style>.axis{stroke:#9aa7bd}</style>${parts}${rsiBar}${macdBar}</svg>${table}</div>`;
      };
      techCard.innerHTML = `<div class=\"muted\">MC Technicals</div><div class=\"grid-3\" style=\"margin-top:8px\">${svgFor('Daily', td)}${svgFor('Weekly', tw)}${svgFor('Monthly', tm)}</div>`;
    } catch {
      techCard.innerHTML = `<div class=\"muted\">MC Technicals</div><div class=\"mono\" style=\"margin-top:8px\">No data</div>`;
    }
  };
  symbolInput.addEventListener('change', async ()=>{
    try { localStorage.setItem('selectedSymbol', (symbolInput.value||'').trim().toUpperCase()); } catch {}
    await loadMcFor(symbolInput.value);
    const sym = (symbolInput.value || '').trim().toUpperCase();
    try { await renderYahooForSymbol(sym); } catch {}
    scheduleConnectivity(sym, 1000);
  });
  symbolInput.addEventListener('blur', async ()=>{
    try { localStorage.setItem('selectedSymbol', (symbolInput.value||'').trim().toUpperCase()); } catch {}
    await loadMcFor(symbolInput.value);
    const sym = (symbolInput.value || '').trim().toUpperCase();
    try { await renderYahooForSymbol(sym); } catch {}
    scheduleConnectivity(sym, 1200);
  });
  symbolInput.addEventListener('keydown', async (ev: any)=>{
    if (ev.key === 'Enter') {
      try { localStorage.setItem('selectedSymbol', (symbolInput.value||'').trim().toUpperCase()); } catch {}
      await loadMcFor(symbolInput.value);
      const sym = (symbolInput.value || '').trim().toUpperCase();
      try { await renderYahooForSymbol(sym); } catch {}
      scheduleConnectivity(sym, 800);
    }
  });

  // Lightweight fuzzy autocomplete beneath the symbol input
  const suggest = document.createElement('div');
  suggest.id = 'symbolSuggest';
  suggest.className = 'card';
  suggest.style.position = 'absolute';
  suggest.style.display = 'none';
  suggest.style.maxHeight = '220px';
  suggest.style.overflow = 'auto';
  suggest.style.zIndex = '1000';
  document.body.appendChild(suggest);

  function positionSuggest(anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    suggest.style.left = `${window.scrollX + r.left}px`;
    suggest.style.top = `${window.scrollY + r.bottom + 4}px`;
    suggest.style.width = `${r.width}px`;
  }
  function hideSuggest() { suggest.style.display = 'none'; suggest.innerHTML = ''; }
  function chooseSymbol(yahoo: string) {
    (symbolInput as HTMLInputElement).value = yahoo;
    hideSuggest();
    loadMcFor(yahoo);
    renderYahooForSymbol(yahoo).catch(()=>{});
    scheduleConnectivity(yahoo, 800);
  }
  function score(q: string, name: string, symbol: string, yahoo: string) {
    const n = (name||'').toUpperCase(); const s = (symbol||'').toUpperCase(); const y = (yahoo||'').toUpperCase();
    let sc = 0;
    if (y.startsWith(q)) sc += 120; if (s.startsWith(q)) sc += 110; if (n.startsWith(q)) sc += 90;
    if (y.includes(q)) sc += 70; if (s.includes(q)) sc += 60; if (n.includes(q)) sc += 40;
    return sc;
  }
  symbolInput.addEventListener('input', ()=>{
    const data: Array<{name:string, symbol:string, yahoo:string}> = (window as any)._stockListCache || [];
    const q = (symbolInput.value || '').trim().toUpperCase();
    if (!q) { hideSuggest(); return; }
    const scored = data.map(d=>({ d, s: score(q, d.name||'', d.symbol||'', d.yahoo||'') }))
      .filter(x=> x.s > 0)
      .sort((a,b)=> b.s - a.s)
      .slice(0,8);
    if (!scored.length) { hideSuggest(); return; }
    positionSuggest(symbolInput);
    suggest.innerHTML = scored.map(x=>`<div class="suggest-item" data-y="${x.d.yahoo}">
      <div class="muted">${x.d.name}</div>
      <div class="mono" style="font-size:12px; color:#6b7280">${x.d.symbol} · ${x.d.yahoo}</div>
    </div>`).join('');
    Array.from(suggest.querySelectorAll('.suggest-item')).forEach((el:any)=>{
      (el as HTMLElement).style.padding = '8px 10px';
      (el as HTMLElement).style.cursor = 'pointer';
      (el as HTMLElement).addEventListener('mouseenter', ()=>{ (el as HTMLElement).style.background = 'var(--panel-2)'; });
      (el as HTMLElement).addEventListener('mouseleave', ()=>{ (el as HTMLElement).style.background = 'transparent'; });
      (el as HTMLElement).addEventListener('click', ()=>{ const y = el.getAttribute('data-y')||''; if (y) chooseSymbol(y); });
    });
    suggest.style.display = 'block';
  });
  symbolInput.addEventListener('focus', ()=>{ if ((symbolInput.value||'').trim()) positionSuggest(symbolInput); });
  symbolInput.addEventListener('blur', ()=>{ setTimeout(hideSuggest, 160); });
}

// Pivot style toggle + cached render for MC Technicals
(() => {
  const body = () => document.getElementById('mctechBody');
  function renderMcTechFromCache() {
    const container = body(); if (!container) return;
    const cache: any = (window as any)._mcTech; if (!cache) return;
    const style = String((window as any)._pivotStyle || 'classic').toLowerCase();
    const fmt = (x: any) => x==null?'-':String(x);
    const num = (x:any)=>{ const n=Number(x); return isFinite(n)?n:NaN; };
    const pick = (resp:any, id:string)=>{ const arr=(resp?.data?.indicators||[]) as any[]; return arr.find(x=>String(x.id).toLowerCase()===id); };
    const piv = (resp:any)=>{ const arr=(resp?.data?.pivotLevels||[]) as any[]; return arr.find((p:any)=>String(p.key).toLowerCase()===style)?.pivotLevel || {}; };
    const svgFor = (label:string, resp:any)=>{
      const d = resp?.data||{}; const pv = piv(resp);
      const low = Math.min(num(d.low), num(pv.s3), num(pv.s2), num(pv.s1)); const high = Math.max(num(d.high), num(pv.r1), num(pv.r2), num(pv.r3));
      const min = isFinite(low)?low:0, max = isFinite(high)?high:1; const w=300, h=150, pad=30; const x=(v:number)=> pad + (w-2*pad) * ((v-min)/(max-min||1)); const yMid=h/2;
      const line=(x1:number,y1:number,x2:number,y2:number,cls:string)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" stroke-width="2"/>`;
      const tick=(val:number,name:string,color:string)=>{ const xi=x(val); return `<line x1="${xi}" y1="${yMid-25}" x2="${xi}" y2="${yMid+25}" stroke="${color}" stroke-width="2"/><text x="${xi}" y="${yMid-30}" fill="${color}" font-size="10" text-anchor="middle">${name}</text><text x="${xi}" y="${yMid+38}" fill="${color}" font-size="10" text-anchor="middle">${val.toFixed(2)}</text>`; };
      const close=num(d.close); const axis=line(pad,yMid,w-pad,yMid,'axis');
      const parts=[axis, isFinite(num(pv.s3))?tick(num(pv.s3),'S3','#ff6b6b'):'', isFinite(num(pv.s2))?tick(num(pv.s2),'S2','#ff8f6b'):'', isFinite(num(pv.s1))?tick(num(pv.s1),'S1','#ffb36b'):'', isFinite(num(pv.pivotPoint))?tick(num(pv.pivotPoint),'P','#9ad'):'', isFinite(num(pv.r1))?tick(num(pv.r1),'R1','#6bd28f'):'', isFinite(num(pv.r2))?tick(num(pv.r2),'R2','#53c27f'):'', isFinite(num(pv.r3))?tick(num(pv.r3),'R3','#3bb26f'):'', isFinite(close)?`<circle cx="${x(close)}" cy="${yMid}" r="5" fill="#ffd166" /><text x="${x(close)}" y="${yMid+55}" fill="#ffd166" font-size="10" text-anchor="middle">Close ${close.toFixed(2)}</text>`:'' ].join('');
      const rsi = Number(pick(resp,'rsi')?.value); const rsiY=h-28; const rsiW=w-2*pad; const rsiBar = isFinite(rsi)?`<rect x="${pad}" y="${rsiY}" width="${rsiW}" height="8" fill="#253149" rx="4"/><rect x="${pad}" y="${rsiY}" width="${rsiW*(rsi/100)}" height="8" fill="#4dabf7" rx="4"/><text x="${pad+rsiW/2}" y="${rsiY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">RSI ${rsi.toFixed(2)}</text>`:'';
      const macdVal=Number(pick(resp,'macd')?.value); const macdY=h-14; const macdW=rsiW; const macdCenter=pad+macdW/2; const macdScale=20; const macdPx=isFinite(macdVal)?(macdW/2)*Math.min(1, Math.abs(macdVal)/macdScale):0; const macdColor=(macdVal||0)>=0?'#6bd28f':'#ff6b6b';
      const macdBar = isFinite(macdVal)?`<rect x="${pad}" y="${macdY}" width="${macdW}" height="8" fill="#253149" rx="4"/><rect x="${macdCenter - macdPx}" y="${macdY}" width="${2*macdPx}" height="8" fill="${macdColor}" rx="4"/><text x="${pad+macdW/2}" y="${macdY-4}" fill="#9aa7bd" font-size="10" text-anchor="middle">MACD ${macdVal.toFixed(2)}</text>`:'';
      const sma = Array.isArray(d.sma)? d.sma : []; const ema = Array.isArray(d.ema)? d.ema : [];
      const sMap:any = {}; sma.forEach((s:any)=> sMap[String(s.key)] = s); const eMap:any = {}; ema.forEach((s:any)=> eMap[String(s.key)] = s);
      const keys = Array.from(new Set([...sma.map((s:any)=>String(s.key)), ...ema.map((s:any)=>String(s.key))])).sort((a,b)=> Number(a)-Number(b)); const col=(ind?:string)=> ind && /^bull/i.test(ind) ? '#6bd28f' : ind && /^bear/i.test(ind) ? '#ff6b6b' : '#9aa7bd';
      const table = `<table class=\"mono\" style=\"font-size:11px;margin-top:6px;border-collapse:collapse;width:100%\"><thead><tr><th style=\"text-align:left;color:#9aa7bd\">K</th><th style=\"text-align:left;color:#9aa7bd\">SMA</th><th style=\"text-align:left;color:#9aa7bd\">EMA</th></tr></thead><tbody>${keys.map(k=>{ const s=sMap[k]; const e=eMap[k]; return `<tr><td style=\"padding:2px 6px;color:#9aa7bd\">${k}</td><td style=\"padding:2px 6px;color:${col(s?.indication)}\" title=\"SMA ${k}: ${s?.value ?? '-'}${s?.indication?` (${s.indication})`:''}\">${s?.value ?? '-'}</td><td style=\"padding:2px 6px;color:${col(e?.indication)}\" title=\"EMA ${k}: ${e?.value ?? '-'}${e?.indication?` (${e.indication})`:''}\">${e?.value ?? '-'}</td></tr>`; }).join('')}</tbody></table>`;
      return `<div class=\"tech-box\"><div class=\"muted\">${label}</div><svg width=\"100%\" height=\"150\" viewBox=\"0 0 300 150\" xmlns=\"http://www.w3.org/2000/svg\"><style>.axis{stroke:#9aa7bd}</style>${parts}${rsiBar}${macdBar}</svg>${table}</div>`;
    };
    const td = cache.D, tw = cache.W, tm = cache.M;
    container.innerHTML = `<div class=\"grid-3\" style=\"margin-top:8px\">${svgFor('Daily', td)}${svgFor('Weekly', tw)}${svgFor('Monthly', tm)}</div>`;
  }
  const bind = (id: string, key: string) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', () => { (window as any)._pivotStyle = key; renderMcTechFromCache(); });
  };
  bind('pivotClassic', 'classic');
  bind('pivotFibo', 'fibonacci');
  bind('pivotCama', 'camarilla');
  // Render once if cache pre-loaded
  setTimeout(renderMcTechFromCache, 0);
})();

// Trendlyne: add Derivatives and Advanced Technicals cards
(() => {
  const addCardsOnce = () => {
    const root = document.getElementById('news')?.parentElement; // row grid
    if (!root) return;
    if (!document.getElementById('tlAdv')) {
      const adv = document.createElement('div'); adv.className='card'; adv.id='tlAdv'; adv.innerHTML = `<div class="muted">Trendlyne Advanced Technicals</div>`; root.insertBefore(adv, document.getElementById('history'));
    }
    if (!document.getElementById('tlDeriv')) {
      const dv = document.createElement('div'); dv.className='card'; dv.id='tlDeriv'; dv.innerHTML = `<div class="muted">Derivatives</div>`; root.appendChild(dv);
    }
  };
  addCardsOnce();
})();

// Initialize Yahoo controls from localStorage
(() => {
  try {
    const r = localStorage.getItem('ydRange');
    const i = localStorage.getItem('ydInterval');
    const m = localStorage.getItem('ydModules');
    if (r) (document.getElementById('ydRange') as HTMLSelectElement).value = r;
    if (i) (document.getElementById('ydInterval') as HTMLSelectElement).value = i;
    if (m) {
      const mods = new Set(m.split(',').map(s=>s.trim()));
      ['price','summaryDetail','assetProfile','financialData','defaultKeyStatistics','earnings','calendarEvents','recommendationTrend','secFilings','incomeStatementHistory']
        .forEach(k => { const el = document.getElementById('ydm_'+k) as HTMLInputElement; if (el) el.checked = mods.has(k); });
    }
  } catch {}
  // Persist on change
  const persist = () => { collectYahooOptions(); };
  ['ydRange','ydInterval'].forEach(id => document.getElementById(id)?.addEventListener('change', persist));
  ['price','summaryDetail','assetProfile','financialData','defaultKeyStatistics','earnings','calendarEvents','recommendationTrend','secFilings','incomeStatementHistory']
    .forEach(k => document.getElementById('ydm_'+k)?.addEventListener('change', persist));
})();
    // Market Overview: ET Indices, Sector Perf, MMI, Valuation
    try {
      const [indices, sector, mmi, val] = await Promise.all([
        api.etIndices(), api.etSectorPerformance(), api.tickertapeMmi(), api.marketsMojoValuation()
      ]);
      const card = document.getElementById('marketOverview')!;
      const topIdx = (indices?.data?.searchresult || indices?.data || []).slice(0,5);
      const topSec = (sector?.data?.searchresult || sector?.data || []).slice(0,5);
      const mmiVal = mmi?.data?.mmi?.now?.value ?? mmi?.data?.data?.value ?? '-';
      const meter = (v:number)=>{
        const w=240,h=80; const x=20+(w-40)*(Math.max(0, Math.min(100, Number(v)||0))/100);
        return `<svg width="${w}" height="${h}"><line x1="20" y1="40" x2="${w-20}" y2="40" stroke="#233452" stroke-width="6"/><circle cx="${x}" cy="40" r="8" fill="#4dabf7"/><text x="${w/2}" y="70" text-anchor="middle" fill="#9aa7bd" font-size="12">MMI ${v}</text></svg>`;
      };
      card.innerHTML = `
        <div class="muted">Market Overview</div>
        <div class="stat-grid" style="margin-top:8px">
          <div class="stat-box">
            <div class="muted">Top Indices</div>
            <ul class="mono" style="margin-top:6px; padding-left:16px">${topIdx.map((x:any)=>`<li>${x.index_symbol || x.indexName || x.symbol || '-'} <span class="muted">${x.percChange ?? x.percentChange ?? '-'}%</span></li>`).join('')}</ul>
          </div>
          <div class="stat-box">
            <div class="muted">Top Sectors</div>
            <ul class="mono" style="margin-top:6px; padding-left:16px">${topSec.map((x:any)=>`<li>${x.sector_name || x.name || '-'} <span class="muted">${x.marketcappercentchange ?? x.percentChange ?? '-'}%</span></li>`).join('')}</ul>
          </div>
          <div class="stat-box">
            <div class="muted">TickerTape MMI</div>
            <div style="margin-top:6px">${meter(Number(mmiVal))}</div>
          </div>
        </div>
      `;
    } catch {}





