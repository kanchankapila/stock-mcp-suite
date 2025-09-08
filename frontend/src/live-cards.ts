import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

type LiveTimers = { quote?: any; mcvol?: any };
const timers: LiveTimers = {};
let ws: WebSocket | null = null;
let currentSymbol = '';
let sparkChart: Chart | null = null;
const sparkPoints: Array<{ t: number; v: number }> = [];
let latestBidAsk: { bid?: number|null; ask?: number|null } = {};
// Compact delivery gauge + PV cache across HMR
let miniGauge: Chart | null = null;
let mcPvCache: Map<string, any>;
try {
  // @ts-ignore
  mcPvCache = (window as any).__mcPvCache instanceof Map ? (window as any).__mcPvCache : new Map<string, any>();
  // @ts-ignore
  (window as any).__mcPvCache = mcPvCache;
} catch {
  mcPvCache = new Map<string, any>();
}

function serverWsUrl(): string {
  try {
    const loc: any = window.location;
    const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
    const host = loc.hostname || 'localhost';
    const port = (loc.port && Number(loc.port)) ? loc.port : '4010';
    return `${proto}://${host}:${port}/ws`;
  } catch {
    return 'ws://localhost:4010/ws';
  }
}

function ensureCompactCards() {
  const overview = document.getElementById('overview');
  if (!overview) return;
  const row = overview.parentElement;
  if (!row) return;
  // Live Quote card
  if (!document.getElementById('liveQuote')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'liveQuote';
    card.innerHTML = `
      <div class="muted" style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <span>Live Quote</span>
        <div style="display:flex; gap:6px; align-items:center; font-size:12px">
          <label class="muted">Mode:</label>
          <select id="liveMode" style="padding:2px 6px; font-size:12px">
            <option value="mixed">Chart+Live</option>
            <option value="ws">WS only</option>
          </select>
        </div>
      </div>
      <div id="liveQuoteBody" style="margin-top:6px">
        <div class="muted">Waiting for symbol...</div>
      </div>`;
    row.appendChild(card);
    const sel = document.getElementById('liveMode') as HTMLSelectElement | null;
    if (sel) {
      sel.value = liveMode;
      sel.addEventListener('change', () => {
        liveMode = (sel.value === 'ws') ? 'ws' : 'mixed';
        try { localStorage.setItem('liveQuoteMode', liveMode); } catch {}
        if (liveMode === 'mixed' && currentSymbol) seedFromYahooChart(currentSymbol);
      });
    }
  }
  // MC Volume card
  if (!document.getElementById('mcVolumeCard')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'mcVolumeCard';
    card.innerHTML = `
      <div class="muted">MC Volume</div>
      <div id="mcVolumeBody" style="margin-top:6px">
        <div class="muted">Waiting for symbol...</div>
      </div>`;
    row.appendChild(card);
  }
  // Options Sentiment card
  if (!document.getElementById('optionsSentimentCard')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'optionsSentimentCard';
    card.innerHTML = `
      <div class="muted">Options Sentiment</div>
      <div id="optionsSentimentBody" style="margin-top:6px">
        <div class="muted">Waiting for symbol...</div>
      </div>`;
    row.appendChild(card);
  }
}

function renderSparkline(containerId: string, labels: string[], values: number[]) {
  const body = document.getElementById(containerId);
  if (!body) return;
  if (!document.getElementById('liveSparkCanvas')) {
    const c = document.createElement('canvas');
    c.id = 'liveSparkCanvas';
    c.style.maxHeight = '110px';
    c.style.marginTop = '6px';
    body.appendChild(c);
  }
  const ctx = (document.getElementById('liveSparkCanvas') as HTMLCanvasElement)?.getContext('2d');
  if (!ctx) return;
  if (sparkChart) { sparkChart.destroy(); sparkChart = null; }
  // choose color based on trend (last - first)
  let line = '#2d6cdf', fill = 'rgba(45,108,223,0.12)';
  if (values && values.length > 1) {
    const delta = Number(values[values.length - 1]) - Number(values[0]);
    if (Number.isFinite(delta)) {
      if (delta > 0) { line = getCss('--success') || '#16a34a'; fill = 'rgba(22,163,74,0.12)'; }
      if (delta < 0) { line = getCss('--danger') || '#ef4444'; fill = 'rgba(239,68,68,0.12)'; }
    }
  }
  sparkChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: line, backgroundColor: fill, borderWidth: 2, fill: true, tension: 0.25, pointRadius: 0 }] },
    options: { plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

function updateLiveQuoteCard(symbol: string, price: number, isoTime?: string) {
  const body = document.getElementById('liveQuoteBody');
  if (!body) return;
  const priceTxt = Number.isFinite(price) ? price.toFixed(2) : 'N/A';
  const timeTxt = isoTime ? new Date(isoTime).toLocaleTimeString() : '';
  const bidTxt = (latestBidAsk.bid!=null && Number.isFinite(Number(latestBidAsk.bid))) ? Number(latestBidAsk.bid).toFixed(2) : 'N/A';
  const askTxt = (latestBidAsk.ask!=null && Number.isFinite(Number(latestBidAsk.ask))) ? Number(latestBidAsk.ask).toFixed(2) : 'N/A';
  body.innerHTML = `
    <div class="grid-2" style="gap:8px; font-size:12px">
      <div><div class="muted">Symbol</div><div>${escapeHtml(symbol)}</div></div>
      <div><div class="muted">Price</div><div class="stat-sm">${priceTxt}</div></div>
    </div>
    <div class="grid-2" style="gap:8px; font-size:12px; margin-top:6px">
      <div><div class="muted">Bid</div><div>${bidTxt}</div></div>
      <div><div class="muted">Ask</div><div>${askTxt}</div></div>
    </div>
    <div class="muted" style="font-size:11px; margin-top:6px">${escapeHtml(timeTxt)}</div>`;
  // append sparkline (renderSparkline will ensure canvas)
  const maxN = sparkWindowSize();
  const t = Date.now();
  if (Number.isFinite(price)) sparkPoints.push({ t, v: price });
  while (sparkPoints.length > maxN) sparkPoints.shift();
  const labels = sparkPoints.map(p=> new Date(p.t).toLocaleTimeString());
  const values = sparkPoints.map(p=> p.v);
  renderSparkline('liveQuoteBody', labels, values);
}

function getYahooControls() {
  const rSel = document.getElementById('ydRange') as HTMLSelectElement | null;
  const iSel = document.getElementById('ydInterval') as HTMLSelectElement | null;
  const range = rSel?.value || localStorage.getItem('yahoo:range') || '1y';
  const interval = iSel?.value || localStorage.getItem('yahoo:interval') || '1d';
  return { range, interval };
}

function sparkWindowSize(): number {
  const { interval } = getYahooControls();
  if (interval === '1m' || interval === '5m' || interval === '15m') return 180;
  if (interval === '1d') return 120;
  return 120;
}

function getCss(varName: string): string | null {
  try { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || null; } catch { return null; }
}

async function seedFromYahooChart(symbol: string) {
  // Fetch chart + summaryDetail (bid/ask)
  const { range, interval } = getYahooControls();
  try {
    const r = await new Api().yahooFull(symbol, range, interval, 'price,summaryDetail');
    // bid/ask from summaryDetail
    try {
      const sd = r?.data?.summary?.quoteSummary?.result?.[0]?.summaryDetail || {};
      const bid = Number(sd?.bid?.raw ?? sd?.bid ?? NaN);
      const ask = Number(sd?.ask?.raw ?? sd?.ask ?? NaN);
      latestBidAsk = {
        bid: Number.isFinite(bid) ? bid : null,
        ask: Number.isFinite(ask) ? ask : null
      };
    } catch {}
    // chart sparkline
    try {
      const c = r?.data?.chart || {};
      const ts: number[] = Array.isArray(c?.timestamp) ? c.timestamp : [];
      const q = c?.indicators?.quote?.[0] || {};
      const closes: number[] = Array.isArray(q?.close) ? q.close : [];
      sparkPoints.length = 0;
      const maxN = sparkWindowSize();
      for (let i = Math.max(0, ts.length - maxN); i < ts.length; i++) {
        const t = ts[i]; const v = Number(closes[i]);
        if (Number.isFinite(t) && Number.isFinite(v)) sparkPoints.push({ t: t*1000, v });
      }
      const labels = sparkPoints.map(p=> new Date(p.t).toLocaleTimeString());
      const values = sparkPoints.map(p=> p.v);
      renderSparkline('liveQuoteBody', labels, values);
    } catch {}
  } catch {}
}

function connectWs(symbol: string) {
  // Close previous
  try { ws?.close(); } catch {}
  ws = null;
  sparkPoints.length = 0;
  // seed from chart per current range/interval (only in mixed mode)
  if (liveMode === 'mixed') seedFromYahooChart(symbol);
  // Build URL
  const url = serverWsUrl();
  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: 'subscribe', symbol }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data || ''));
        if (msg && msg.type === 'quote' && String(msg.symbol || '').toUpperCase() === symbol.toUpperCase()) {
          const price = Number(msg.price ?? NaN);
          updateLiveQuoteCard(symbol, price, String(msg.time || ''));
        }
      } catch {}
    };
    ws.onclose = () => {
      // simple retry after pause
      setTimeout(() => { if (currentSymbol === symbol) connectWs(symbol); }, 3000);
    };
  } catch {
    // fallback: poll yahooFull each 10s
    if (timers.quote) { try { clearInterval(timers.quote); } catch {} }
    const fetchQuote = async () => {
      try {
        const { range, interval } = getYahooControls();
        const r = await new Api().yahooFull(symbol, range, interval, 'price,summaryDetail');
        const q = r?.data?.quote;
        const price = Number(q?.price ?? NaN);
        const time = String(q?.time || '');
        // capture bid/ask too
        try {
          const sd = r?.data?.summary?.quoteSummary?.result?.[0]?.summaryDetail || {};
          const bid = Number(sd?.bid?.raw ?? sd?.bid ?? NaN);
          const ask = Number(sd?.ask?.raw ?? sd?.ask ?? NaN);
          latestBidAsk = { bid: Number.isFinite(bid) ? bid : null, ask: Number.isFinite(ask) ? ask : null };
        } catch {}
        updateLiveQuoteCard(symbol, price, time);
      } catch {}
    };
    fetchQuote();
    timers.quote = setInterval(fetchQuote, 10_000);
  }
}

async function renderMcVolumeCompact(symbol: string) {
  const el = document.getElementById('mcVolumeBody');
  if (!el) return;
  el.innerHTML = '<div class="muted">Loading...</div>';
  try {
    const pv = await new Api().mcPriceVolume(symbol);
    const mc = pv?.data ?? pv; // route wraps {ok:true,data}
    const spv = mc?.stock_price_volume_data
             ?? mc?.stockPriceVolumeData
             ?? mc?.data?.stock_price_volume_data
             ?? mc?.data?.stockPriceVolumeData
             ?? {};
    try { console.debug('MC PriceVolume shape', { symbol, pv }); } catch {}
    const today = spv?.volume?.Today || {};
    const yday = spv?.volume?.Yesterday || {};
    const t = Number(today.cvol ?? NaN);
    const y = Number(yday.cvol ?? NaN);
    const todayTxt = today.cvol_display_text || (Number.isFinite(t) ? String(t) : 'N/A');
    const ydayTxt = yday.cvol_display_text || (Number.isFinite(y) ? String(y) : 'N/A');
    let change = 'N/A';
    let color = 'var(--muted)';
    if (Number.isFinite(t) && Number.isFinite(y) && y > 0) {
      const pct = ((t - y) / y) * 100;
      change = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      color = pct >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    const savedTf = (()=>{ try { return localStorage.getItem('mcVol:gaugeTf') || 'Today'; } catch { return 'Today'; } })();
    const html = `
      <div class="grid-3" style="gap:8px; font-size:12px">
        <div><div class="muted">Today</div><div class="stat-sm">${todayTxt}</div></div>
        <div><div class="muted">Yesterday</div><div class="stat-sm">${ydayTxt}</div></div>
        <div><div class="muted">Change</div><div class="stat-sm" style="color:${color}">${change}</div></div>
      </div>
      <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; gap:8px">
        <div class="muted">Delivery Gauge</div>
        <div>
          <select id="mcGaugeTf" style="padding:2px 6px; font-size:12px">
            <option value="Today" ${savedTf==='Today'?'selected':''}>Today</option>
            <option value="1 Week Avg" ${savedTf==='1 Week Avg'?'selected':''}>1W Avg</option>
            <option value="1 Month Avg" ${savedTf==='1 Month Avg'?'selected':''}>1M Avg</option>
          </select>
        </div>
      </div>
      <div style="margin-top:4px"><canvas id="mcVolGauge" width="120" height="120"></canvas></div>
      <div class="muted" style="font-size:11px; margin-top:6px">Source: /api/external/mc/price-volume?symbol=${escapeHtml(symbol)}</div>
    `;
    el.innerHTML = html;
    renderCompactGauge(symbol);
    const tfSel = document.getElementById('mcGaugeTf') as HTMLSelectElement | null;
    if (tfSel) {
      tfSel.addEventListener('change', () => {
        try { localStorage.setItem('mcVol:gaugeTf', tfSel.value); } catch {}
        renderCompactGauge(symbol);
      });
    }
    // Also populate/update the main MC Price Volume card body if present
    const big = document.getElementById('mcPvBody');
    if (big) {
      // Build richer layout with chart and performance grid if available
      const perf = spv?.price || {};
      const perfKeys = Object.keys(perf || {});
      const perfHtml = perfKeys.length ? `
        <div class="muted" style="margin-top:8px">Performance</div>
        <div class="grid-3" style="gap:6px; font-size:12px; margin-top:4px">
          ${perfKeys.map((k:any)=>{
            const n = Number((perf as any)[k]);
            const col = Number.isFinite(n) ? (n>=0? 'var(--success)':'var(--danger)') : 'var(--muted)';
            const sign = Number.isFinite(n) && n>=0 ? '+' : '';
            return `<div style=\"background:var(--panel-2); padding:6px; border-radius:8px; text-align:center; border:1px solid var(--border)\"><div class=\"muted\">${k}</div><div style=\"color:${col}\">${Number.isFinite(n)?`${sign}${n}%`:'N/A'}</div></div>`;
          }).join('')}
        </div>` : '';
      // Delivery and order book (if present)
      const oneWeek: any = (spv?.volume && (spv.volume['1 Week Avg'] || spv.volume['1 Week'])) || {};
      const oneMonth: any = (spv?.volume && (spv.volume['1 Month Avg'] || spv.volume['1 Month'])) || {};
      const deliveryToday = today?.delivery_display_text || (Number.isFinite(Number(today?.delivery)) ? String(today.delivery) : 'N/A');
      const deliveryWeek = oneWeek?.delivery_display_text || (Number.isFinite(Number(oneWeek?.delivery)) ? String(oneWeek.delivery) : 'N/A');
      const deliveryMonth = oneMonth?.delivery_display_text || (Number.isFinite(Number(oneMonth?.delivery)) ? String(oneMonth.delivery) : 'N/A');
      const deliveryTodayTitle = String(today?.delivery_tooltip_text || '').replace(/\"/g,'&quot;');
      const deliveryWeekTitle = String(oneWeek?.delivery_tooltip_text || '').replace(/\"/g,'&quot;');
      const deliveryMonthTitle = String(oneMonth?.delivery_tooltip_text || '').replace(/\"/g,'&quot;');
      // Derive delivery percent for Today (parse like "41L (53.32%)")
      let todayPct = NaN; try { const m = String(deliveryToday).match(/\(([^%]+)%\)/); if (m) todayPct = Number(m[1]); } catch {}
      const bidArr: Array<any> = (spv as any)?.bid_offer?.bid || [];
      const offerArr: Array<any> = (spv as any)?.bid_offer?.offer || [];
      const bookHtml = (Array.isArray(bidArr) || Array.isArray(offerArr)) ? `
        <div class="muted" style="margin-top:8px">Order Book (Top)</div>
        <table style="width:100%; font-size:12px; margin-top:4px">
          <thead><tr><th style="text-align:left">Bid</th><th style="text-align:right">Qty</th><th style="width:10px"></th><th style="text-align:left">Ask</th><th style="text-align:right">Qty</th></tr></thead>
          <tbody>
            ${[0,1,2].map(i=>{
              const b = (bidArr||[])[i] || {}; const o = (offerArr||[])[i] || {};
              const bp = (b?.price!=null)? b.price : '-'; const bq = (b?.qty!=null)? b.qty : '-';
              const op = (o?.price!=null)? o.price : '-'; const oq = (o?.qty!=null)? o.qty : '-';
              return `<tr><td>${bp}</td><td style=\"text-align:right\">${bq}</td><td></td><td>${op}</td><td style=\"text-align:right\">${oq}</td></tr>`;
            }).join('')}
          </tbody>
        </table>` : '';

      big.innerHTML = `
        <div class="grid-2" style="gap: 8px; font-size: 12px; align-items:center">
          <div>
            <div class="muted">Volume (Today vs Yesterday)</div>
            <canvas id="mcPvChart" style="max-height:120px; margin-top:6px"></canvas>
            ${perfHtml}
            <div class="muted" style="margin-top:8px">Delivery</div>
            <div class="grid-3" style="gap:10px; font-size:12px; margin-top:4px">
              <div><div class="muted">Today</div><div title="${deliveryTodayTitle}">${deliveryToday}</div></div>
              <div><div class="muted">1W Avg</div><div title="${deliveryWeekTitle}">${deliveryWeek}</div></div>
              <div><div class="muted">1M Avg</div><div title="${deliveryMonthTitle}">${deliveryMonth}</div></div>
            </div>
            <div style="margin-top:8px">
              <canvas id="mcDelGauge" width="140" height="140"></canvas>
              <div class="muted" style="font-size:11px; text-align:center; margin-top:4px">Delivery % (Today)</div>
            </div>
            ${bookHtml}
          </div>
          <div>
            <div><div class="muted">Volume</div><div>${todayTxt}</div></div>
          </div>
        </div>
        <div class="muted" style="font-size:11px; margin-top:6px">Source: /api/external/mc/price-volume?symbol=${escapeHtml(symbol)}</div>
      `;
      const ctx = (document.getElementById('mcPvChart') as HTMLCanvasElement)?.getContext('2d');
      if (ctx) {
        const tVal = Number(today.cvol || 0);
        const yVal = Number(yday.cvol || 0);
        try {
          new Chart(ctx, { type: 'bar', data: { labels: ['Today','Yesterday'], datasets: [{ data: [tVal, yVal], backgroundColor: ['#3b82f6', '#94a3b8'], borderWidth: 0 }] }, options: { plugins: { legend: { display:false }, tooltip: { callbacks: { label: (tt:any) => `${tt.label}: ${tt.parsed.y}` } } }, scales: { x: { grid: { display:false } }, y: { grid: { color: 'rgba(37,49,73,0.4)' }, ticks: { display: false } } } } });
        } catch {}
      }
      // Delivery gauge
      const gctx = (document.getElementById('mcDelGauge') as HTMLCanvasElement)?.getContext('2d');
      if (gctx && Number.isFinite(todayPct)) {
        try {
          const pct = Math.max(0, Math.min(100, todayPct));
          new Chart(gctx, { type: 'doughnut', data: { labels: ['Delivery','Others'], datasets: [{ data: [pct, 100-pct], backgroundColor: ['#16a34a', '#e5e7eb'], borderWidth: 0 }] }, options: { cutout: '70%', plugins: { legend: { display:false }, tooltip: { callbacks: { label: (tt:any)=> `${tt.label}: ${tt.parsed}%` } } } } });
        } catch {}
      }
    }
  } catch (e: any) {
    el.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
    const big = document.getElementById('mcPvBody');
    if (big) big.innerHTML = el.innerHTML;
  }
}

async function renderOptionsSentiment(symbol: string) {
  const el = document.getElementById('optionsSentimentBody');
  if (!el) return;
  el.innerHTML = '<div class="muted">Loading...</div>';
  try {
    const r = await new Api().optionsMetrics(symbol, 90, 180);
    const latest = r?.data?.latest || null;
    if (!latest) { el.innerHTML = '<div class="muted">No options data</div>'; return; }
    const pcr = Number(latest.pcr ?? NaN);
    const pvr = Number(latest.pvr ?? NaN);
    const bias = Number(latest.bias ?? NaN); // [-1,1]
    const pcrTxt = Number.isFinite(pcr) ? pcr.toFixed(2) : 'N/A';
    const pvrTxt = Number.isFinite(pvr) ? pvr.toFixed(2) : 'N/A';
    const biasTxt = Number.isFinite(bias) ? bias.toFixed(2) : 'N/A';
    const biasPct = Number.isFinite(bias) ? Math.round(((bias + 1) / 2) * 100) : null; // 0..100
    const biasColor = Number.isFinite(bias) ? (bias >= 0 ? (getCss('--success') || '#16a34a') : (getCss('--danger') || '#ef4444')) : (getCss('--muted') || '#6b7280');
    const barBg = getCss('--panel-2') || '#f3f4f6';
    const barBorder = getCss('--border') || '#e5e7eb';
    el.innerHTML = `
      <div class="grid-2" style="gap:8px; font-size:12px">
        <div><div class="muted">PCR</div><div class="stat-sm">${pcrTxt}</div></div>
        <div><div class="muted">PVR</div><div class="stat-sm">${pvrTxt}</div></div>
      </div>
      <div class="muted" style="margin-top:6px">Bias</div>
      <div style="position:relative; width:100%; height:12px; background:${barBg}; border:1px solid ${barBorder}; border-radius:999px; overflow:hidden" title="-1 (bearish) to +1 (bullish)">
        ${Number.isFinite(bias) ? `<div style=\"position:absolute; left:0; top:0; bottom:0; width:${biasPct}% ; background:${biasColor}\"></div>` : ''}
      </div>
      <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:2px" class="muted">
        <span>-1</span><span>${biasTxt}</span><span>+1</span>
      </div>
      <div class="muted" style="font-size:11px; margin-top:6px">Source: options chain (nearest expiry)</div>
    `;
  } catch (e:any) {
    el.innerHTML = `<div class="mono" style="color:#ff6b6b">${String(e?.message || e)}</div>`;
  }
}

function startOptionsSentimentCard(symbol: string) {
  const tick = () => { renderOptionsSentiment(symbol); };
  tick();
  // refresh every 60s
  try { setInterval(tick, 60_000); } catch {}
}

function startMcVolumeCompact(symbol: string) {
  if (timers.mcvol) { try { clearInterval(timers.mcvol); } catch {} }
  renderMcVolumeCompact(symbol);
  timers.mcvol = setInterval(() => renderMcVolumeCompact(symbol), 60_000);
}

function renderCompactGauge(symbol: string) {
  const spv = mcPvCache.get(symbol) || {};
  const vol = spv?.volume || {};
  const tfSel = document.getElementById('mcGaugeTf') as HTMLSelectElement | null;
  const tf = tfSel?.value || (()=>{ try { return localStorage.getItem('mcVol:gaugeTf') || 'Today'; } catch { return 'Today'; } })();
  const bucket = (tf === 'Today') ? (vol['Today'] || {})
                : (tf === '1 Week Avg') ? (vol['1 Week Avg'] || vol['1 Week'] || {})
                : (vol['1 Month Avg'] || vol['1 Month'] || {});
  const pct = parseDeliveryPercent(bucket?.delivery_display_text) ?? (Number.isFinite(Number(bucket?.delivery)) ? Number(bucket.delivery) : null);
  const ctx = (document.getElementById('mcVolGauge') as HTMLCanvasElement)?.getContext('2d');
  if (!ctx) return;
  if (miniGauge) { try { miniGauge.destroy(); } catch {} miniGauge = null; }
  if (pct==null) { try { ctx.clearRect(0,0,(ctx.canvas as any).width,(ctx.canvas as any).height); } catch {} return; }
  const val = Math.max(0, Math.min(100, pct));
  try {
    miniGauge = new Chart(ctx, { type: 'doughnut', data: { labels: ['Delivery','Others'], datasets: [{ data: [val, 100-val], backgroundColor: ['#16a34a', '#e5e7eb'], borderWidth: 0 }] }, options: { cutout: '70%', plugins: { legend: { display:false }, tooltip: { callbacks: { label: (tt:any)=> `${tt.label}: ${tt.parsed}%` } } } } });
  } catch {}
}

function parseDeliveryPercent(display: string | null | undefined): number | null {
  try { const m = String(display||'').match(/\(([^%]+)%\)/); if (m) { const v = Number(m[1]); return Number.isFinite(v) ? v : null; } } catch {}
  return null;
}

function currentSelectedSymbol(): string {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const v = sel?.value || (localStorage.getItem('selectedSymbol') || '');
  return v ? v.toUpperCase() : v;
}

function attachHandlers() {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  if (sel) {
    sel.addEventListener('change', () => {
      const sym = currentSelectedSymbol();
      if (!sym) return;
      if (currentSymbol !== sym) {
        currentSymbol = sym;
        connectWs(sym);
        startMcVolumeCompact(sym);
        startOptionsSentimentCard(sym);
      }
    });
  }
  const rSel = document.getElementById('ydRange') as HTMLSelectElement | null;
  const iSel = document.getElementById('ydInterval') as HTMLSelectElement | null;
  const onYahooCtl = () => { if (currentSymbol && liveMode === 'mixed') { seedFromYahooChart(currentSymbol); } };
  if (rSel) rSel.addEventListener('change', onYahooCtl);
  if (iSel) iSel.addEventListener('change', onYahooCtl);
}

// Dumb escape util (copy from main if needed)
function escapeHtml(s: any): string {
  try { return String(s).replace(/[&<>"]+/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c] || c); } catch { return String(s||''); }
}

window.addEventListener('DOMContentLoaded', () => {
  ensureCompactCards();
  attachHandlers();
  const sym = currentSelectedSymbol();
  if (sym) {
    currentSymbol = sym;
    connectWs(sym);
    startMcVolumeCompact(sym);
    startOptionsSentimentCard(sym);
  }
});


