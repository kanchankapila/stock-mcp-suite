// Lightweight bootstrapping for the demo UI using vanilla TS + Vite.
// If you want a full Angular project, generate one with Angular CLI and port the components/services.

import { Api } from './app/services/api.service';

const api = new Api('http://localhost:4010');

const root = document.getElementById('app')!;
root.innerHTML = `
  <div class="container">
    <div class="card">
      <div class="flex">
        <select id="stockSelect" style="min-width:260px">
          <option value="" selected disabled>— Select a stock —</option>
        </select>
        <input id="symbol" placeholder="Enter stock symbol (e.g., AAPL)" />
        <button id="ingest">Ingest</button>
        <button id="analyze">Analyze</button>
        <button id="dbstatsBtn">DB Data</button>
      </div>
      <div class="muted" style="margin-top:8px">Pulls prices & news (sample data if keys missing), then runs sentiment, prediction, strategy & backtest.</div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="card" id="status"><div class="muted">Status</div></div>
      <div class="card" id="overview"><div class="muted">Overview</div></div>
      <div class="card" id="sentiment"><div class="muted">Sentiment & Recommendation</div></div>
      <div class="card" id="mcinsight"><div class="muted">MC Insight</div></div>
      <div class="card" id="history" style="grid-column: span 2"><div class="muted">Price History</div></div>
      <div class="card" id="news" style="grid-column: span 2"><div class="muted">News (RAG)</div></div>
      <div class="card" id="dbstats" style="grid-column: span 2"><div class="muted">DB Data</div></div>
      <div class="card" id="agent" style="grid-column: span 2">
        <div class="muted">Agent Q&A</div>
        <div class="flex" style="margin-top:8px">
          <input id="agentq" placeholder="Ask about the stock (e.g., Why did AAPL move?)" style="flex:1" />
          <button id="ask">Ask</button>
        </div>
        <pre class="mono" id="agentAnswer" style="white-space:pre-wrap; margin-top:8px"></pre>
      </div>
    </div>
  </div>
`;

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
    const points = hist.data.map((p:any)=>({x: p.date, y: p.close}));
    (document.getElementById('history')!).innerHTML = `
      <div class="muted">Price History (close)</div>
      <div class="mono" style="font-size:12px; opacity:0.8; margin-top:8px; max-height:240px; overflow:auto;">${
        points.map(pt=>`${pt.x}: ${pt.y}`).join('\n')
      }</div>
    `;
    const news = await api.news(symbol);
    (document.getElementById('news')!).innerHTML = `
      <div class="muted">Latest News</div>
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
    (document.getElementById('status')!).innerHTML = `<div class="muted">Status</div>`;
  } catch (e:any) {
    (document.getElementById('overview')!).innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

document.getElementById('ingest')!.addEventListener('click', onIngest);
document.getElementById('analyze')!.addEventListener('click', onAnalyze);
document.getElementById('ask')!.addEventListener('click', async ()=>{
  const q = (document.getElementById('agentq') as HTMLInputElement).value;
  const symbol = (document.getElementById('symbol') as HTMLInputElement).value.trim().toUpperCase();
  const res = await api.agent(q, symbol);
  (document.getElementById('agentAnswer')!).textContent = res.answer;
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

async function populateDropdown() {
  try {
    const res = await api.listStocks();
    const data: Array<{name:string, symbol:string, yahoo:string}> = res.data || [];
    const sel = document.getElementById('stockSelect') as HTMLSelectElement;
    if (!sel) return;
    sel.innerHTML = '<option value="" selected disabled>— Select a stock —</option>' +
      data.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
    sel.addEventListener('change', ()=>{
      const v = sel.value;
      (document.getElementById('symbol') as HTMLInputElement).value = v;
    });
  } catch {
    // ignore
  }
}

populateDropdown();
