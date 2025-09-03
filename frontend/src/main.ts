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
          <option value="" selected disabled>Select a stock</option>
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

// Initialize stock selector: load list, wire search filter and selection
(async function initStockSelector(){
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const search = document.getElementById('stockSearch') as HTMLInputElement | null;
  const symbolInput = document.getElementById('symbol') as HTMLInputElement | null;
  if (!sel) return;
  // Show loading placeholder
  sel.innerHTML = '<option value="" selected disabled>Loading…</option>';
  try {
    const res = await new Api().listStocks();
    const data: Array<{name:string,symbol:string,yahoo:string}> = res?.data || [];
    (window as any)._stockListCache = data;
    const baseOption = '<option value="" selected disabled>Select a stock</option>';
    sel.innerHTML = baseOption + data.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
    // Restore saved selection if available
    try {
      const saved = localStorage.getItem('selectedSymbol') || '';
      if (saved && data.some(d=>d.yahoo===saved)) { sel.value = saved; if (symbolInput) symbolInput.value = saved; }
    } catch {}
    // Change handler: persist + ingest + refresh + analyze
    sel.addEventListener('change', async ()=>{
      const v = sel.value;
      if (symbolInput) symbolInput.value = v;
      try { localStorage.setItem('selectedSymbol', v); } catch {}
      const statusEl = document.getElementById('status')!;
      statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Loading ${v}...</div>`;
      try { await new Api().ingest(v); } catch (e:any) {
        statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px;color:#ff6b6b">Ingest error: ${e?.message||e}</div>`;
      }
      try { await refresh(v); } catch {}
      try {
        const a = await new Api().analyze(v);
        (document.getElementById('sentiment')!).innerHTML = `
          <div class="grid-3">
            <div><div class="muted">Sentiment</div><div class="stat">${a.data.sentiment.toFixed(3)}</div></div>
            <div><div class="muted">Predicted Close</div><div class="stat">${a.data.predictedClose.toFixed(2)}</div></div>
            <div><div class="muted">Score</div><div class="stat">${a.data.score} — ${a.data.recommendation}</div></div>
          </div>`;
      } catch {}
    });
    // Type filter on search input
    if (search) {
      const render = (list: Array<{name:string,yahoo:string}>) => {
        sel.innerHTML = baseOption + list.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
      };
      search.addEventListener('input', ()=>{
        const all: Array<{name:string,symbol:string,yahoo:string}> = (window as any)._stockListCache || [];
        const q = (search.value||'').trim().toLowerCase();
        if (!q) { render(all); return; }
        const filtered = all.filter(d => d.name.toLowerCase().includes(q) || d.symbol.toLowerCase().includes(q));
        render(filtered);
      });
      search.addEventListener('keydown', (ev:any)=>{
        if (ev.key === 'Enter') {
          const all: Array<{name:string,symbol:string,yahoo:string}> = (window as any)._stockListCache || [];
          const q = (search.value||'').trim().toLowerCase();
          if (!q) return;
          const m = all.find(d => d.name.toLowerCase().includes(q) || d.symbol.toLowerCase().includes(q));
          if (m) { sel.value = m.yahoo; if (symbolInput) symbolInput.value = m.yahoo; sel.dispatchEvent(new Event('change')); }
        }
      });
    }
  } catch (e:any) {
    sel.innerHTML = '<option value="" selected disabled>No stocks (server offline)</option>';
  }
})();

// Wire DB stats button
(function initDbStats(){
  const btn = document.getElementById('dbstatsBtn') as HTMLButtonElement | null;
  if (btn && !(btn as any)._bound) {
    (btn as any)._bound = true;
    btn.addEventListener('click', async ()=>{
      const symbol = (document.getElementById('symbol') as HTMLInputElement | null)?.value?.trim()?.toUpperCase() || '';
      if (!symbol) {
        (document.getElementById('dbstats') as HTMLElement).innerHTML = '<div class="muted">DB Data</div><div class="mono" style="margin-top:6px;color:#ff6b6b">Enter a symbol first</div>';
        return;
      }
      const card = document.getElementById('dbstats') as HTMLElement;
      card.innerHTML = '<div class="muted">DB Data</div><div class="muted" style="margin-top:6px">Loading...</div>';
      try {
        const res = await api.dbStats(symbol);
        const pretty = escapeHtml(JSON.stringify(res, null, 2));
        card.innerHTML = `<div class="muted">DB Data</div><pre class="mono" style="white-space:pre-wrap;margin-top:6px">${pretty}</pre>`;
      } catch (e: any) {
        card.innerHTML = `<div class="muted">DB Data</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
    });
  }
})();

// RAG: index URLs, query stream
(function initRag(){
  const qInput = document.getElementById('ragq') as HTMLInputElement | null;
  const askBtn = document.getElementById('ragAsk') as HTMLButtonElement | null;
  const out = document.getElementById('ragStream') as HTMLElement | null;
  const urlsInput = document.getElementById('ragUrls') as HTMLTextAreaElement | null;
  const indexBtn = document.getElementById('ragIndexBtn') as HTMLButtonElement | null;
  const idxStatus = document.getElementById('ragIndexStatus') as HTMLElement | null;
  const history = document.getElementById('historyBox') as HTMLElement | null;

  const pushHistory = (text: string) => {
    if (!history) return;
    const now = new Date().toLocaleTimeString();
    history.textContent = `${now} - ${text}\n` + (history.textContent || '');
  };

  if (indexBtn && !(indexBtn as any)._bound) {
    (indexBtn as any)._bound = true;
    indexBtn.addEventListener('click', async ()=>{
      const symbol = (document.getElementById('symbol') as HTMLInputElement | null)?.value?.trim()?.toUpperCase() || '';
      const ns = symbol || 'default';
      const raw = urlsInput?.value || '';
      const urls = Array.from(new Set(raw.split(/\s+/).map(s=>s.trim()).filter(Boolean)));
      if (!urls.length) { if (idxStatus) idxStatus.textContent = 'Provide one or more URLs.'; return; }
      if (idxStatus) idxStatus.textContent = 'Indexing...';
      try {
        const res = await api.ragIndex(ns, urls);
        if (idxStatus) idxStatus.textContent = `Indexed ${urls.length} URL(s).`;
        pushHistory(`RAG Index (${ns}): ${urls.length} URL(s)`);
      } catch (e: any) {
        if (idxStatus) idxStatus.textContent = `Index failed: ${e?.message || e}`;
      }
    });
  }

  if (askBtn && out && !(askBtn as any)._bound) {
    (askBtn as any)._bound = true;
    askBtn.addEventListener('click', async ()=>{
      const symbol = (document.getElementById('symbol') as HTMLInputElement | null)?.value?.trim()?.toUpperCase() || '';
      const ns = symbol || 'default';
      const q = qInput?.value?.trim();
      if (!q) return;
      out.textContent = '';
      pushHistory(`RAG Ask (${ns}): ${q}`);
      try {
        const resp = await api.ragStream(ns, q);
        if (!resp?.body) { out.textContent = 'No stream body'; return; }
        const reader = (resp.body as ReadableStream).getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          out.textContent += decoder.decode(value);
        }
      } catch (e: any) {
        out.textContent = `Error: ${String(e?.message || e)}`;
      }
    });
  }
})();

// Agent Q&A (simple JSON answer)
(function initAgent(){
  const input = document.getElementById('agentq') as HTMLInputElement | null;
  const btn = document.getElementById('ask') as HTMLButtonElement | null;
  const out = document.getElementById('agentAnswer') as HTMLElement | null;
  const history = document.getElementById('historyBox') as HTMLElement | null;
  const pushHistory = (text: string) => { if (!history) return; const now = new Date().toLocaleTimeString(); history.textContent = `${now} - ${text}\n` + (history.textContent || ''); };
  if (btn && out && !(btn as any)._bound) {
    (btn as any)._bound = true;
    btn.addEventListener('click', async ()=>{
      const q = input?.value?.trim();
      if (!q) return;
      const symbol = (document.getElementById('symbol') as HTMLInputElement | null)?.value?.trim()?.toUpperCase() || '';
      out.textContent = 'Thinking...';
      pushHistory(`Agent Ask${symbol?` [${symbol}]`:''}: ${q}`);
      try {
        const res = await api.agent(q, symbol || undefined);
        out.textContent = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
      } catch (e: any) {
        out.textContent = `Error: ${String(e?.message || e)}`;
      }
    });
  }
})();

// Live Quotes (WebSocket)
(function initLiveWs(){
  const subBtn = document.getElementById('wsSub') as HTMLButtonElement | null;
  const unsubBtn = document.getElementById('wsUnsub') as HTMLButtonElement | null;
  const symInput = document.getElementById('wsSymbol') as HTMLInputElement | null;
  const status = document.getElementById('wsStatus') as HTMLElement | null;
  const quotes = document.getElementById('wsQuotes') as HTMLElement | null;
  if (!subBtn || !unsubBtn || !symInput || !status || !quotes) return;

  let ws: WebSocket | null = null;
  let connected = false;
  const connect = () => {
    if (ws && connected) return;
    try {
      const url = (location.origin.replace(/^http/, 'ws')) + '/ws';
      ws = new WebSocket(url);
      status.textContent = 'Connecting...';
      ws.onopen = () => { connected = true; status.textContent = 'Connected'; };
      ws.onclose = () => { connected = false; status.textContent = 'Disconnected'; };
      ws.onerror = () => { status.textContent = 'Error'; };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.type === 'quote') {
            const line = `${new Date(msg.time).toLocaleTimeString()} ${msg.symbol} ${msg.price}`;
            quotes.textContent = `${line}\n` + (quotes.textContent || '');
          } else if (msg?.type === 'subscribed') {
            status.textContent = `Subscribed ${msg.symbol}`;
          } else if (msg?.type === 'unsubscribed') {
            status.textContent = `Unsubscribed ${msg.symbol}`;
          }
        } catch {}
      };
    } catch (e) {
      status.textContent = 'Failed to open WebSocket';
    }
  };

  if (!(subBtn as any)._bound) {
    (subBtn as any)._bound = true;
    subBtn.addEventListener('click', ()=>{
      const sym = symInput.value.trim().toUpperCase();
      if (!sym) { status.textContent = 'Enter symbol to subscribe'; return; }
      connect();
      setTimeout(()=>{ try { ws?.send(JSON.stringify({ type:'subscribe', symbol: sym })); } catch {} }, 50);
    });
  }
  if (!(unsubBtn as any)._bound) {
    (unsubBtn as any)._bound = true;
    unsubBtn.addEventListener('click', ()=>{
      const sym = symInput.value.trim().toUpperCase();
      if (!sym) { status.textContent = 'Enter symbol to unsubscribe'; return; }
      if (!ws || !connected) { status.textContent = 'Not connected'; return; }
      try { ws.send(JSON.stringify({ type:'unsubscribe', symbol: sym })); } catch {}
    });
  }
})();

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

// Basic HTML escaper for safe interpolation
function escapeHtml(input: any): string {
  const s = String(input ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

// Orchestrates per-symbol panels: overview, history, news, MC blocks, Yahoo
async function refresh(symbol: string) {
  const sym = String(symbol || (document.getElementById('symbol') as HTMLInputElement | null)?.value || '').trim();
  if (!sym) return;

  // Overview
  try {
    const res = await api.overview(sym);
    const ov = (res?.data ?? res) as any;
    const name = ov?.name || ov?.longName || ov?.shortName || sym;
    const sector = ov?.sector || ov?.Sector || ov?.profile?.sector || '-';
    const industry = ov?.industry || ov?.Industry || ov?.profile?.industry || '-';
    const mcap = ov?.marketCap ?? ov?.marketcap ?? ov?.summaryDetail?.marketCap?.raw;
    const pe = ov?.trailingPE ?? ov?.summaryDetail?.trailingPE?.raw;
    const div = ov?.dividendYield ?? ov?.summaryDetail?.dividendYield?.raw;
    const lines: string[] = [];
    lines.push(`<div class="muted">${escapeHtml(name)}</div>`);
    lines.push(`<div class="mono" style="margin-top:6px">Sector: ${escapeHtml(sector)} | Industry: ${escapeHtml(industry)}</div>`);
    if (mcap != null) lines.push(`<div class="mono" style="margin-top:6px">Market Cap: ${Number(mcap).toLocaleString()}</div>`);
    if (pe != null) lines.push(`<div class="mono" style="margin-top:6px">PE: ${Number(pe).toLocaleString()}</div>`);
    if (div != null) lines.push(`<div class="mono" style="margin-top:6px">Dividend Yield: ${Number(div)}</div>`);
    (document.getElementById('overview') as HTMLElement).innerHTML = `<div class="muted">Overview</div>${lines.join('')}`;
  } catch (e: any) {
    (document.getElementById('overview') as HTMLElement).innerHTML = `<div class="muted">Overview</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // History (simple line chart from close + optional volume)
  try {
    const res = await api.history(sym);
    const arr: any[] = (res?.data ?? res ?? []) as any[];
    const points = (Array.isArray(arr) ? arr : []).map(r => ({ x: r.date || r.t || r.time || r.x, y: Number(r.close ?? r.c ?? r.y) }))
                    .filter(p => p.x != null && isFinite(p.y));
    const volumes = (Array.isArray(arr) ? arr : []).map(r => Number(r.volume ?? r.v ?? 0));
    const chart = renderLineChart(points, { w: 820, h: 200, volumes });
    (document.getElementById('history') as HTMLElement).innerHTML = `<div class="muted">Price History</div><div style="margin-top:8px">${chart}</div>`;
  } catch (e: any) {
    (document.getElementById('history') as HTMLElement).innerHTML = `<div class="muted">Price History</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // News (RAG panel is separate; here we just list fetched articles)
  try {
    const res = await api.news(sym);
    const items: any[] = (res?.data ?? res ?? []) as any[];
    const html = (items || []).slice(0, 10).map((n: any) => {
      const t = n.title || n.headline || '-';
      const s = n.source || n.publisher || '';
      const d = n.publishedAt || n.date || n.time || '';
      const u = n.url || n.link || '';
      return `<div style="margin-top:6px"><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(t)}</a><div class="muted" style="font-size:12px">${escapeHtml(s)} ${escapeHtml(d)}</div></div>`;
    }).join('');
    (document.getElementById('news') as HTMLElement).innerHTML = `<div class="muted">News (RAG)</div>${html || '<div class="muted" style="margin-top:6px">No news</div>'}`;
  } catch (e: any) {
    (document.getElementById('news') as HTMLElement).innerHTML = `<div class="muted">News (RAG)</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // MC Insight
  try {
    const res = await api.mcInsight(sym);
    const d = (res?.data ?? res) as any;
    const safe = escapeHtml(JSON.stringify(d, null, 2));
    (document.getElementById('mcinsight') as HTMLElement).innerHTML = `<div class="muted">MC Insight</div><pre class="mono" style="white-space:pre-wrap;margin-top:6px">${safe}</pre>`;
  } catch (e: any) {
    (document.getElementById('mcinsight') as HTMLElement).innerHTML = `<div class="muted">MC Insight</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // MC Quick
  try {
    const res = await api.mcQuick(sym);
    const d = (res?.data ?? res) as any;
    const safe = escapeHtml(JSON.stringify(d, null, 2));
    (document.getElementById('mcquick') as HTMLElement).innerHTML = `<div class="muted">MC Quick</div><pre class="mono" style="white-space:pre-wrap;margin-top:6px">${safe}</pre>`;
  } catch (e: any) {
    (document.getElementById('mcquick') as HTMLElement).innerHTML = `<div class="muted">MC Quick</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // MC Tech (daily by default). Pivot buttons are repurposed to change frequency D/W/M.
  const renderMcTech = async (freq: 'D'|'W'|'M' = 'D') => {
    try {
      const res = await api.mcTech(sym, freq);
      const d = (res?.data ?? res) as any;
      const safe = escapeHtml(JSON.stringify(d, null, 2));
      (document.getElementById('mctechBody') as HTMLElement).innerHTML = `<pre class="mono" style="white-space:pre-wrap">${safe}</pre>`;
    } catch (e: any) {
      (document.getElementById('mctechBody') as HTMLElement).innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
    }
  };
  await renderMcTech('D');
  // Bind frequency toggle buttons if present (Classic=D, Fibonacci=W, Camarilla=M)
  (document.getElementById('pivotClassic') as HTMLButtonElement | null)?.addEventListener('click', () => { renderMcTech('D'); });
  (document.getElementById('pivotFibo') as HTMLButtonElement | null)?.addEventListener('click', () => { renderMcTech('W'); });
  (document.getElementById('pivotCama') as HTMLButtonElement | null)?.addEventListener('click', () => { renderMcTech('M'); });

  // Yahoo block
  try { await renderYahooForSymbol(sym); } catch {}
}

// Yahoo: reads controls (range, interval, modules) and renders results
async function renderYahooForSymbol(symbol: string) {
  const sym = String(symbol || (document.getElementById('symbol') as HTMLInputElement | null)?.value || '').trim();
  if (!sym) return;
  const body = document.getElementById('yahooDataBody') as HTMLElement | null;
  if (!body) return;

  const rangeSel = document.getElementById('ydRange') as HTMLSelectElement | null;
  const intSel = document.getElementById('ydInterval') as HTMLSelectElement | null;

  const collectModules = () => Array.from(document.querySelectorAll('input[id^="ydm_"]') as NodeListOf<HTMLInputElement>)
    .filter(i => i.checked)
    .map(i => i.id.replace(/^ydm_/, ''))
    .join(',');

  const range = (rangeSel?.value || '1y');
  const interval = (intSel?.value || '1d');
  const modules = collectModules() || 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics';

  body.innerHTML = '<div class="muted">Loading Yahoo data...</div>';
  try {
    const res = await api.yahooFull(sym, range, interval, modules);
    const d = (res?.data ?? res) as any;

    // Attempt to extract a compact summary if common fields exist
    const price = d?.price || d?.quoteSummary?.result?.[0]?.price;
    const sd = d?.summaryDetail || d?.quoteSummary?.result?.[0]?.summaryDetail;
    const ap = d?.assetProfile || d?.quoteSummary?.result?.[0]?.assetProfile;
    const fdata = d?.financialData || d?.quoteSummary?.result?.[0]?.financialData;
    const ks = d?.defaultKeyStatistics || d?.quoteSummary?.result?.[0]?.defaultKeyStatistics;

    const rows: string[] = [];
    if (price) rows.push(`<div>Price: <span class="mono">${escapeHtml(price?.regularMarketPrice?.fmt ?? price?.regularMarketPrice ?? '')}</span></div>`);
    if (sd) rows.push(`<div>MarketCap: <span class="mono">${escapeHtml(sd?.marketCap?.fmt ?? sd?.marketCap ?? '')}</span>, PE: <span class="mono">${escapeHtml(sd?.trailingPE?.fmt ?? sd?.trailingPE ?? '')}</span></div>`);
    if (ap) rows.push(`<div>Sector/Industry: <span class="mono">${escapeHtml(ap?.sector ?? '')}</span> / <span class="mono">${escapeHtml(ap?.industry ?? '')}</span></div>`);
    if (ks) rows.push(`<div>Shares Out: <span class="mono">${escapeHtml(ks?.sharesOutstanding?.fmt ?? ks?.sharesOutstanding ?? '')}</span></div>`);
    if (fdata) rows.push(`<div>Margins/Growth: <span class="mono">GM ${escapeHtml(fdata?.grossMargins?.fmt ?? fdata?.grossMargins ?? '')}, RevG ${escapeHtml(fdata?.revenueGrowth?.fmt ?? fdata?.revenueGrowth ?? '')}</span></div>`);

    const pretty = escapeHtml(JSON.stringify(d, null, 2));
    body.innerHTML = `${rows.length ? `<div class="muted">Summary</div><div style="margin-top:6px">${rows.join('')}</div>` : ''}<div class="muted" style="margin-top:8px">Raw</div><pre class="mono" style="white-space:pre-wrap;margin-top:6px">${pretty}</pre>`;
  } catch (e: any) {
    body.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }

  // Attach change listeners once to auto-refresh on control changes
  const markKey = 'yd-listeners';
  if (!(body as any)[markKey]) {
    const reRender = () => renderYahooForSymbol(sym).catch(()=>{});
    rangeSel?.addEventListener('change', reRender);
    intSel?.addEventListener('change', reRender);
    Array.from(document.querySelectorAll('input[id^="ydm_"]') as NodeListOf<HTMLInputElement>).forEach(cb => {
      cb.addEventListener('change', reRender);
    });
    (body as any)[markKey] = true;
  }
}

// Connectivity: ping core/internal and external endpoints and report status
async function renderConnectivity(symbol: string) {
  const sym = String(symbol || (document.getElementById('symbol') as HTMLInputElement | null)?.value || '').trim();
  const body = document.getElementById('connBody') as HTMLElement | null;
  const hint = document.getElementById('connHint') as HTMLElement | null;
  if (!body) return;

  // Bind the Run Checks button once; resolve symbol at click time
  const btn = document.getElementById('connRun') as HTMLButtonElement | null;
  if (btn && !(btn as any)._bound) {
    (btn as any)._bound = true;
    btn.addEventListener('click', () => {
      const cur = String((document.getElementById('symbol') as HTMLInputElement | null)?.value || sym || '').trim();
      renderConnectivity(cur).catch(()=>{});
    });
  }

  const label = (k: string) => ({
    overview: 'Overview',
    history: 'History',
    news: 'News',
    analyze: 'Analyze',
    yahooFull: 'Yahoo Full',
    mcInsight: 'MC Insight',
    mcQuick: 'MC Quick',
    mcTech: 'MC Tech',
    etIndices: 'ET Indices',
    etSectorPerformance: 'ET Sector Performance',
    tickertapeMmi: 'Tickertape MMI'
  } as any)[k] || k;

  const withTimeout = async <T,>(p: Promise<T>, ms = 8000): Promise<T> => {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms))
    ]) as T;
  };

  const checks: Array<{ key: string; run: () => Promise<any> }> = [
    { key: 'overview', run: () => api.overview(sym) },
    { key: 'history', run: () => api.history(sym) },
    { key: 'news', run: () => api.news(sym) },
    { key: 'analyze', run: () => api.analyze(sym) },
    { key: 'yahooFull', run: () => api.yahooFull(sym, '1mo', '1d', 'price') },
    { key: 'mcInsight', run: () => api.mcInsight(sym) },
    { key: 'mcQuick', run: () => api.mcQuick(sym) },
    { key: 'mcTech', run: () => api.mcTech(sym, 'D') },
    { key: 'etIndices', run: () => api.etIndices() },
    { key: 'etSectorPerformance', run: () => api.etSectorPerformance() },
    { key: 'tickertapeMmi', run: () => api.tickertapeMmi() }
  ];

  body.innerHTML = '<div class="muted">Running connectivity checks...</div>';
  if (hint) hint.textContent = 'Pings external APIs and shows status';

  const started = Date.now();
  const results = await Promise.all(checks.map(async c => {
    const t0 = Date.now();
    try {
      await withTimeout(c.run(), 9000);
      return { key: c.key, ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      return { key: c.key, ok: false, ms: Date.now() - t0, err: String(e?.message || e) };
    }
  }));

  const okCount = results.filter(r => r.ok).length;
  const total = results.length;
  const took = Date.now() - started;
  const rows = results.map(r => {
    const color = r.ok ? '#22c55e' : '#ef4444';
    const status = r.ok ? '[OK]' : '[FAIL]';
    const err = r.ok ? '' : ` <span class="muted">- ${escapeHtml((r as any).err || '')}</span>`;
    return `<div><span style="color:${color}">${status}</span> ${escapeHtml(label(r.key))} <span class="muted">${r.ms} ms</span>${err}</div>`;
  }).join('');

  body.innerHTML = `<div class="muted">Connectivity</div><div style="margin-top:6px">${rows}</div>`;
  if (hint) hint.textContent = `${okCount}/${total} checks passed in ${took} ms`;
}

async function onAnalyze() {
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  if (!symbol) return;
  const res = await api.analyze(symbol);
  (document.getElementById('sentiment')!).innerHTML = `
    <div class="grid-3">
      <div><div class="muted">Sentiment</div><div class="stat">${res.data.sentiment.toFixed(3)}</div></div>
      <div><div class="muted">Predicted Close</div><div class="stat">${res.data.predictedClose.toFixed(2)}</div></div>
      <div><div class="muted">Score</div><div class="stat">${res.data.score} â†’ ${res.data.recommendation}</div></div>
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
      return `<g><title>${date} · Vol ${v.toLocaleString()}</title><rect x="${x.toFixed(1)}" y="${(baseY - bh).toFixed(1)}" width="${Math.max(1, barW-1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#233452"/></g>`;
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
      <g><title>Last â€¢ ${last.y}</title><circle cx="${lastX}" cy="${lastY}" r="3.5" fill="#60a5fa" /></g>
    </svg>`;
}

async function renderMarketOverview() { return renderMarketOverview2(); }
async function renderMarketOverview2() {
  const card = document.getElementById('marketOverview'); if (!card) return;
  try {
  // Beautiful spinner while loading
  card.innerHTML = `
    <div class="muted">Market Overview</div>
    <div style="display:flex;justify-content:center;align-items:center;margin-top:8px;gap:10px">
      <div style="width:44px;height:44px;border-radius:50%;background:conic-gradient(#4dabf7,#8b5cf6,#4dabf7); -webkit-mask:radial-gradient(farthest-side,#0000 calc(100% - 6px),#000 0); animation:spin 1s linear infinite"></div>
      <div class="muted">Loading market overview...</div>
    </div>
    <style>@keyframes spin{to{transform:rotate(1turn)}}</style>
  `;
    const [indicesRes, sectorRes, mmiRes] = await Promise.all([
      api.etIndices().catch(()=>null),
      api.etSectorPerformance().catch(()=>null),
      api.tickertapeMmi().catch(()=>null)
    ]);
    const idx = ((indicesRes as any)?.data?.searchresult || (indicesRes as any)?.data || []).slice(0, 6);
    const mmiVal = (mmiRes as any)?.data?.mmi?.now?.value ?? (mmiRes as any)?.data?.data?.value ?? '-';
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
        const w=120,h=8; const mid=w/2; const span=Math.min(w/2, Math.abs(pct)*(w/2)/3);
        const x = pct>=0 ? mid : (mid - span);
        return `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#233452"/><rect x="${x}" y="0" width="${span}" height="${h}" rx="4" fill="${color}"/></svg>`;
      })();
      return `<div class="card" style="background:#0e1320">
        <div class="muted">${name}</div>
        <div class="mono" style="margin-top:6px;color:${color}">${isFinite(cur)?cur.toLocaleString():cur} (${ch>=0?'+':''}${(ch as any)?.toFixed?ch.toFixed(2):ch}, ${pct>=0?'+':''}${pct}%)</div>
        <div class="muted" style="margin-top:6px">Adv: <strong>${adv}</strong> · Dec: <strong>${dec}</strong></div>
        <div class="muted" style="margin-top:6px;display:flex;align-items:center;gap:8px"><span>Change</span>${changeMeter}</div>
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
      </div>`;
    // Append Top Sectors tiles if available
    try {
      const topSec = ((sectorRes as any)?.data?.searchresult || (sectorRes as any)?.data || []).slice(0,8);
      if (Array.isArray(topSec) && topSec.length) {
        const secWrap = document.createElement('div');
        const tiles = topSec.map((s:any)=>{ const n=s.sector_name||s.name||'-'; const p=Number(s.marketcappercentchange??s.percentChange??0); const c=p>0?'#22c55e':(p<0?'#ef4444':'#9aa7bd'); return `<div class="card" style="background:#0e1320"><div class="muted">${n}</div><div class="mono" style="margin-top:6px;color:${c}">${p>=0?'+':''}${p}%</div></div>`; }).join('');
        secWrap.innerHTML = `<div class="muted" style="margin-top:12px">Top Sectors</div><div class="row" style="margin-top:6px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px">${tiles}</div>`;
        card.appendChild(secWrap);
      }
    } catch {}
    // Modal + cache for constituents
    (window as any)._idxConsCache = (window as any)._idxConsCache || new Map<string, any[]>();
    const consCache: Map<string, any[]> = (window as any)._idxConsCache;
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
    // Bind constituents buttons
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
          const html = `<ul style="padding-left:16px">${(items||[]).map((r:any)=>{ const n=nameFor(r); const p=chFor(r); const c=p>0?'#22c55e':(p<0?'#ef4444':'#9aa7bd'); return `<li>${n} <span style=\"color:${c}\">${p>=0?'+':''}${p}%</span></li>`; }).join('')}</ul>`;
          (document.getElementById('modalBody') as HTMLElement).innerHTML = html || '<div class="muted">No data</div>';
        } catch (e:any) {
          (document.getElementById('modalBody') as HTMLElement).innerHTML = `<span class=\"muted\">Failed to load constituents: ${e?.message || e}</span>`;
        }
      });
    });
    // Bind sector tiles to modal index selection
    const allIdx: any[] = idx;
    Array.from(document.querySelectorAll('#marketOverview .row .card')).forEach((tile:any)=>{
      const titleEl = tile.querySelector('.muted');
      if (!titleEl) return;
      const nm = String(titleEl.textContent||'Sector').trim();
      tile.style.cursor = 'pointer';
      tile.addEventListener('click', ()=>{
        const low = nm.toLowerCase();
        const matches = (allIdx||[]).filter((x:any)=> String(x.indexName||x.index_symbol||'').toLowerCase().includes(low));
        if (!matches.length) {
          openModal(nm, '<div class="muted">No direct index found for this sector. Use the Index cards above to view constituents.</div>');
          return;
        }
        const buttons = matches.map((m:any)=>{ const id = String(m.indexId||m.indexid||''); const name = String(m.indexName||m.index_symbol||'-'); return `<button class=\"btn-sm\" data-modal-idx=\"${id}\">${name}</button>`; }).join(' ');
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




















