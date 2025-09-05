// Lightweight bootstrapping for the demo UI using vanilla TS + Vite.
// If you want a full Angular project, generate one with Angular CLI and port the components/services.

import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

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

    <div id="marketOverview" style="margin-top:16px">
      <div class="muted">Market Overview</div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="card" id="status"><div class="muted">Status</div></div>
      <div class="card" id="overview"><div class="muted">Overview</div></div>
    </div>

    <div class="row" style="margin-top:16px">
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
      <div class="card" id="mcPriceVolume">
        <div class="muted">MC Price Volume</div>
        <div id="mcPvBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="mcStockHistory">
        <div class="muted">MC Stock History</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <select id="mcHistResolution">
            <option value="1D" selected>1D</option>
            <option value="1W">1W</option>
            <option value="1M">1M</option>
          </select>
        </div>
        <div id="mcHistBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="marketsMojo">
        <div class="muted">Markets Mojo Valuation</div>
        <div id="mmBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="trendlyne">
        <div class="muted">Trendlyne Advanced Tech</div>
        <div id="tlBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="trendlyneDerivatives">
        <div class="muted">Trendlyne Derivatives</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <input id="tlDerivDate" type="date" style="flex:1" />
        </div>
        <div id="tlDerivBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="providerResolution">
        <div class="muted">Provider Resolution</div>
        <div id="resolveBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="alphaVantage">
        <div class="muted">AlphaVantage Ingest</div>
        <div id="avBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="yahooIngest">
        <div class="muted">Yahoo Ingest</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <select id="yahooRange">
            <option value="1y" selected>1y</option>
            <option value="6mo">6mo</option>
            <option value="3mo">3mo</option>
            <option value="1mo">1mo</option>
            <option value="5y">5y</option>
          </select>
          <select id="yahooInterval">
            <option value="1d" selected>1d</option>
            <option value="1wk">1wk</option>
            <option value="1mo">1mo</option>
          </select>
        </div>
        <div id="yahooIngestBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="etConstituents">
        <div class="muted">ET Index Constituents</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <input id="etIndexId" placeholder="Index ID (e.g., 26)" style="flex:1" />
        </div>
        <div id="etConsBody" style="margin-top:6px"></div>
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
        <div id="connBody" class="mono" style="margin-top:6px"></div>
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
    console.log('Fetching stock list...');
    const res = await new Api().listStocks();
    console.log('Stock list response:', res);
    
    if (!res || !res.ok || !res.data) {
      throw new Error('Invalid response structure from API');
    }
    
    const data: Array<{name:string,symbol:string,yahoo:string}> = res.data || [];
    console.log('Stock data:', data.length, 'stocks loaded');
    
    if (data.length === 0) {
      throw new Error('No stocks returned from API');
    }
    
    (window as any)._stockListCache = data;
    const baseOption = '<option value="" selected disabled>Select a stock</option>';
    sel.innerHTML = baseOption + data.map(d=>`<option value="${d.yahoo}">${d.name}</option>`).join('');
    
    console.log('Stock dropdown populated with', data.length, 'options');
    
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
      try {
        const overview = await new Api().overview(v);
        const overviewCard = document.getElementById('overview')!;
        if (overview && overview.data) {
          const d = overview.data;
          const changeColor = d.periodChangePct > 0 ? 'var(--success)' : 'var(--danger)';
          overviewCard.innerHTML = `
            <div class="muted">Overview</div>
            <div class="grid-2" style="margin-top:6px; gap: 8px;">
              <div><div class="muted">Last Close</div><div class="stat-sm">${d.lastClose?.toFixed(2) || 'N/A'}</div></div>
              <div><div class="muted">Change %</div><div class="stat-sm" style="color:${changeColor}">${d.periodChangePct?.toFixed(2) || '0'}%</div></div>
            </div>
          `;
        } else {
          overviewCard.innerHTML = `<div class="muted">Overview</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const overviewCard = document.getElementById('overview')!;
        overviewCard.innerHTML = `<div class="muted">Overview</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
      try {
        const history = await new Api().history(v);
        const historyCard = document.getElementById('history')!;
        if (history && history.data && history.data.length > 0) {
          historyCard.innerHTML = `<div class="muted">Price History</div><canvas id="historyChart" style="margin-top:8px; max-height: 220px;"></canvas>`;
          const ctx = (document.getElementById('historyChart') as HTMLCanvasElement)?.getContext('2d');
          if (ctx) {
            new Chart(ctx, {
              type: 'line',
              data: {
                labels: history.data.map((d:any) => d.date.split('T')[0]),
                datasets: [{
                  label: 'Close Price',
                  data: history.data.map((d:any) => d.close),
                  borderColor: 'var(--brand)',
                  borderWidth: 2,
                  fill: false,
                  tension: 0.1,
                  pointRadius: 0,
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: { display: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
                  y: { display: true }
                },
                plugins: { legend: { display: false } }
              }
            });
          }
        } else {
          historyCard.innerHTML = `<div class="muted">Price History</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const historyCard = document.getElementById('history')!;
        historyCard.innerHTML = `<div class="muted">Price History</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
      try {
        const news = await new Api().news(v);
        const newsCard = document.getElementById('news')!;
        if (news && news.data && news.data.length > 0) {
          const items = news.data.slice(0, 5).map((n:any) => `
            <div style="margin-bottom:8px; padding-bottom: 8px; border-bottom: 1px solid var(--border);">
              <a href="${n.url}" target="_blank" style="font-weight:600; font-size: 14px;">${escapeHtml(n.title)}</a>
              <div class="muted" style="font-size:12px; margin-top:4px">${new Date(n.date).toLocaleDateString()}</div>
            </div>
          `).join('');
          newsCard.innerHTML = `<div class="muted">News (RAG)</div><div style="margin-top:8px">${items}</div>`;
        } else {
          newsCard.innerHTML = `<div class="muted">News (RAG)</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const newsCard = document.getElementById('news')!;
        newsCard.innerHTML = `<div class="muted">News (RAG)</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
      try {
        const a = await new Api().analyze(v);
        const sentimentCard = document.getElementById('sentiment')!;
        if (a && a.data) {
          const { sentiment, predictedClose, score, recommendation } = a.data;
          const sentColor = sentiment > 0.1 ? 'var(--success)' : sentiment < -0.1 ? 'var(--danger)' : 'var(--muted)';
          const recoColor = recommendation === 'BUY' ? 'var(--success)' : recommendation === 'SELL' ? 'var(--danger)' : 'var(--muted)';
          
          sentimentCard.innerHTML = `
            <div class="muted">Sentiment & Recommendation</div>
            <div class="grid-3" style="margin-top:6px; text-align: center;">
              <div>
                <div class="muted">Sentiment</div>
                <div class="stat" style="color: ${sentColor}">${sentiment.toFixed(3)}</div>
              </div>
              <div>
                <div class="muted">Predicted Close</div>
                <div class="stat">${predictedClose.toFixed(2)}</div>
              </div>
              <div>
                <div class="muted">Recommendation</div>
                <div class="stat" style="color: ${recoColor}">${score} — ${recommendation}</div>
              </div>
            </div>
          `;
        } else {
          sentimentCard.innerHTML = `<div class="muted">Sentiment & Recommendation</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const sentimentCard = document.getElementById('sentiment')!;
        sentimentCard.innerHTML = `<div class="muted">Sentiment & Recommendation</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
      try {
        const insight = await new Api().mcInsight(v);
        const insightCard = document.getElementById('mcinsight')!;
        if (insight && insight.data) {
          const { shortDesc, longDesc, stockScore } = insight.data;
          insightCard.innerHTML = `
            <div class="muted">MC Insight</div>
            <div style="margin-top:6px">
              <div style="font-weight:600">${escapeHtml(shortDesc || 'N/A')}</div>
              <div class="muted" style="font-size:12px; margin-top:4px">${escapeHtml(longDesc || '')}</div>
              ${stockScore ? `<div style="margin-top:8px">Score: <span class="stat-sm">${stockScore}</span></div>` : ''}
            </div>
          `;
        } else {
          insightCard.innerHTML = `<div class="muted">MC Insight</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const insightCard = document.getElementById('mcinsight')!;
        insightCard.innerHTML = `<div class="muted">MC Insight</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }
      try {
        const quick = await new Api().mcQuick(v);
        const quickCard = document.getElementById('mcquick')!;
        if (quick && quick.data) {
          const d = quick.data;
          quickCard.innerHTML = `
            <div class="muted">MC Quick</div>
            <div class="grid-2" style="margin-top:6px; gap: 8px;">
              <div><div class="muted">Price</div><div class="stat-sm">${d.pricecurrent || 'N/A'}</div></div>
              <div><div class="muted">Change</div><div class="stat-sm" style="color:${(d.change || '').startsWith('-') ? 'var(--danger)' : 'var(--success)'}">${d.change || '0'} (${d.perChange || '0'}%)</div></div>
              <div><div class="muted">Volume</div><div class="stat-sm">${d.volume || 'N/A'}</div></div>
              <div><div class="muted">52W H/L</div><div class="stat-sm">${d['52H'] || ''} / ${d['52L'] || ''}</div></div>
            </div>
          `;
        } else {
          quickCard.innerHTML = `<div class="muted">MC Quick</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
      } catch (e: any) {
        const quickCard = document.getElementById('mcquick')!;
        quickCard.innerHTML = `<div class="muted">MC Quick</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
      }

      // Fetch and render MC Technicals
      renderMcTech(v);

      // Fetch and render MC Price Volume
      renderMcPriceVolume(v);

      // Fetch and render MC Stock History
      renderMcStockHistory(v);
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
    console.error('Failed to load stock list:', e);
    sel.innerHTML = '<option value="" selected disabled>Error loading stocks - check console</option>';
  }
})();

async function renderMcPriceVolume(symbol: string) {
  const pvCard = document.getElementById('mcPvBody')!;
  pvCard.innerHTML = `<div class="muted">Loading...</div>`;
  try {
    const pv = await api.mcPriceVolume(symbol);
    if (pv && pv.data) {
      const d = pv.data;
      pvCard.innerHTML = `
        <div class="grid-2" style="gap: 8px; font-size: 12px;">
          <div><div class="muted">Price</div><div>${d.price_str || 'N/A'}</div></div>
          <div><div class="muted">Volume</div><div>${d.volume_str || 'N/A'}</div></div>
          <div><div class="muted">Bid Price</div><div>${d.bid_price || 'N/A'} (${d.bid_qty || '0'})</div></div>
          <div><div class="muted">Offer Price</div><div>${d.offer_price || 'N/A'} (${d.offer_qty || '0'})</div></div>
        </div>
      `;
    } else {
      pvCard.innerHTML = `<div class="muted">No price/volume data available.</div>`;
    }
  } catch (e: any) {
    pvCard.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

async function renderMcStockHistory(symbol: string, resolution: '1D'|'1W'|'1M' = '1D') {
  const histCard = document.getElementById('mcHistBody')!;
  histCard.innerHTML = `<div class="muted">Loading...</div>`;
  try {
    const hist = await api.mcStockHistory(symbol, resolution);
    if (hist && hist.data) {
      const d = hist.data;
      // Assuming d is an array of history points
      if (Array.isArray(d) && d.length > 0) {
        const rows = d.map((p:any) => `<tr><td>${p.date}</td><td>${p.open}</td><td>${p.high}</td><td>${p.low}</td><td>${p.close}</td><td>${p.volume}</td></tr>`).join('');
        histCard.innerHTML = `
          <table style="width:100%; font-size: 12px;">
            <thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } else if (typeof d === 'object' && d.t) { // Handling TradingView-like response
        const rows = d.t.map((t:any, i:number) => `<tr><td>${new Date(t*1000).toLocaleDateString()}</td><td>${d.o[i]}</td><td>${d.h[i]}</td><td>${d.l[i]}</td><td>${d.c[i]}</td><td>${d.v[i]}</td></tr>`).join('');
        histCard.innerHTML = `
          <table style="width:100%; font-size: 12px;">
            <thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } else {
        histCard.innerHTML = `<div class="muted">No history data available.</div>`;
      }
    } else {
      histCard.innerHTML = `<div class="muted">No history data available.</div>`;
    }
  } catch (e: any) {
    histCard.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

async function renderMcTech(symbol: string, pivotType = 'classic') {
  const techCard = document.getElementById('mctechBody')!;
  techCard.innerHTML = `<div class="muted">Loading technicals...</div>`;
  try {
    // Note: The API seems to use a different parameter for pivot types than the button names suggest.
    // The backend route will need to handle mapping 'classic', 'fibo', etc. to what the MC API expects.
    // For now, we'll just pass the frequency. The pivot buttons are illustrative.
    const tech = await api.mcTech(symbol, 'D');
    if (tech && tech.data) {
      const d = tech.data;
      const sentimentColor = d.sentiments?.indication === 'Bullish' ? 'var(--success)' : d.sentiments?.indication === 'Bearish' ? 'var(--danger)' : 'var(--muted)';
      
      const indicatorsHtml = (d.indicators || []).map(i => `<tr><td>${escapeHtml(i.displayName)}</td><td>${escapeHtml(i.value)}</td><td style="color:${i.indication === 'Bullish' ? 'var(--success)' : i.indication === 'Bearish' ? 'var(--danger)' : 'var(--muted)'}">${escapeHtml(i.indication || '')}</td></tr>`).join('');
      const smaHtml = (d.sma || []).map(s => `<tr><td>SMA ${escapeHtml(s.key)}</td><td>${escapeHtml(s.value)}</td><td style="color:${s.indication === 'Bullish' ? 'var(--success)' : s.indication === 'Bearish' ? 'var(--danger)' : 'var(--muted)'}">${escapeHtml(s.indication || '')}</td></tr>`).join('');
      const emaHtml = (d.ema || []).map(e => `<tr><td>EMA ${escapeHtml(e.key)}</td><td>${escapeHtml(e.value)}</td><td style="color:${e.indication === 'Bullish' ? 'var(--success)' : e.indication === 'Bearish' ? 'var(--danger)' : 'var(--muted)'}">${escapeHtml(e.indication || '')}</td></tr>`).join('');

      techCard.innerHTML = `
        <div style="font-weight:600; color: ${sentimentColor}; margin-bottom: 8px;">
          Sentiment: ${escapeHtml(d.sentiments?.indication || 'N/A')}
          (${d.sentiments?.totalBullish} Bullish, ${d.sentiments?.totalNeutral} Neutral, ${d.sentiments?.totalBearish} Bearish)
        </div>
        <table style="width:100%; font-size: 12px;">
          <thead><tr><th>Indicator</th><th>Value</th><th>Indication</th></tr></thead>
          <tbody>
            ${indicatorsHtml}
            ${smaHtml}
            ${emaHtml}
          </tbody>
        </table>
      `;
    } else {
      techCard.innerHTML = `<div class="muted">No technical data available.</div>`;
    }
  } catch (e: any) {
    techCard.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Define the type for the market overview data
interface MarketOverviewItem {
  indexName: string;
  advances: number;
  declines: number;
  currentIndexValue: number;
  highIndexValue: number;
  lowIndexValue: number;
  fiftyTwoWeekHighIndexValue: number;
  fiftyTwoWeekLowIndexValue: number;
  netChange: number;
  perChange: number;
}

async function fetchMarketOverview(): Promise<MarketOverviewItem[]> {
  console.log('Fetching market overview data from ET APIs...');
  try {
    const response = await fetch(
      'https://etmarketsapis.indiatimes.com/ET_Stats/getAllIndices?exchange=nse&sortby=value&sortorder=desc&pagesize=100'
    );
    const data = await response.json();

    if (!data || !data.searchresult) {
      throw new Error('Invalid response structure');
    }

    return data.searchresult.map((item: any) => ({
      indexName: item.indexName,
      advances: item.advances,
      declines: item.declines,
      currentIndexValue: item.currentIndexValue,
      highIndexValue: item.highIndexValue,
      lowIndexValue: item.lowIndexValue,
      fiftyTwoWeekHighIndexValue: item.fiftyTwoWeekHighIndexValue,
      fiftyTwoWeekLowIndexValue: item.fiftyTwoWeekLowIndexValue,
      netChange: item.netChange,
      perChange: item.perChange,
    }));
  } catch (error) {
    console.error('Error fetching market overview data:', error);
    return [];
  }
}

async function renderMarketOverview() {
  const overviewCard = document.getElementById('marketOverview');
  if (!overviewCard) return;

  try {
    const data = await fetchMarketOverview();
    // Sort data by percentage change (high to low)
    data.sort((a, b) => b.perChange - a.perChange);

    overviewCard.style.display = 'grid';
    overviewCard.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
    overviewCard.style.gap = '12px';

    overviewCard.innerHTML = data
      .map(
        (item) => {
          const isPositive = item.netChange >= 0;
          const changeColor = isPositive ? '#28a745' : '#dc3545';

          return `
          <div class="flip-card" style="height: 160px;" onclick="console.log('Card for ${item.indexName} clicked')">
            <div class="flip-card-inner">
              <div class="flip-card-front" style="border-left: 4px solid ${changeColor}; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <h3 style="font-size: 16px; font-weight: 600; color: #333; margin: 0 0 10px 0;">${item.indexName}</h3>
                <div style="font-size: 14px; font-weight: 700; color: ${changeColor};">
                  ${isPositive ? '▲' : '▼'} ${item.netChange.toFixed(2)} (${item.perChange.toFixed(2)}%)
                </div>
                <div style="font-size: 14px; color: #555; margin-top: 10px;">
                  <strong>Current:</strong> ${item.currentIndexValue.toFixed(2)}
                </div>
              </div>
              <div class="flip-card-back">
                <h4 style="font-size: 14px; font-weight: 600; color: #333; margin: 0 0 10px 0;">${item.indexName} Details</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; color: #555; text-align: left;">
                  <div><strong>Advances:</strong> <span style="color: #28a745;">${item.advances}</span></div>
                  <div><strong>Declines:</strong> <span style="color: #dc3545;">${item.declines}</span></div>
                  <div><strong>High:</strong> ${item.highIndexValue.toFixed(2)}</div>
                  <div><strong>Low:</strong> ${item.lowIndexValue.toFixed(2)}</div>
                  <div><strong>52W H:</strong> ${item.fiftyTwoWeekHighIndexValue.toFixed(2)}</div>
                  <div><strong>52W L:</strong> ${item.fiftyTwoWeekLowIndexValue.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        `;
        }
      )
      .join('');
  } catch (error) {
    console.error('Error rendering market overview:', error);
    overviewCard.innerHTML = '<p style="color: #dc3545;">Error loading market overview. Please try again later.</p>';
  }
}

// Refresh market overview every 5 seconds
setInterval(renderMarketOverview, 5000);

// Wire up MC history resolution change
const mcHistResSelect = document.getElementById('mcHistResolution') as HTMLSelectElement;
mcHistResSelect.addEventListener('change', () => {
  const symbol = (document.getElementById('stockSelect') as HTMLSelectElement).value;
  if (symbol) {
    renderMcStockHistory(symbol, mcHistResSelect.value as '1D'|'1W'|'1M');
  }
});

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}




















