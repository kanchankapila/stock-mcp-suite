// Lightweight bootstrapping for the demo UI using vanilla TS + Vite.
// If you want a full Angular project, generate one with Angular CLI and port the components/services.

import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { emitSymbolChange } from './lib/events';
import * as CardRegistry from './cards/registry';

// Lightweight value labels + last-value annotation plugin for Chart.js
const ValueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: any, _args: any, _pluginOptions: any) {
    const opts = (chart.options?.plugins && (chart.options.plugins as any).valueLabels) || {};
    if (!opts || opts.enabled === false) return;
    const ctx = chart.ctx;
    ctx.save();
    const type = chart.config.type;
    const precision = Number.isFinite(opts.precision) ? opts.precision : 2;
    const color = opts.color || '#444';

    function fmt(v: any) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '';
      if (precision === 0) return String(Math.round(n));
      if (Math.abs(n) >= 1000) return n.toFixed(0);
      return n.toFixed(precision);
    }

    if (type === 'bar') {
      const horizontal = chart?.options?.indexAxis === 'y';
      chart.data.datasets.forEach((ds: any, di: number) => {
        const meta = chart.getDatasetMeta(di);
        if (!meta || meta.hidden) return;
        meta.data.forEach((elem: any, i: number) => {
          const raw = ds.data?.[i];
          const label = fmt(raw);
          if (!label) return;
          const pos = elem.tooltipPosition ? elem.tooltipPosition() : { x: elem.x, y: elem.y };
          ctx.fillStyle = color;
          ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.textAlign = horizontal ? 'left' : 'center';
          ctx.textBaseline = horizontal ? 'middle' : 'bottom';
          const padX = horizontal ? 6 : 0;
          const padY = horizontal ? 0 : 6;
          const x = horizontal ? (pos.x + padX) : pos.x;
          const y = horizontal ? pos.y : (pos.y - padY);
          // simple contrast halo
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 3;
          ctx.strokeText(label, x, y);
          ctx.fillText(label, x, y);
        });
      });
    }

    if (type === 'line' && opts.lastValue) {
      // annotate last defined value of the first visible dataset
      const di = (opts.datasetIndex ?? 0) as number;
      const meta = chart.getDatasetMeta(di);
      if (meta && !meta.hidden && Array.isArray(meta.data) && meta.data.length) {
        // find last non-null point
        let lastIdx = -1;
        for (let i = meta.data.length - 1; i >= 0; i--) {
          const v = chart.data.datasets?.[di]?.data?.[i];
          if (v !== null && v !== undefined && Number.isFinite(Number(v))) { lastIdx = i; break; }
        }
        if (lastIdx >= 0) {
          const elem = meta.data[lastIdx];
          const v = chart.data.datasets[di].data[lastIdx];
          const txt = fmt(v);
          const pos = elem.tooltipPosition ? elem.tooltipPosition() : { x: elem.x, y: elem.y };
          ctx.fillStyle = opts.color || '#1f2937';
          ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          // marker
          ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI*2); ctx.fill();
          // label
          const x = pos.x + 6, y = pos.y;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 3;
          ctx.strokeText(txt, x, y);
          ctx.fillText(txt, x, y);
        }
      }
    }

    // Pie / Doughnut labels (counts and optional %)
    if ((type === 'doughnut' || type === 'pie') && opts.enabled) {
      const ds = chart.data?.datasets?.[0];
      const meta = chart.getDatasetMeta(0);
      if (!ds || !meta || !Array.isArray(meta.data)) return;
      const total = (Array.isArray(ds.data) ? ds.data : []).reduce((acc: number, v: any) => {
        const n = Number(v);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);
      meta.data.forEach((elem: any, i: number) => {
        const raw = Array.isArray(ds.data) ? ds.data[i] : null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n === 0) return;
        const pct = total > 0 ? (n / total) * 100 : 0;
        const label = opts.piePercent ? `${Math.round(n)} (${pct.toFixed(0)}%)` : `${Math.round(n)}`;
        const pos = elem.tooltipPosition ? elem.tooltipPosition() : { x: elem.x, y: elem.y };
        ctx.fillStyle = color;
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // subtle halo for contrast
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, pos.x, pos.y);
        ctx.fillText(label, pos.x, pos.y);
      });
    }
    ctx.restore();
  }
};
Chart.register(ValueLabelsPlugin as any);

// Use default base from service (Vite env/proxy). Avoid hardcoding ports.
const api = new Api();
let LLM_ENABLED = false;
(async ()=>{ try { const h = await new Api().ragHealth(); LLM_ENABLED = !!(h?.data?.llm?.enabled); } catch {} })();
let currentPivotType: 'classic' | 'fibonacci' | 'camarilla' = 'classic';
let currentTechFreq: 'D' | 'W' | 'M' = 'D';

// Chart registry to prevent leaks on re-render
const _charts: Record<string, Chart> = {} as any;
function upsertChart(id: string, ctx: CanvasRenderingContext2D, cfg: any) {
  try { _charts[id]?.destroy(); } catch {}
  _charts[id] = new Chart(ctx, cfg);
  return _charts[id];
}

// Theme helpers (resolve CSS variables to concrete colors)
function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v && v.trim()) || fallback;
}
function hexToRgba(hex: string, alpha: number) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#')) return hexToRgba(color, alpha);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  return color;
}
const THEME = {
  brand: cssVar('--brand', '#3b82f6'),
  success: cssVar('--success', '#16a34a'),
  danger: cssVar('--danger', '#ef4444'),
  muted: cssVar('--muted', '#6b7280'),
  border: cssVar('--border', '#e5e7eb'),
};

const root = document.getElementById('app')!;
root.innerHTML = `
  <style>
    /* Layout primitives to prevent overlap and keep content contained */
    *, *::before, *::after { box-sizing: border-box; }
    .container { display: flex; flex-direction: column; gap: 12px; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
    .card { position: relative; background: var(--panel-2); border: 1px solid var(--border); border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(31,41,55,0.06); overflow: hidden; min-width: 0; }
    .card > * { max-width: 100%; }
    .card img, .card canvas, .card svg, .card table { max-width: 100%; }
    .card pre { max-width: 100%; white-space: pre-wrap; overflow: auto; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break: break-word; overflow-wrap: anywhere; }
    .flex { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    canvas.sparkline { height: 56px; }
    #mcHistChart, #historyChart { max-height: 220px; }
    #sentimentGauge { height: 90px; }
    #mcPvChart { max-height: 120px; }
    .score-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; align-items:stretch; width:100%; }
    .score { border:1px solid var(--border); background: var(--panel-2); border-radius:12px; padding:10px; box-shadow: 0 2px 8px rgba(31,41,55,0.06); overflow:hidden; min-width:0; }
    .score .label { font-size:12px; color: var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .score .value { font-size:24px; font-weight:700; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; word-break:break-word; }
    .score .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-weight:600; font-size:11px; }
    @media (max-width: 900px) {
      canvas.sparkline { height: 44px; }
      #mcHistChart, #historyChart { max-height: 180px !important; }
      #sentimentGauge { height: 72px !important; }
      #mcPvChart { max-height: 100px !important; }
    }
    @media (max-width: 600px) {
      canvas.sparkline { height: 40px; }
      #mcHistChart, #historyChart { max-height: 160px !important; }
    }
    .btn-sm.active { background: var(--brand); color: #fff; border-color: var(--brand); }
    .btn-sm { transition: background 0.15s ease, color 0.15s ease; }
    .chip { display:inline-block; padding:2px 8px; border-radius:999px; font-weight:600; font-size:11px; }
    .kpi { background: var(--panel-2); border:1px solid var(--border); border-radius:10px; padding:10px; box-shadow: 0 2px 8px rgba(31,41,55,0.06); }
    .section-title { font-weight:600; color: var(--muted); margin:8px 0 4px; }
    /* Shell */
    header.app-header { position: sticky; top: 0; z-index: 20; backdrop-filter: blur(6px); background: color-mix(in srgb, var(--bg), transparent 10%); border-bottom: 1px solid var(--border); }
    header .wrap { display:flex; gap:12px; align-items:center; justify-content:space-between; padding:10px 14px; }
    .brand { display:flex; gap:10px; align-items:center; font-weight:700; letter-spacing:0.2px; }
    .brand .dot { width:10px; height:10px; border-radius:999px; background: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary), transparent 80%); }
    .searchbar { display:flex; gap:8px; align-items:center; flex:1; max-width: 680px; margin: 0 12px; }
    .searchbar input { width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:999px; background: var(--surface); color: var(--text); }
    .toolbar { display:flex; gap:8px; align-items:center; }
    .btn { padding:6px 10px; border:1px solid var(--border); border-radius:8px; background:transparent; color: var(--text); cursor:pointer; }
    .tabs { display:flex; gap:4px; border:1px solid var(--border); border-radius:999px; padding:2px; }
    .tab { padding:6px 10px; border-radius:999px; cursor:pointer; font-weight:600; color: var(--text-muted); }
    .tab.active { background: var(--color-primary); color: #fff; }
    .layout { display:flex; gap:14px; padding:12px; }
    aside.sidebar { width: 220px; min-width: 200px; border-right:1px solid var(--border); padding-right:12px; }
    aside .nav { display:flex; flex-direction:column; gap:6px; }
    aside .nav a { padding:8px 10px; border-radius:8px; color: var(--text); text-decoration:none; border:1px solid transparent; cursor:pointer; }
    aside .nav a.active, aside .nav a:hover { background: var(--surface); border-color: var(--border); }
    main.content { flex:1; min-width:0; }
    @media (max-width: 900px) { aside.sidebar { display:none; } .layout { padding:8px; } }

    /* Inline spinner for loading states */
    table.data-grid { width:100%; border-collapse:collapse; }
    table.data-grid th, table.data-grid td { padding:8px; border-bottom:1px solid var(--border); }
    table.data-grid th { text-align:left; font-weight:600; color: var(--muted); user-select:none; cursor:pointer; }
    table.data-grid th.sort-asc::after { content: ' ↑'; }
    table.data-grid th.sort-desc::after { content: ' ↓'; }
    canvas.spark-mini { height: 36px; }
    .spinner { width:16px; height:16px; border:2px solid var(--border); border-top-color: var(--color-primary); border-radius:50%; display:inline-block; animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <header class="app-header">
    <div class="wrap">
      <div class="brand"><span class="dot"></span> Stock Analytics</div>
      <div class="searchbar">
        <input id="globalSearch" placeholder="Search stocks (name/symbol)�" list="stocksList" />
      </div>
      <div class="toolbar">
        <div class="tabs" id="tfTabs" aria-label="Timeframe Tabs">
          <div class="tab active" data-tf="D">Daily</div>
          <div class="tab" data-tf="M">Monthly</div>
          <div class="tab" data-tf="Y">Yearly</div>
        </div>
        <button class="btn" id="sidebarToggle" title="Toggle Sidebar" aria-label="Toggle Sidebar">☰</button>
        <button class="btn" id="themeToggle" title="Toggle Theme" aria-label="Toggle Theme">🌓 Theme</button>
      </div>
    </div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="nav">
        <a data-route="#/overview" class="active" aria-label="Dashboard">📊 Dashboard</a>
        <a data-route="#/insight" aria-label="Stock Insight">📈 Stock Insight</a>
        <a data-route="#/ai" aria-label="AI">🤖 AI</a>
        <a data-route="#/watchlist" aria-label="Watchlist">⭐ Watchlist</a>
        <a data-route="#/portfolio" aria-label="Portfolio">💼 Portfolio</a>
        <a data-route="#/alerts" aria-label="Alerts and Events">🔔 Alerts</a>
        <a data-route="#/settings" aria-label="Settings">⚙️ Settings</a>
        <a data-route="#/health" aria-label="Provider Health">🩺 Health</a>
      </div>
    </aside>
    <main class="content">
  <div class="container">
    <div class="card" id="searchCard">
      <div class="flex">
        <input id="stockSearch" placeholder="Search stocks..." style="min-width:220px" />
        <select id="stockSelect" style="min-width:260px">
          <option value="" selected disabled>Select a stock</option>
        </select>
        <input id="symbol" placeholder="Enter stock symbol (e.g., AAPL)" list="stocksList" />
        <!-- Auto-fetches on selection; buttons removed -->
        <button id="dbstatsBtn">DB Data</button>
        <button id="addToWatchlist" class="btn-sm" title="Add selected to Watchlist">+ Watchlist</button>
        
      </div>
      <datalist id="stocksList"></datalist>
      <div class="muted" style="margin-top:8px">Pulls prices & news (sample data if keys missing), then runs sentiment, prediction, strategy & backtest.</div>
    </div>

    <div class="card" id="resolveCard" style="margin-top:12px">
      <div class="muted">Ticker Resolve</div>
      <div class="flex" style="gap:8px; margin-top:6px">
        <input id="resolveInput" placeholder="Enter name/symbol (e.g., DABUR)" />
        <button id="resolveRun">Resolve</button>
        <button id="resolveUseSelected">Use Selected</button>
      </div>
      <div id="resolveProviders" class="muted" style="margin-top:6px"></div>
      <pre id="resolveOutput" class="mono" style="white-space:pre-wrap; margin-top:6px"></pre>
    </div>

    <div class="card" id="suggestions" style="margin-top:12px">
      <div class="muted">Smart Stock Suggestions</div>
      <div id="suggestionsBody" style="margin-top:6px"></div>
    </div>

    <div id="marketOverview" style="margin-top:16px">
      <div class="muted">Market Overview</div>
    </div>
    <div class="card" id="topPicks" style="margin-top:12px">
      <div class="muted">Top Picks</div>
      <div class="flex" style="gap:8px; margin-top:6px; align-items:center">
        <input id="tpDays" type="number" min="5" step="5" value="60" style="width:120px" aria-label="Top Picks lookback (days)" />
        <button id="tpRefresh" class="btn-sm">Refresh</button>
        <span id="tpHint" class="muted"></span>
      </div>
      <div id="tpBody" class="mono" style="margin-top:6px"></div>
    </div>

    <div class="card" id="ragExplain" style="margin-top:12px">
      <div class="muted">RAG Explain</div>
      <div class="flex" style="gap:8px; margin-top:6px; align-items:center; flex-wrap:wrap">
        <button id="ragExplainBtn" class="btn" aria-label="Explain last N days for selected stock">?? Explain last N days</button>
        <input id="ragDays" type="number" min="1" step="1" placeholder="Days (optional)" aria-label="Custom days (optional)" style="width:140px; padding:6px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text)" />
        <span class="muted" id="ragExplainHint"></span>
      </div>
      <div id="ragExplainBody" class="mono" role="status" aria-live="polite" style="white-space:pre-wrap; margin-top:8px"></div>
    </div>

    <div class="card" id="ragStats" style="margin-top:12px">
      <div class="muted">RAG Stats</div>
      <div class="flex" style="gap:8px; margin-top:6px; align-items:center">
        <button id="ragStatsRefresh" class="btn-sm">Refresh</button>
        <button id="ragBuildBatch" class="btn-sm" title="Build HNSW for all symbols (admin)">Build HNSW (All)</button>
        <button id="ragMigrateBtn" class="btn-sm" title="Migrate SQLite docs to current store (admin)">Migrate SQLite?HNSW</button>
        <span id="ragStatsHint" class="muted"></span>
      </div>
      <div id="ragStatsBody" class="mono" style="margin-top:6px; white-space:pre-wrap"></div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="card" id="status"><div class="muted">Status</div></div>
      <div class="card" id="overview"><div class="muted">Overview</div></div>
    </div>

    <div class="row" style="margin-top:16px">
      <div class="card" id="sentiment"><div class="muted">Sentiment & Recommendation</div></div>
      <div class="card" id="mcinsight"><div class="muted">MC Insight</div></div>
      <div class="card" id="mcquick"><div class="muted">MC Quick</div></div>
      <div class="card" id="scoreCards">
        <div class="muted">Quality Scores</div>
        <div id="scoreCardsBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="interactiveChart">
        <div class="muted">Interactive Candlestick</div>
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <label class="muted">Overlays:</label>
          <label style="display:flex; align-items:center; gap:6px"><input id="icSma20" type="checkbox" checked aria-label="Toggle SMA 20"/> SMA 20</label>
          <label style="display:flex; align-items:center; gap:6px"><input id="icEma50" type="checkbox" aria-label="Toggle EMA 50"/> EMA 50</label>
          <label style="display:flex; align-items:center; gap:6px"><input id="icEma200" type="checkbox" aria-label="Toggle EMA 200"/> EMA 200</label>
          <label style="display:flex; align-items:center; gap:6px"><input id="icBoll" type="checkbox" aria-label="Toggle Bollinger Bands"/> Bollinger</label>
        </div>
        <canvas id="icCanvas" style="margin-top:6px; max-height:260px"></canvas>
      </div>
      <div class="card" id="mctech">
        <div class="muted">MC Technicals</div>
        <div class="flex" style="gap:8px; margin-top:6px">
          <label class="muted">Pivots:</label>
          <button id="pivotClassic" class="btn-sm">Classic</button>
          <button id="pivotFibo" class="btn-sm">Fibonacci</button>
          <button id="pivotCama" class="btn-sm">Camarilla</button>
          <div style="width:1px; background:var(--border); margin:0 4px"></div>
          <label class="muted">Freq:</label>
          <button id="techFreqD" class="btn-sm active">D</button>
          <button id="techFreqW" class="btn-sm">W</button>
          <button id="techFreqM" class="btn-sm">M</button>
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
        <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
          <label class="muted">Lookback:</label>
          <select id="tlLookback">
            <option value="12">12</option>
            <option value="24" selected>24</option>
            <option value="48">48</option>
          </select>
          <button id="tlCookieRefresh" class="btn-sm">Refresh</button>
          <div id="tlStatus" class="muted"></div>
        </div>
        <div id="tlBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="tlOscValues">
        <div class="muted">Oscillators – Values</div>
        <canvas id="tlOscBars" style="max-height:220px; margin-top:6px"></canvas>
      </div>
      <div class="card" id="tlPivot">
        <div class="muted">Pivot Levels vs Current Price</div>
        <div id="tlPivotBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="tlOscDetails">
        <div class="muted">Oscillator Details</div>
        <div id="tlOscDetailsBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="tlCache">
        <div class="muted">Trendlyne Cache (SMA/ADV)</div>
        <div id="tlCacheBody" style="margin-top:6px"></div>
      </div>
      <div class="card" id="featuresStored">
        <div class="muted">Stored Features</div>
        <div id="fsBody" style="margin-top:6px"></div>
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
          <div class="card">
            <div class="muted">Prompt History</div>
            <div id="historyBox" class="mono" style="margin-top:6px; max-height:200px; overflow:auto; white-space:pre-wrap"></div>
          </div>
          <div class="card">
            <div class="muted">RAG Q&A (stream)</div>
            <div class="flex" style="margin-top:6px">
              <input id="ragq" placeholder="Ask RAG (uses namespace = symbol)" style="flex:1" />
              <button id="ragAsk">Ask</button>
            </div>
            <div class="muted" style="font-size:12px; margin-top:4px">Use "Index URLs" to add sources first.</div>
            <pre id="ragStream" class="mono" style="white-space:pre-wrap; margin-top:6px"></pre>
          </div>
          <div class="card">
            <div class="muted">RAG Index URLs</div>
            <textarea id="ragUrls" placeholder="One or more URLs separated by spaces or newlines" style="width:100%; height:96px;
              background: var(--panel-2); color: var(--text); border:1px solid var(--border); border-radius:10px; padding:8px"></textarea>
            <button id="ragIndexBtn" style="margin-top:6px">Index URLs to Namespace (symbol)</button>
            <div id="ragIndexStatus" class="muted" style="margin-top:6px"></div>
          </div>
          <div class="card">
            <div class="muted">RAG Index Text</div>
            <textarea id="ragText" placeholder="Paste text to index for the selected symbol" style="width:100%; height:96px; background: var(--panel-2); color: var(--text); border:1px solid var(--border); border-radius:10px; padding:8px"></textarea>
            <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
              <input id="ragTextDate" type="date" aria-label="Document date" />
              <input id="ragTextSource" placeholder="Source (optional)" aria-label="Source" />
              <button id="ragIndexTextBtn">Index Text</button>
            </div>
            <div id="ragIndexTextStatus" class="muted" style="margin-top:6px"></div>
          </div>
        </div>
        <div class="card" style="margin-top:8px">
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
    </main>
  </div>
`;
// Normalize any garbled placeholder text in the stock select
const _ph = document.querySelector('#stockSelect option[disabled]') as HTMLOptionElement | null;
  if (_ph) { _ph.textContent = 'Select a stock'; }

// Theme toggle
(function initTheme(){
  const key = 'theme';
  const btn = document.getElementById('themeToggle');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = (localStorage.getItem(key) || '').toLowerCase();
  const start = saved === 'dark' || (!saved && prefersDark) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', start);
  btn?.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(key, next); } catch {}
  });
})();

// Timeframe tabs
(function initTimeframeTabs(){
  const tabs = Array.from(document.querySelectorAll('#tfTabs .tab')) as HTMLElement[];
  const key = 'timeframe';
  const saved = localStorage.getItem(key) || 'D';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tf === saved));
  let current = saved as 'D'|'M'|'Y';
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    current = (t.dataset.tf as any) || 'D';
    try { localStorage.setItem(key, current); } catch {}
    // Apply timeframe to charts and data windows
    applyTimeframe(current);
  }));
  // Keyboard shortcuts: 1=D, 2=M, 3=Y (ignore when typing in inputs/textareas)
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement)?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || (ev.target as HTMLElement)?.isContentEditable;
    if (typing) return;
    let tf: 'D'|'M'|'Y' | null = null;
    if (ev.key === '1') tf = 'D';
    if (ev.key === '2') tf = 'M';
    if (ev.key === '3') tf = 'Y';
    if (tf) {
      tabs.forEach(x => x.classList.remove('active'));
      const target = tabs.find(x => x.dataset.tf === tf);
      if (target) target.classList.add('active');
      try { localStorage.setItem(key, tf); } catch {}
      applyTimeframe(tf);
    }
  });
})();

// Header search bridges to existing selector
(function initHeaderSearch(){
  const input = document.getElementById('globalSearch') as HTMLInputElement | null;
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  if (!input || !sel) return;
  input.addEventListener('change', () => {
    const val = input.value.trim().toUpperCase();
    if (!val) return;
    // Try to find matching option by text or value
    const opt = Array.from(sel.options).find(o => o.value.toUpperCase() === val || (o.textContent||'').toUpperCase().includes(val));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change')); }
  });
})();

// Simple page tabs: Market Overview vs Stock Insight (hide/show sections)
(function initPageTabs(){
  const container = document.querySelector('main.content .container');
  if (!container) return;
  // Page tabs
  const bar = document.createElement('div');
  bar.className = 'pagetabs';
  bar.setAttribute('aria-label','Page Tabs');
  bar.innerHTML = `
    <div class="tab" data-page="overview" role="button" tabindex="0">Market Overview</div>
    <div class="tab" data-page="insight" role="button" tabindex="0">Stock Insight</div>
    <div class="tab" data-page="ai" role="button" tabindex="0">AI</div>`;
  container.insertBefore(bar, container.firstChild);
  // Hero buttons for clear navigation
  const hero = document.createElement('div');
  hero.className = 'card';
  hero.style.marginTop = '12px';
  hero.innerHTML = `
    <div class="muted">Quick Navigation</div>
    <div class="flex" style="gap:10px; margin-top:8px; flex-wrap:wrap">
      <a href="#/overview" class="btn" style="font-weight:700">Market Overview</a>
      <a href="#/insight" class="btn" style="font-weight:700">Stock Insight</a>
      <a href="#/ai" class="btn" style="font-weight:700">AI</a>
      <a href="#/watchlist" class="btn" style="font-weight:700">Watchlist</a>
      <a href="#/alerts" class="btn" style="font-weight:700">Alerts</a>
    </div>`;
  container.insertBefore(hero, bar.nextSibling);

  const tabs = Array.from(bar.querySelectorAll('.tab')) as HTMLElement[];
  const key = 'page';
  function parseHash(): 'overview'|'insight'|'ai'|'watchlist'|'portfolio'|'alerts'|'settings'|'health' {
    const h = (location.hash || '').toLowerCase();
    if (h.startsWith('#/insight')) return 'insight';
    if (h.startsWith('#/ai')) return 'ai';
    if (h.startsWith('#/watchlist')) return 'watchlist';
    if (h.startsWith('#/portfolio')) return 'portfolio';
    if (h.startsWith('#/alerts')) return 'alerts';
    if (h.startsWith('#/settings')) return 'settings';
    if (h.startsWith('#/health')) return 'health';
    return 'overview';
  }
  let current = parseHash();

  function setPage(p: 'overview'|'insight'|'ai'|'watchlist'|'portfolio'|'alerts'|'settings'|'health') {
    current = p; try { localStorage.setItem(key, p); } catch {}
    tabs.forEach(t => t.classList.toggle('active', t.dataset.page === p));
    const overviewIds = ['suggestions','marketOverview','topPicks','topPicksDelta','topPicksHistory'];
    const insightIds = ['status','overview','history','news','yahooData','sentiment','mcinsight','mcquick','interactiveChart','mctech','mcPriceVolume','mcStockHistory','trendlyne','tlOscValues','tlPivot','tlOscDetails','tlCache','featuresStored','trendlyneDerivatives','providerResolution','alphaVantage','yfinKpis','yfinProfile','yfinFinancials','liveQuote','mcVolumeCard','optionsSentimentCard','searchCard',
      // Moved cards to Stock Insight page
      'scoreCards','marketsMojo','yahooIngest'];
    const aiIds = ['ragExplain','ragStats','agent'];
    const watchlistIds: string[] = ['watchlistCard'];
    const portfolioIds: string[] = ['portfolioCard'];
    const alertsIds: string[] = ['alertsCard','topPicksDelta'];
    const settingsIds: string[] = ['settingsCard'];
    const healthIds: string[] = ['providerHealth'];
    const all = Array.from(new Set([...overviewIds, ...insightIds, ...aiIds, ...watchlistIds, ...portfolioIds, ...alertsIds, ...settingsIds, ...healthIds]));
    const show = p === 'overview' ? overviewIds
      : p === 'insight' ? insightIds
      : p === 'watchlist' ? watchlistIds
      : p === 'portfolio' ? portfolioIds
      : p === 'alerts' ? alertsIds
      : p === 'settings' ? settingsIds
      : p === 'health' ? healthIds
      : aiIds;
    const hide = all.filter(id => !show.includes(id));
    hide.forEach(id => { const el = document.getElementById(id); if (el) (el as HTMLElement).style.display = 'none'; });
    show.forEach(id => { const el = document.getElementById(id); if (el) (el as HTMLElement).style.display = ''; });
    // Populate key cards when entering Insight
    if (p === 'insight') {
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const symbol = sel?.value || '';
      if (symbol) {
        try { renderYahooData(symbol); } catch {}
        try { renderMcTech(symbol, currentPivotType, currentTechFreq); } catch {}
        try { renderMcPriceVolume(symbol); } catch {}
        try { renderMcStockHistory(symbol); } catch {}
        try { renderTrendlyneAdvTech(symbol); } catch {}
      }
    }
    // Lazy render page-specific content
    try {
      if (p === 'watchlist') renderWatchlist();
      if (p === 'portfolio') initPortfolioPage();
      if (p === 'settings') initSettingsPage();
    } catch {}
    // Sync hash
    const want = p === 'overview' ? '#/overview' : p === 'insight' ? '#/insight' : p === 'ai' ? '#/ai' : p === 'watchlist' ? '#/watchlist' : p === 'portfolio' ? '#/portfolio' : p === 'alerts' ? '#/alerts' : p === 'settings' ? '#/settings' : '#/health';
    if (location.hash !== want) { location.hash = want; }
  }

  tabs.forEach(t => t.addEventListener('click', () => setPage((t.dataset.page as any)||'overview')));
  tabs.forEach(t => t.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPage((t.dataset.page as any)||'overview'); } }));
  // Wire sidebar links
  try {
    const sideLinks = Array.from(document.querySelectorAll('aside.sidebar .nav a')) as HTMLAnchorElement[];
    sideLinks.forEach(a => a.addEventListener('click', (ev) => { ev.preventDefault(); const r = a.getAttribute('data-route') || '#/overview'; location.hash = r; }));
  } catch {}
  window.addEventListener('hashchange', () => {
    // update sidebar active state
    try {
      const sideLinks = Array.from(document.querySelectorAll('aside.sidebar .nav a')) as HTMLAnchorElement[];
      sideLinks.forEach(a => a.classList.toggle('active', (a.getAttribute('data-route')||'') === location.hash));
    } catch {}
    setPage(parseHash());
  });
  // Initial
  if (!location.hash) location.hash = current === 'overview' ? '#/overview' : current === 'insight' ? '#/insight' : '#/ai';
  setPage(current);
})();

// Wire RAG Index buttons (URLs and Text)
(function initRagIndexing(){
  const urlsBtn = document.getElementById('ragIndexBtn');
  const urlsTa = document.getElementById('ragUrls') as HTMLTextAreaElement | null;
  const urlsStatus = document.getElementById('ragIndexStatus');
  const textBtn = document.getElementById('ragIndexTextBtn');
  const textTa = document.getElementById('ragText') as HTMLTextAreaElement | null;
  const textDate = document.getElementById('ragTextDate') as HTMLInputElement | null;
  const textSource = document.getElementById('ragTextSource') as HTMLInputElement | null;
  const textStatus = document.getElementById('ragIndexTextStatus');
  const nsSel = document.getElementById('stockSelect') as HTMLSelectElement | null;

  async function doIndexUrls() {
    if (!nsSel || !urlsTa || !urlsStatus) return;
    const ns = nsSel.value || '';
    if (!ns) { urlsStatus.textContent = 'Select a symbol first.'; return; }
    const raw = urlsTa.value || '';
    const urls = raw.split(/\s+/g).filter(u => /^https?:\/\//i.test(u));
    if (!urls.length) { urlsStatus.textContent = 'Provide at least one valid URL (http/https).'; return; }
    urlsStatus.innerHTML = '<span class="spinner"></span>Indexing URLs�';
    try {
      const res = await new Api().ragIndex(ns, urls);
      urlsStatus.textContent = `Indexed ${res?.added ?? urls.length} chunks from URLs.`;
    } catch (e:any) {
      urlsStatus.textContent = String(e?.message || e);
    }
  }
  async function doIndexText() {
    if (!nsSel || !textTa || !textStatus) return;
    const ns = nsSel.value || '';
    if (!ns) { textStatus.textContent = 'Select a symbol first.'; return; }
    const txt = (textTa.value || '').trim();
    if (!txt) { textStatus.textContent = 'Paste some text to index.'; return; }
    const d = (textDate?.value || new Date().toISOString().slice(0,10));
    const src = (textSource?.value || 'manual');
    textStatus.innerHTML = '<span class="spinner"></span>Indexing text�';
    try {
      const res = await fetch('/api/rag/index', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ namespace: ns, texts: [{ text: txt, metadata: { date: d, source: src } }] }) });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      textStatus.textContent = `Indexed ${json?.added ?? 1} chunks from text.`;
    } catch (e:any) {
      textStatus.textContent = String(e?.message || e);
    }
  }
  urlsBtn?.addEventListener('click', doIndexUrls);
  textBtn?.addEventListener('click', doIndexText);
  // Reindex recent sources at once
  const reBtn = document.createElement('button');
  reBtn.textContent = 'Reindex Recent Sources';
  reBtn.className = 'btn';
  const togglesWrap = document.createElement('div');
  togglesWrap.className = 'flex';
  togglesWrap.style.gap = '8px';
  togglesWrap.style.alignItems = 'center';
  const tlCk = document.createElement('input'); tlCk.type='checkbox'; tlCk.id='reTl'; tlCk.checked=true; tlCk.ariaLabel='Include Trendlyne';
  const tlLbl = document.createElement('label'); tlLbl.htmlFor='reTl'; tlLbl.className='muted'; tlLbl.textContent='TL';
  const yhCk = document.createElement('input'); yhCk.type='checkbox'; yhCk.id='reYahoo'; yhCk.checked=true; yhCk.ariaLabel='Include Yahoo';
  const yhLbl = document.createElement('label'); yhLbl.htmlFor='reYahoo'; yhLbl.className='muted'; yhLbl.textContent='Yahoo';
  const mcCk = document.createElement('input'); mcCk.type='checkbox'; mcCk.id='reMc'; mcCk.checked=true; mcCk.ariaLabel='Include Moneycontrol';
  const mcLbl = document.createElement('label'); mcLbl.htmlFor='reMc'; mcLbl.className='muted'; mcLbl.textContent='MC';
  togglesWrap.append(tlCk, tlLbl, yhCk, yhLbl, mcCk, mcLbl);
  const ragExplainCard = document.getElementById('ragExplain');
  const hint = document.getElementById('ragExplainHint');
  if (ragExplainCard) {
    const bar = ragExplainCard.querySelector('.flex');
    bar?.appendChild(reBtn);
    bar?.appendChild(togglesWrap);
  }
  reBtn.addEventListener('click', async () => {
    const ns = nsSel?.value || '';
    if (!ns) { (hint as HTMLElement).textContent = 'Select a symbol first.'; return; }
    const daysStr = (document.getElementById('ragDays') as HTMLInputElement | null)?.value || '';
    const n = Number(daysStr || 0);
    const days = (Number.isFinite(n) && n>0) ? n : tfWindowDays(getTimeframe());
    if (hint) hint.innerHTML = '<span class="spinner"></span>Reindexing�';
    try {
      const qs = new URLSearchParams({ days: String(days), includeTl: String(tlCk.checked), includeYahoo: String(yhCk.checked), includeMc: String(mcCk.checked) });
      const res = await fetch(`/api/rag/reindex/${encodeURIComponent(ns)}?${qs.toString()}`, { method:'POST' });
      const json = await res.json();
      if (!res.ok || json?.ok===false) throw new Error(json?.error || await res.text());
      if (hint) hint.textContent = `Reindexed: ${json?.added ?? 0} chunks (cutoff ${json?.cutoff || ''})`;
    } catch (e:any) {
      if (hint) (hint as HTMLElement).textContent = String(e?.message || e);
    }
  });
  // List docs button
  const listBtn = document.createElement('button');
  listBtn.textContent = 'List Indexed Docs';
  listBtn.className = 'btn';
  if (ragExplainCard) {
    const bar = ragExplainCard.querySelector('.flex');
    bar?.appendChild(listBtn);
  }
  const docsCard = document.createElement('div');
  docsCard.className = 'card';
  const docsTitle = document.createElement('div'); docsTitle.className = 'muted'; docsTitle.textContent = 'RAG Sources';
  const docsBox = document.createElement('div');
  docsBox.id = 'ragDocs'; docsBox.className = 'mono'; docsBox.style.cssText = 'white-space:pre-wrap; margin-top:6px; max-height:180px; overflow:auto';
  docsCard.append(docsTitle, docsBox);
  ragExplainCard?.appendChild(docsCard);
  listBtn.addEventListener('click', async () => {
    const ns = nsSel?.value || '';
    if (!ns) { docsBox.textContent = 'Select a symbol first.'; return; }
    docsBox.innerHTML = '<span class="spinner"></span>Loading�';
    try {
      const res = await fetch(`/api/rag/docs/${encodeURIComponent(ns)}?withText=true&limit=50`);
      const json = await res.json();
      if (!res.ok || json?.ok===false) throw new Error(json?.error || await res.text());
      const arr = Array.isArray(json?.data) ? json.data : [];
      docsBox.textContent = arr.length ? arr.map((d:any,i:number)=> `${i+1}. [${d.date || '�'}] (${d.source || 'unknown'}) ${d.excerpt || ''}`).join('\n\n') : 'No docs found.';
    } catch (e:any) {
      docsBox.textContent = String(e?.message || e);
    }
  });
})();

// RAG Stats panel
(function initRagStats(){
  const body = document.getElementById('ragStatsBody');
  const hint = document.getElementById('ragStatsHint');
  const btn = document.getElementById('ragStatsRefresh');
  const buildBtn = document.getElementById('ragBuildBatch');
  const migrateBtn = document.getElementById('ragMigrateBtn');
  try {
    const q = document.getElementById('ragq') as HTMLInputElement | null;
    const ask = document.getElementById('ragAsk') as HTMLButtonElement | null;
    if (!LLM_ENABLED) {
      if (q) { q.disabled = true; q.placeholder = 'LLM disabled (configure to enable streaming answers)'; }
      if (ask) { ask.disabled = true; ask.title = 'LLM disabled'; }
    }
  } catch {}
  async function render() {
    if (body) body.innerHTML = '<span class="spinner"></span>Loading.';
    try {
      const res = await new Api().ragStats();
      const rows: Array<{ns:string, docs:number}> = res?.data || [];
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const ns = sel?.value || '';
      let nsLine = '';
      let urlTable = '';
      if (ns) {
        try {
          const det = await new Api().ragStatsNs(ns);
          const d = det?.data || {};
          if (d?.docs !== undefined) nsLine = `\nSelected ${ns}: ${d.docs} docs${d?.dateRange?` (date ${d.dateRange.min || '-'}..${d.dateRange.max || '-'})`:''}`;
        } catch {}
        try {
          const ust = await new Api().ragUrlStatus(ns);
          const data: Array<{url:string,last_indexed:string,status:string,note:string}> = ust?.data || [];
          if (Array.isArray(data) && data.length) {
            const head = `<tr><th style=\"text-align:left; padding:4px\">URL</th><th style=\"text-align:left; padding:4px\">Last Indexed</th><th style=\"text-align:left; padding:4px\">Status</th><th style=\"text-align:left; padding:4px\">Note</th></tr>`;
            const rowsHtml = data.slice(0, 10).map(r => {
              const u = escapeHtml(r.url || '');
              const t = escapeHtml((r.last_indexed || '').replace('T',' ').replace('Z',''));
              const s = escapeHtml(r.status || '');
              const n = escapeHtml((r.note || '').slice(0, 120));
              const sc = s === 'ok' ? 'color:var(--success)' : s ? 'color:var(--danger)' : '';
              return `<tr>
                <td style=\"padding:4px; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap\" title=\"${u}\">${u}</td>
                <td style=\"padding:4px\">${t}</td>
                <td style=\"padding:4px; ${sc}\">${s}</td>
                <td style=\"padding:4px\">${n}</td>
              </tr>`;
            }).join('');
            urlTable = `\n<div class=\"muted\" style=\"margin-top:8px\">URL Index Status (latest 10)</div>\n<table class=\"mono\" style=\"margin-top:4px; width:100%; border-collapse:collapse; font-size:12px\">${head}${rowsHtml}</table>`;
          }
        } catch {}
      }
      if (!rows.length) { if (body) body.innerHTML = `<pre class=\"mono\" style=\"margin:0\">${escapeHtml(`No namespaces found.${nsLine}`)}</pre>${urlTable}`; return; }
      const txt = rows.map(r => `${r.ns}: ${r.docs}`).join('\n') + nsLine;
      if (body) body.innerHTML = `<pre class=\"mono\" style=\"margin:0\">${escapeHtml(txt)}</pre>${urlTable}`;
      if (hint) hint.textContent = '';
    } catch (e:any) {
      if (body) body.innerHTML = `<span class=\"mono\" style=\"color:#ff6b6b\">${escapeHtml(e?.message || e)}</span>`;
    }
  }
  btn?.addEventListener('click', render);
  buildBtn?.addEventListener('click', async () => {
    if (hint) hint.innerHTML = '<span class="spinner"></span>Building...';
    try {
      const dEl = document.getElementById('ragDays') as HTMLInputElement | null;
      const n = dEl ? Number(dEl.value || 0) : 0;
      const days = (Number.isFinite(n) && n>0) ? n : 60;
      const res = await new Api().ragBuildBatch(days);
      if (!res || res.ok === false) throw new Error(res?.error || 'Build failed');
      if (hint) hint.textContent = `Built: namespaces=${res.namespaces || 0}, added=${res.added || 0} (cutoff ${res.cutoff || ''})`;
      render();
    } catch (e:any) {
      if (hint) hint.textContent = String(e?.message || e);
    }
  });
  migrateBtn?.addEventListener('click', async () => {
    if (hint) hint.innerHTML = '<span class="spinner"></span>Migrating...';
    try {
      const res = await new Api().ragMigrateAdmin();
      if (!res || res.ok === false) throw new Error(res?.error || 'Migrate failed');
      if (hint) hint.textContent = `Migrated: namespaces=${res.namespaces || 0}, chunks=${res.migrated || 0}`;
      render();
    } catch (e:any) {
      if (hint) hint.textContent = String(e?.message || e);
    }
  });
  // Auto-refresh when symbol changes
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  sel?.addEventListener('change', render);
  // Initial
  render();
})();

// Interactive Candlestick overlay instant re-render
(function initIcOverlayListeners(){
  const ids = ['icSma20','icEma50','icEma200','icBoll'];
  ids.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.addEventListener('change', () => {
        const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
        const symbol = sel?.value || '';
        if (symbol) { try { renderCandlestick(symbol); } catch {} }
      });
    }
  });
})();

// Sidebar collapse toggle + shortcuts
(function initSidebar(){
  const key = 'sidebar';
  const saved = (localStorage.getItem(key) || '').toLowerCase();
  const collapsed = saved === 'collapsed';
  const sidebar = document.querySelector('aside.sidebar') as HTMLElement | null;
  if (sidebar && collapsed) sidebar.classList.add('collapsed');
  const btn = document.getElementById('sidebarToggle');
  function toggle() {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    try { localStorage.setItem(key, sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded'); } catch {}
  }
  btn?.addEventListener('click', toggle);
  // Keyboard: Shift+S toggles sidebar, '/' focuses global search
  window.addEventListener('keydown', (ev) => {
    if (ev.key === '?' || (ev.shiftKey && (ev.key === 'S' || ev.key === 's'))) { ev.preventDefault(); toggle(); }
    if (ev.key === '/' && !(ev as any).isComposing) { const i = document.getElementById('globalSearch') as HTMLInputElement | null; if (i) { ev.preventDefault(); i.focus(); i.select(); } }
  });
})();

// Timeframe helpers & application
function getTimeframe(): 'D'|'M'|'Y' { return (localStorage.getItem('timeframe') as any) || 'D'; }
function tfWindowDays(tf: 'D'|'M'|'Y') { return tf === 'D' ? 60 : tf === 'M' ? 180 : 365; }
function applyTimeframe(tf: 'D'|'M'|'Y') {
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const symbol = sel?.value || '';
  // Adjust Yahoo controls if present
  const rSel = document.getElementById('ydRange') as HTMLSelectElement | null;
  const iSel = document.getElementById('ydInterval') as HTMLSelectElement | null;
  const tlLb = document.getElementById('tlLookback') as HTMLSelectElement | null;
  if (rSel && iSel) {
    if (tf === 'D') { rSel.value = '1mo'; iSel.value = '1d'; }
    if (tf === 'M') { rSel.value = '6mo'; iSel.value = '1d'; }
    if (tf === 'Y') { rSel.value = '1y'; iSel.value = '1wk'; }
  }
  if (tlLb) {
    if (tf === 'D') tlLb.value = '12';
    if (tf === 'M') tlLb.value = '24';
    if (tf === 'Y') tlLb.value = '48';
  }
  // Re-render cards that depend on timeframe
  if (symbol) {
    try { renderYahooData(symbol); } catch {}
    try { rerenderOverviewAndHistory(symbol); } catch {}
    try { renderCandlestick(symbol); } catch {}
  }
  try { updateRagExplainHint(); } catch {}
}

// Rerender overview sparkline and history chart with timeframe window
async function rerenderOverviewAndHistory(symbol: string) {
  const tf = getTimeframe();
  const win = tfWindowDays(tf);
  try {
    const overview = await new Api().overview(symbol);
    const overviewCard = document.getElementById('overview')!;
    if (overview && overview.data) {
      const d = overview.data;
      const changeColor = d.periodChangePct > 0 ? 'var(--success)' : 'var(--danger)';
      overviewCard.innerHTML = `
        <div class="muted">Overview</div>
        <div class="grid-3" style="margin-top:6px; gap: 8px; align-items:center">
          <div><div class="muted">Last Close</div><div class="stat-sm">${d.lastClose?.toFixed(2) || 'N/A'}</div></div>
          <div><div class="muted">Change %</div><div class="stat-sm" style="color:${changeColor}">${d.periodChangePct?.toFixed(2) || '0'}%</div></div>
          <div><canvas id="overviewSpark" class="sparkline"></canvas></div>
        </div>
      `;
      try {
        const hist = await new Api().history(symbol);
        const rows = (hist && hist.data) ? hist.data : [];
        const last = Array.isArray(rows) ? rows.slice(-win) : [];
        const labels = last.map((r:any)=> r.date.split('T')[0]);
        const closes = last.map((r:any)=> Number(r.close));
        const sc = (document.getElementById('overviewSpark') as HTMLCanvasElement)?.getContext('2d');
        if (sc && labels.length && closes.length) {
          const lineColor = THEME.brand;
          const fillColor = withAlpha(THEME.brand, 0.1);
          upsertChart('overviewSpark', sc, {
            type: 'line',
            data: { labels, datasets: [{ data: closes, borderColor: lineColor, backgroundColor: fillColor, borderWidth: 1.5, fill: true, tension: 0.25, pointRadius: 0 }] },
            options: { plugins: { legend: { display: false }, tooltip: { enabled: false }, valueLabels: { enabled: true, lastValue: true, precision: 2, color: THEME.brand } }, scales: { x: { display: false }, y: { display: false } } }
          });
        }
      } catch {}
    }
  } catch {}
  try {
    const history = await new Api().history(symbol);
    const historyCard = document.getElementById('history')!;
    if (history && history.data && history.data.length > 0) {
      historyCard.innerHTML = `<div class="muted">Price History</div><canvas id="historyChart" style="margin-top:8px; max-height: 220px;"></canvas>`;
      const rows = history.data.slice(-win);
      const ctx = (document.getElementById('historyChart') as HTMLCanvasElement)?.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: rows.map((d:any) => d.date.split('T')[0]),
            datasets: [{
              label: 'Close Price',
              data: rows.map((d:any) => d.close),
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
            plugins: { legend: { display: false }, valueLabels: { enabled: true, lastValue: true, precision: 2, color: THEME.brand } },
            scales: {
              x: { display: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
              y: { display: true }
            }
          }
        } as any);
      }
    }
  } catch {}
}

// Candlestick renderer (OHLC)
async function renderCandlestick(symbol: string) {
  const body = document.getElementById('interactiveChart');
  const canvas = document.getElementById('icCanvas') as HTMLCanvasElement | null;
  if (!body || !canvas) return;
  const tf = getTimeframe();
  const win = tfWindowDays(tf);
  try {
    const hist = await new Api().history(symbol);
    const rows = (hist && hist.data) ? (hist.data as any[]) : [];
    const data = rows.slice(-win).map(r => ({ d: r.date, o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close) })).filter(r=> Number.isFinite(r.o) && Number.isFinite(r.h) && Number.isFinite(r.l) && Number.isFinite(r.c));
    // Resize canvas for crisp drawing
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
    const height = Math.max(180, Math.min(320, canvas.clientHeight || 240));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Compute scales
    const pad = { l: 8, r: 8, t: 6, b: 16 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const min = Math.min(...data.map(d=>d.l));
    const max = Math.max(...data.map(d=>d.h));
    const xStep = w / Math.max(1, data.length);
    const y = (v:number) => pad.t + (h - (v - min) / (max - min || 1) * h);
    // SMA20 overlay if enabled
    const smaOn = (document.getElementById('icSma20') as HTMLInputElement | null)?.checked;
    const closes = data.map(d=>d.c);
    const sma = smaOn ? (function(){ const p=20; const out:number[]=[]; let s=0; const q:number[]=[]; for (const v of closes){ q.push(v); s+=v; if (q.length>p) s -= q.shift() as number; if (q.length===p) out.push(s/p); else out.push(NaN);} return out; })() : [];
    // Clear
    ctx.clearRect(0,0,width,height);
    // Gridline: mid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.beginPath(); ctx.moveTo(pad.l, y((min+max)/2)); ctx.lineTo(width-pad.r, y((min+max)/2)); ctx.stroke();
    // Candles
    const bull = '#16A34A'; const bear = '#DC2626'; const wick = 'rgba(0,0,0,0.4)';
    const barW = Math.max(2, Math.min(10, xStep * 0.6));
    data.forEach((d, i) => {
      const x = pad.l + i * xStep + (xStep - barW)/2;
      // wick
      ctx.strokeStyle = wick; ctx.beginPath(); ctx.moveTo(x + barW/2, y(d.h)); ctx.lineTo(x + barW/2, y(d.l)); ctx.stroke();
      // body
      const up = d.c >= d.o; ctx.fillStyle = up ? bull : bear; const top = y(Math.max(d.o,d.c)); const bot = y(Math.min(d.o,d.c)); const hh = Math.max(1, bot - top);
      ctx.fillRect(x, top, barW, hh);
    });
    // SMA overlay
    if (smaOn && sma.length) {
      ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 1.5; ctx.beginPath();
      sma.forEach((v, i) => { if (!Number.isFinite(v)) return; const xx = pad.l + i * xStep + xStep/2; const yy = y(v); if (ctx.currentPath) { ctx.lineTo(xx, yy); } else { ctx.moveTo(xx, yy); } });
      ctx.stroke(); ctx.lineWidth = 1;
    }
  } catch {}
}


// Resolver helpers
async function renderResolveProviders() {
  const el = document.getElementById('resolveProviders');
  if (!el) return;
  try {
    const res = await new Api().resolveProviders();
    const arr: Array<{provider:string,key:string,suffix:string}> = res?.data || [];
    if (!arr.length) { el.innerHTML = '<div class="muted">No providers</div>'; return; }
    const chips = arr.map(p => `<span class="chip" style="background:${withAlpha('#888',0.12)}; color:var(--muted)">${p.provider.toUpperCase()}: ${escapeHtml(p.key)}${p.suffix?` (${escapeHtml(p.suffix)})`:''}</span>`).join(' ');
    el.innerHTML = `<div class="muted">Providers:</div><div style="margin-top:4px">${chips}</div>`;
  } catch (e:any) {
    el.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message||e)}</div>`;
  }
}

async function updateResolverCard(input: string) {
  const out = document.getElementById('resolveOutput');
  if (!out) return;
  if (!input) { out.textContent = ''; return; }
  out.textContent = 'Resolving�';
  try {
    const res = await new Api().resolveTicker(input);
    const data = res?.data || {};
    const obj = { input: data.input, entry: data.entry, providers: data.providers, resolved: data.resolved };
    out.textContent = JSON.stringify(obj, null, 2);
  } catch (e:any) {
    out.innerHTML = `<span style="color:#ff6b6b">${escapeHtml(e?.message||e)}</span>`;
  }
}

// Wire resolver controls
(function initResolverUI(){
  renderResolveProviders();
  const btn = document.getElementById('resolveRun');
  const useSel = document.getElementById('resolveUseSelected');
  const inp = document.getElementById('resolveInput') as HTMLInputElement | null;
  if (btn && inp) btn.addEventListener('click', ()=> updateResolverCard(inp.value.trim().toUpperCase()));
  if (useSel) useSel.addEventListener('click', () => {
    const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
    const v = sel?.value || '';
    if (inp) inp.value = v;
    updateResolverCard(v.includes('.') ? v.split('.')[0] : v);
  });
})();

// Kick off market overview immediately on app load
renderMarketOverview().catch(()=>{});

// Initialize stock selector: load list, wire search filter and selection
(async function initStockSelector(){
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const search = document.getElementById('stockSearch') as HTMLInputElement | null;
  const symbolInput = document.getElementById('symbol') as HTMLInputElement | null;
  if (!sel) return;
  // Show loading placeholder
  sel.innerHTML = '<option value="" selected disabled>Loading�</option>';
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
    
    // Restore saved selection if available, else auto-select first
    try {
      const saved = localStorage.getItem('selectedSymbol') || '';
      if (saved && data.some(d=>d.yahoo===saved)) {
        sel.value = saved;
        if (symbolInput) symbolInput.value = saved;
        // Trigger change so all cards (including Trendlyne) fetch immediately
        sel.dispatchEvent(new Event('change'));
      } else {
        // pick first non-empty option
        const first = data[0]?.yahoo || '';
        if (first) {
          sel.value = first;
          if (symbolInput) symbolInput.value = first;
          sel.dispatchEvent(new Event('change'));
        }
      }
    } catch {}
    // Change handler: persist + ingest + refresh + analyze
    sel.addEventListener('change', async ()=>{
      const v = sel.value;
      if (symbolInput) symbolInput.value = v;
      try { localStorage.setItem('selectedSymbol', v); } catch {}
      try { updateResolverCard(v.includes('.') ? v.split('.')[0] : v); } catch {}
      const statusEl = document.getElementById('status')!;
      statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Loading ${v}...</div>`;
      try {
        const ing = await new Api().ingest(v);
        const ip = Number(ing?.insertedPrices ?? 0);
        const inews = Number(ing?.insertedNews ?? 0);
        (statusEl as HTMLElement).innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px">Ingested ${v}: prices=${ip}, news=${inews}</div>`;
      } catch (e:any) {
        statusEl.innerHTML = `<div class="muted">Status</div><div class="mono" style="margin-top:8px;color:#ff6b6b">Ingest error: ${e?.message||e}</div>`;
      }
      try {
        const overview = await new Api().overview(v);
        const overviewCard = document.getElementById('overview')!;
        if (overview && overview.data) {
          const d = overview.data;
          const changeColor = d.periodChangePct > 0 ? 'var(--success)' : 'var(--danger)';
          // Pre-render shell including sparkline canvas; populate chart after history fetch
          overviewCard.innerHTML = `
            <div class="muted">Overview</div>
            <div class="grid-3" style="margin-top:6px; gap: 8px; align-items:center">
              <div><div class="muted">Last Close</div><div class="stat-sm">${d.lastClose?.toFixed(2) || 'N/A'}</div></div>
              <div><div class="muted">Change %</div><div class="stat-sm" style="color:${changeColor}">${d.periodChangePct?.toFixed(2) || '0'}%</div></div>
              <div><canvas id="overviewSpark" class="sparkline"></canvas></div>
            </div>
          `;
          try {
            const hist = await new Api().history(v);
            const rows = (hist && hist.data) ? hist.data : [];
            const last = Array.isArray(rows) ? rows.slice(-60) : [];
            const labels = last.map((r:any)=> r.date.split('T')[0]);
            const closes = last.map((r:any)=> Number(r.close));
            const sc = (document.getElementById('overviewSpark') as HTMLCanvasElement)?.getContext('2d');
            if (sc && labels.length && closes.length) {
              const lineColor = THEME.brand;
              const fillColor = withAlpha(THEME.brand, 0.1);
              upsertChart('overviewSpark', sc, {
                type: 'line',
                data: { labels, datasets: [{ data: closes, borderColor: lineColor, backgroundColor: fillColor, borderWidth: 1.5, fill: true, tension: 0.25, pointRadius: 0 }] },
                options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
              });
            }
          } catch {}
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
      const tf = getTimeframe();
      const days = tfWindowDays(tf);
      const cutoff = Date.now() - days*24*60*60*1000;
      const filtered = news.data.filter((n:any)=> {
        const t = Date.parse(String(n.date));
        return Number.isFinite(t) ? (t >= cutoff) : true;
      });
      const items = filtered.slice(0, 5).map((n:any) => `
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
            <div class="grid-3" style="margin-top:6px; text-align: center; align-items:center">
              <div>
                <canvas id="sentimentGauge" width="140" height="90"></canvas>
                <div class="muted" style="margin-top:4px; color: ${sentColor}">Sentiment ${sentiment.toFixed(2)}</div>
              </div>
              <div>
                <div class="muted">Predicted Close</div>
                <div class="stat">${predictedClose.toFixed(2)}</div>
              </div>
              <div>
                <div class="muted">Recommendation</div>
                <div class="stat" style="color: ${recoColor}">${score} - ${recommendation}</div>
              </div>
            </div>
          `;
          const sc = (document.getElementById('sentimentGauge') as HTMLCanvasElement)?.getContext('2d');
          if (sc) {
            const gaugePct = Math.max(0, Math.min(1, (Number(sentiment) + 1) / 2));
            upsertChart('sentimentGauge', sc, {
              type: 'doughnut',
              data: { datasets: [{ data: [gaugePct, 1 - gaugePct], backgroundColor: [THEME.success, THEME.border], borderWidth: 0 }] },
              options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '70%', rotation: -Math.PI, circumference: Math.PI }
            });
          }
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
    const msg = String(e?.message || e);
    const hint = /mcsymbol not found/i.test(msg) ? '<div class="muted" style="margin-top:6px">Mapping not found in stocklist. Update server/stocklist.ts for this symbol.</div>' : '';
    insightCard.innerHTML = `<div class="muted">MC Insight</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(msg)}</div>${hint}`;
  }
      try {
        const quick = await new Api().mcQuick(v);
        const quickCard = document.getElementById('mcquick')!;
        if (quick && quick.data) {
          const qd = quick.data || {};
          // Derive current price and intraday change from chart
          let price = 'N/A', changeStr = 'N/A', changeColor = 'var(--muted)';
          const series = qd.chart?.chartActulaData || qd.chart?.chartActualData || [];
          if (Array.isArray(series) && series.length >= 2) {
            const last = Number(series[series.length-1]?.value ?? NaN);
            const first = Number(series[0]?.value ?? NaN);
            if (!Number.isNaN(last)) price = last.toFixed(2);
            if (!Number.isNaN(last) && !Number.isNaN(first) && first !== 0) {
              const ch = last - first; const pct = (ch/first)*100;
              changeStr = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)} (${pct.toFixed(2)}%)`;
              changeColor = ch >= 0 ? 'var(--success)' : 'var(--danger)';
            }
          }
          // Also fetch today's volume quickly
          let volText = 'N/A';
          try {
            const pv = await new Api().mcPriceVolume(v);
            const volToday = pv?.data?.stock_price_volume_data?.volume?.Today;
            volText = volToday?.cvol_display_text || (typeof volToday?.cvol === 'number' ? String(volToday.cvol) : 'N/A');
          } catch {}
          // Forecast targets and sparkline from MC
          const fh = Number(qd.forecast?.high ?? NaN);
          const fm = Number(qd.forecast?.mean ?? NaN);
          const fl = Number(qd.forecast?.low ?? NaN);
          const fg: Array<[number, number]> = Array.isArray(qd.forecast?.graphData) ? qd.forecast.graphData : [];
          const hasForecast = Number.isFinite(fh) || Number.isFinite(fm) || Number.isFinite(fl) || fg.length > 1;
          const forecastHtml = hasForecast ? `
            <div class="muted" style="margin-top:10px">Forecast Targets</div>
            <div class="grid-3" style="gap:8px; font-size:12px">
              <div><div class="muted">High</div><div>${Number.isFinite(fh)? fh.toFixed(2):'N/A'}</div></div>
              <div><div class="muted">Mean</div><div>${Number.isFinite(fm)? fm.toFixed(2):'N/A'}</div></div>
              <div><div class="muted">Low</div><div>${Number.isFinite(fl)? fl.toFixed(2):'N/A'}</div></div>
            </div>
            ${fg.length > 1 ? `<canvas id="mcForecastSpark" class="sparkline" style="margin-top:6px"></canvas>` : ''}
          ` : '';
          // Yahoo fallback for current price and 52W range
          let y52h: string | null = null, y52l: string | null = null;
          try {
            const yf = await new Api().yahooFull(v, '1y', '1d', 'price,summaryDetail');
            const qprice = Number(yf?.data?.quote?.price ?? NaN);
            if (price === 'N/A' && Number.isFinite(qprice)) price = qprice.toFixed(2);
            const sd = yf?.data?.summary?.quoteSummary?.result?.[0]?.summaryDetail;
            const h = Number(sd?.fiftyTwoWeekHigh?.raw ?? sd?.fiftyTwoWeekHigh ?? NaN);
            const l = Number(sd?.fiftyTwoWeekLow?.raw ?? sd?.fiftyTwoWeekLow ?? NaN);
            if (Number.isFinite(h)) y52h = h.toFixed(2);
            if (Number.isFinite(l)) y52l = l.toFixed(2);
          } catch {}
          const wkHtml = (y52h || y52l) ? `
            <div class="muted" style="margin-top:10px">52W Range (Yahoo)</div>
            <div style="font-size:12px">${y52l ?? 'N/A'} � ${y52h ?? 'N/A'}</div>
          ` : '';
          // Render
          quickCard.innerHTML = `
            <div class="muted">MC Quick</div>
            <div class="grid-3" style="margin-top:6px; gap: 8px; align-items:center">
              <div><div class="muted">Price</div><div class="stat-sm">${price}</div></div>
              <div><div class="muted">Day Change</div><div class="stat-sm" style="color:${changeColor}">${changeStr}</div></div>
              <div><div class="muted">Volume (Today)</div><div class="stat-sm">${volText}</div></div>
            </div>
            ${forecastHtml}
            ${wkHtml}
          `;
          if (fg.length > 1) {
            const labels = fg.map(p=> new Date(p[0]*1000).toLocaleDateString());
            const values = fg.map(p=> Number(p[1]));
            const fc = (document.getElementById('mcForecastSpark') as HTMLCanvasElement)?.getContext('2d');
            if (fc && labels.length && values.length) {
              const lineColor = THEME.brand;
              const fillColor = withAlpha(THEME.brand, 0.12);
              upsertChart('mcForecastSpark', fc, {
                type: 'line',
                data: { labels, datasets: [{ data: values, borderColor: lineColor, backgroundColor: fillColor, borderWidth: 1.5, fill: true, tension: 0.25, pointRadius: 0 }] },
                options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
              });
            }
          }
        } else {
          quickCard.innerHTML = `<div class="muted">MC Quick</div><div class="muted" style="margin-top:6px">No data</div>`;
        }
  } catch (e: any) {
    const quickCard = document.getElementById('mcquick')!;
    const msg = String(e?.message || e);
    const hint = /mcsymbol not found/i.test(msg) ? '<div class="muted" style="margin-top:6px">Mapping not found in stocklist. Update server/stocklist.ts for this symbol.</div>' : '';
    quickCard.innerHTML = `<div class="muted">MC Quick</div><div class="mono" style="margin-top:6px;color:#ff6b6b">${escapeHtml(msg)}</div>${hint}`;
  }

      // Render Quality Scores (Durability / Valuation / Momentum)
      try { renderQualityScores(); } catch {}

  // Fetch and render MC Technicals
  renderMcTech(v, currentPivotType, currentTechFreq);

      // Fetch and render MC Price Volume
      renderMcPriceVolume(v);

      // Fetch and render MC Stock History
      renderMcStockHistory(v);

  // Trendlyne cards removed to improve performance
  // Render TL Cache summary (SMA/ADV)
  try { renderTlCache(v); } catch {}
  // Render stored features charts
  try { renderFeaturesStored(v); } catch {}

  // Render Quality Scores
  try { renderQualityScores(); } catch {}

  // Fetch and render MarketsMojo Valuation
      renderMarketsMojo();
      // Trendlyne Advanced Tech (cached + fast)
      try { renderTrendlyneAdvTech(v); } catch {}
      // Fetch and render Provider Resolution mapping
      renderProviderResolution(v);
      // Fetch and render Yahoo Data summary
      renderYahooData(v);
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

// Wire pivot buttons to switch pivot set
(() => {
  const map: Record<string, 'classic'|'fibonacci'|'camarilla'> = {
    pivotClassic: 'classic',
    pivotFibo: 'fibonacci',
    pivotCama: 'camarilla',
  } as const;
  // load saved pivot
  try {
    const saved = localStorage.getItem('mcPivotType') as any;
    if (saved && (['classic','fibonacci','camarilla'] as any).includes(saved)) {
      currentPivotType = saved;
      Object.entries(map).forEach(([id, type]) => { const el = document.getElementById(id); if (!el) return; if (type===saved) el.classList.add('active'); else el.classList.remove('active'); });
    } else {
      document.getElementById('pivotClassic')?.classList.add('active');
    }
  } catch {}
  Object.entries(map).forEach(([id, type]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      currentPivotType = type;
      // toggle active class
      Object.keys(map).forEach(k => document.getElementById(k)?.classList.remove('active'));
      el.classList.add('active');
      try { localStorage.setItem('mcPivotType', currentPivotType); } catch {}
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const symbol = sel?.value || '';
      if (symbol) renderMcTech(symbol, currentPivotType, currentTechFreq);
    });
  });
})();

// Wire frequency buttons to switch D/W/M
(()=>{
  const map: Record<string, 'D'|'W'|'M'> = { techFreqD: 'D', techFreqW: 'W', techFreqM: 'M' } as const;
  // load saved freq
  try {
    const saved = localStorage.getItem('mcTechFreq') as any;
    if (saved && (['D','W','M'] as any).includes(saved)) {
      currentTechFreq = saved;
      Object.entries(map).forEach(([id, f]) => { const el = document.getElementById(id); if (!el) return; if (f===saved) el.classList.add('active'); else el.classList.remove('active'); });
    } else {
      document.getElementById('techFreqD')?.classList.add('active');
    }
  } catch {}
  Object.entries(map).forEach(([id, freq]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', ()=>{
      currentTechFreq = freq;
      Object.keys(map).forEach(k => document.getElementById(k)?.classList.remove('active'));
      el.classList.add('active');
      try { localStorage.setItem('mcTechFreq', currentTechFreq); } catch {}
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const symbol = sel?.value || '';
      if (symbol) renderMcTech(symbol, currentPivotType, currentTechFreq);
    });
  });
})();

async function renderMcPriceVolume(symbol: string) {
  const pvCard = document.getElementById('mcPvBody')!;
  pvCard.innerHTML = `<div class="muted">Loading...</div>`;
  try {
    const pv = await api.mcPriceVolume(symbol);
    if (pv && pv.data) {
      const spv = pv.data?.stock_price_volume_data || {};
      const volToday = spv?.volume?.Today || {};
      const volYday = spv?.volume?.Yesterday || {};
      const volumeStr = volToday.cvol_display_text || (typeof volToday.cvol === 'number' ? String(volToday.cvol) : 'N/A');
      const bidTop = spv?.bid_offer?.bid?.[0];
      const offerTop = spv?.bid_offer?.offer?.[0];
      const bidPrice = bidTop?.price ?? 'N/A';
      const bidQty = bidTop?.qty ?? '0';
      const offerPrice = offerTop?.price ?? 'N/A';
      const offerQty = offerTop?.qty ?? '0';
      // Price performance (if present)
      const perf = spv?.price || {};
      const perfHtml = Object.keys(perf).length ? `
        <div class="muted" style="margin-top:8px">Performance</div>
        <div class="grid-3" style="gap:6px; font-size:12px; margin-top:4px">
          ${Object.entries(perf).map(([k,v]: any)=>{
            const n = Number(v);
            const col = n>=0? 'var(--success)':'var(--danger)';
            const sign = n>=0? '+':'';
            return `<div style=\"background:var(--panel-2); padding:6px; border-radius:8px; text-align:center; border:1px solid var(--border)\"><div class=\"muted\">${k}</div><div style=\"color:${col}\">${sign}${n}%</div></div>`;
          }).join('')}
        </div>` : '';

      pvCard.innerHTML = `
        <div class="grid-2" style="gap: 8px; font-size: 12px; align-items:center">
          <div>
            <div class="muted">Volume (Today vs Yesterday)</div>
            <canvas id="mcPvChart" style="max-height:120px; margin-top:6px"></canvas>
            ${perfHtml}
          </div>
          <div>
            <div><div class="muted">Volume</div><div>${volumeStr}</div></div>
            <div style="margin-top:8px"><div class="muted">Bid Price</div><div>${bidPrice} (${bidQty})</div></div>
            <div style="margin-top:8px"><div class="muted">Offer Price</div><div>${offerPrice} (${offerQty})</div></div>
          </div>
        </div>
        <div class="muted" style="font-size:11px; margin-top:6px">Source: /api/external/mc/price-volume?symbol=${escapeHtml(symbol)}</div>
      `;
      const pvc = (document.getElementById('mcPvChart') as HTMLCanvasElement)?.getContext('2d');
      if (pvc) {
        const t = Number(volToday.cvol || 0);
        const y = Number(volYday.cvol || 0);
        upsertChart('mcPvChart', pvc, {
          type: 'bar',
          data: { labels: ['Today','Yesterday'], datasets: [{ data: [t, y], backgroundColor: [THEME.brand, THEME.muted], borderWidth: 0 }] },
          options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display:false } }, y: { grid: { color: 'rgba(37,49,73,0.4)' }, ticks: { display: false } } } }
        });
      }
    } else {
      // Fallback: try Yahoo for basic volume spark
      try {
        const yf = await new Api().yahooFull(symbol, '1mo', '1d', 'price,summaryDetail');
        const chart = yf?.data?.chart || {};
        const ts: number[] = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
        const q = chart?.indicators?.quote?.[0] || {};
        const vol: number[] = Array.isArray(q?.volume) ? q.volume : [];
        if (ts.length && vol.length) {
          pvCard.innerHTML = `
            <div class="muted">Yahoo Volume (fallback)</div>
            <canvas id="mcPvChart" style="max-height:120px; margin-top:6px"></canvas>
            <div class="muted" style="font-size:11px; margin-top:6px">Source: Yahoo (fallback)</div>`;
          const ctx = (document.getElementById('mcPvChart') as HTMLCanvasElement)?.getContext('2d');
          if (ctx) {
            const labels = ts.map(t=> new Date(t*1000).toLocaleDateString());
            upsertChart('mcPvChart', ctx, { type:'bar', data:{ labels, datasets:[{ data: vol, backgroundColor: withAlpha(THEME.brand, 0.8), borderWidth: 0 }] }, options:{ plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'rgba(37,49,73,0.4)' }, ticks:{ display:false } } } } });
          }
        } else {
          pvCard.innerHTML = `<div class="muted">No price/volume data available.</div>`;
        }
      } catch {
        pvCard.innerHTML = `<div class="muted">No price/volume data available.</div>`;
      }
    }
  } catch (e: any) {
    // If MC lookup fails (e.g., no mcsymbol), show a helpful hint
    const msg = String(e?.message || e);
    if (/mcsymbol not found/i.test(msg)) {
      pvCard.innerHTML = `<div class="muted">Moneycontrol mapping not found for this symbol. Try another stock or update mapping in server/stocklist.ts.</div>`;
    } else {
      pvCard.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(msg)}</div>`;
    }
  }
}

// Trendlyne controls
(() => {
  const btn = document.getElementById('tlCookieRefresh');
  const status = document.getElementById('tlStatus');
  if (btn) {
    btn.addEventListener('click', async ()=>{
      try {
        if (status) status.textContent = 'Refreshing Trendlyne data�';
        const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
        const symbol = sel?.value || '';
        if (symbol) { try { renderTrendlyneAdvTech(symbol); } catch {} if (status) status.textContent = 'Trendlyne refreshed'; } else { if (status) status.textContent = 'Select a stock first'; }
      } catch (e:any) {
        if (status) status.textContent = `Refresh failed: ${e?.message || e}`;
      }
    });
  }
  const lb = document.getElementById('tlLookback') as HTMLSelectElement | null;
  if (lb) {
    lb.addEventListener('change', ()=>{
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const symbol = sel?.value || '';
      if (symbol) renderTrendlyneAdvTech(symbol);
    });
  }
})();

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Lightweight TA helpers for sparklines ---
function smaSeries(values: number[], period: number) {
  const p = Math.max(1, Math.floor(period));
  const out: number[] = []; let sum = 0; const q: number[] = [];
  for (const v of values) { q.push(v); sum += v; if (q.length > p) sum -= q.shift() as number; if (q.length === p) out.push(sum / p); }
  return out;
}
function emaSeries(values: number[], period: number) {
  const p = Math.max(1, Math.floor(period));
  const k = 2 / (p + 1);
  const out: number[] = []; let ema: number | null = null;
  for (const v of values) { ema = (ema === null) ? v : (v * k + (ema as number) * (1 - k)); out.push(ema); }
  return out;
}
function rsiSeries(values: number[], period=14) {
  const p = Math.max(1, Math.floor(period));
  const out: number[] = []; let avgGain = 0, avgLoss = 0; let prev = values[0];
  for (let i=1;i<values.length;i++) {
    const ch = values[i] - prev; prev = values[i];
    const gain = Math.max(0, ch); const loss = Math.max(0, -ch);
    if (i <= p) { avgGain += gain; avgLoss += loss; if (i === p) { avgGain /= p; avgLoss /= p; const rs = (avgLoss === 0) ? 100 : avgGain/avgLoss; out.push(100 - (100/(1+rs))); } }
    else { avgGain = ((avgGain*(p-1)) + gain)/p; avgLoss = ((avgLoss*(p-1)) + loss)/p; const rs = (avgLoss === 0) ? 100 : avgGain/avgLoss; out.push(100 - (100/(1+rs))); }
  }
  return out;
}
function macdLine(values: number[], fast=12, slow=26) {
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const out: number[] = [];
  const n = Math.min(emaFast.length, emaSlow.length);
  for (let i=0;i<n;i++) out.push(emaFast[i] - emaSlow[i]);
  return out;
}
function highest(arr: number[], from: number, len: number) { let m = -Infinity; for (let i=from-len+1;i<=from;i++){ const v=arr[i]; if (v>m) m=v; } return m; }
function lowest(arr: number[], from: number, len: number) { let m = Infinity; for (let i=from-len+1;i<=from;i++){ const v=arr[i]; if (v<m) m=v; } return m; }
function stochasticK(highs: number[], lows: number[], closes: number[], period=14) {
  const p = Math.max(1, Math.floor(period));
  const out: number[] = [];
  for (let i=p-1;i<closes.length;i++) {
    const hh = highest(highs, i, p); const ll = lowest(lows, i, p); const c = closes[i];
    const k = (hh === ll) ? 50 : ((c - ll)/(hh - ll))*100; out.push(k);
  }
  return out;
}
function cciSeries(highs: number[], lows: number[], closes: number[], period=20) {
  const p = Math.max(1, Math.floor(period));
  const tp = highs.map((h,i)=> (h + lows[i] + closes[i]) / 3);
  const sma = smaSeries(tp, p);
  const out: number[] = [];
  for (let i=p-1;i<tp.length;i++) {
    const slice = tp.slice(i-p+1, i+1);
    const avg = sma[i-(p-1)];
    const md = slice.reduce((acc,v)=> acc + Math.abs(v-avg), 0)/p;
    const cci = md === 0 ? 0 : (tp[i] - avg) / (0.015 * md);
    out.push(cci);
  }
  return out;
}
function momentumSeries(values: number[], period=10) {
  const p = Math.max(1, Math.floor(period)); const out: number[] = [];
  for (let i=p;i<values.length;i++){ out.push(values[i] - values[i-p]); }
  return out;
}
function williamsR(highs: number[], lows: number[], closes: number[], period=14) {
  const p = Math.max(1, Math.floor(period)); const out: number[] = [];
  for (let i=p-1;i<closes.length;i++) {
    const hh = highest(highs, i, p); const ll = lowest(lows, i, p); const c = closes[i];
    const wr = (hh === ll) ? -50 : ((hh - c)/(hh - ll))*-100; out.push(wr);
  }
  return out;
}
function stochRsiSeries(values: number[], period=14) {
  const r = rsiSeries(values, period);
  // stochastic over RSI values
  const out: number[] = []; const p = Math.max(1, Math.floor(period));
  for (let i=p-1;i<r.length;i++) {
    const window = r.slice(i-p+1, i+1); const min = Math.min(...window), max = Math.max(...window);
    const k = (max === min) ? 50 : ((r[i] - min)/(max - min))*100; out.push(k);
  }
  return out;
}

async function renderTrendlyneAdvTech(symbol: string) {
  const el = document.getElementById('tlBody');
  if (!el) return;
  el.innerHTML = '<div class="muted">Loading Trendlyne...</div>';
  try {
    // Try adv-tech; backend resolves tlid and ensures cookie
    const lbSel = document.getElementById('tlLookback') as HTMLSelectElement | null;
    const lookback = lbSel ? Number(lbSel.value || 24) : 24;
    // Prefer TLID if available
    const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    let tlidPref: string | undefined;
    try {
      const r = await new Api().resolveTicker(base);
      tlidPref = r?.data?.entry?.tlid || undefined;
    } catch {}
    let res = tlidPref
      ? await new Api().tlAdvTechByTlid(tlidPref, { lookback })
      : await new Api().tlAdvTechBySymbol(symbol, { lookback });
    let data = res?.data || {};
    if ((!data?.adv && !data?.sma)) {
      // Force cookie refresh once as fallback
      res = tlidPref
        ? await new Api().tlAdvTechByTlid(tlidPref, { force: true, lookback })
        : await new Api().tlAdvTechBySymbol(symbol, { force: true, lookback });
      data = res?.data || {};
    }
    const tlid = data.tlid || '';
    const adv = data.adv || null;
    const sma = data.sma || null;
    const normalized = (data as any).normalized || null;

    // Compact, decongested render using normalized summary (fast path)
    try {
      const score = (adv as any)?.score ?? (normalized as any)?.score ?? '-';
      const signal = (adv as any)?.signal ?? (adv as any)?.trend ?? (normalized as any)?.signal ?? '-';
      const sum = (adv as any)?.summary || (normalized as any)?.summary || {};
      const buy = Number(sum.buy ?? 0), neutral = Number(sum.neutral ?? 0), sell = Number(sum.sell ?? 0);
      const total = Math.max(1, buy + neutral + sell);
      const buyPct = Math.round((buy/total)*100), neutPct = Math.round((neutral/total)*100), sellPct = Math.round((sell/total)*100);
      const tb: string[] = (normalized as any)?.topBullish || [];
      const tr: string[] = (normalized as any)?.topBearish || [];
      const decision = (normalized as any)?.decision || '';
      const decColor = /bull/i.test(decision) ? THEME.success : /bear/i.test(decision) ? THEME.danger : THEME.muted;

      const chips = `
        <span class="chip" style="background:${withAlpha(THEME.brand,0.15)}; color:${THEME.brand}">Score: ${escapeHtml(String(score))}</span>
        <span class="chip" style="background:${withAlpha('#64748b',0.18)}; color:#64748b">Signal: ${escapeHtml(String(signal))}</span>
        <span class="chip" style="background:${withAlpha(decColor,0.15)}; color:${decColor}">${escapeHtml(decision || 'Neutral')}</span>`;

      const summary = `
        <div class="grid-3" style="gap:8px; margin-top:6px">
          <div class="kpi"><div class="muted">Buy</div><div class="stat-sm" style="color:${THEME.success}">${buy} (${buyPct}%)</div></div>
          <div class="kpi"><div class="muted">Neutral</div><div class="stat-sm">${neutral} (${neutPct}%)</div></div>
          <div class="kpi"><div class="muted">Sell</div><div class="stat-sm" style="color:${THEME.danger}">${sell} (${sellPct}%)</div></div>
        </div>`;
      // Strip fallback oscillator/pivot canvases; rely on separate cards
      try {
        const oc = document.getElementById('tlOscBars');
        if (oc && oc.parentElement) oc.parentElement.remove();
        const pc = document.getElementById('tlPivotBars');
        if (pc && pc.parentElement) pc.parentElement.remove();
      } catch {}

      const lists = `
        <div class="grid-2" style="gap:8px; margin-top:8px">
          <div class="kpi"><div class="section-title" style="margin-top:0">Top Bullish</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap">${tb.slice(0,5).map((x:string)=>`<span class="chip" style="background:${withAlpha(THEME.success,0.15)}; color:${THEME.success}">${escapeHtml(x)}</span>`).join(' ') || '<span class="muted">None</span>'}
            </div></div>
          <div class="kpi"><div class="section-title" style="margin-top:0">Top Bearish</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap">${tr.slice(0,5).map((x:string)=>`<span class="chip" style="background:${withAlpha(THEME.danger,0.15)}; color:${THEME.danger}">${escapeHtml(x)}</span>`).join(' ') || '<span class="muted">None</span>'}
            </div></div>
        </div>`;

      // Pull richer parameters (if present) for concise sections
      const body = (adv && (adv as any).body) || (adv as any) || {};
      const params: any = (body as any).parameters || {};
      const maSig = params.ma_signal || {};
      const oscSig = params.oscillator_signal || (body as any).oscillator_signal || {};
      const piv = params.pivot_level || {};
      const rsi = params.rsi || (body as any).rsi || null;
      const macd = params.macd || (body as any).macd || null;
      const momentum = params.momentum || (body as any).momentum || null;
      const priceAnalysis: any[] = Array.isArray(params.price_analysis) ? params.price_analysis : [];
      const betaAnalysis: any[] = Array.isArray(params.beta_analysis) ? params.beta_analysis : [];
      const vol = params.volume_analysis || {};
      const cndl = (params.candlesticks_active || {}) as any;
      const bullC = Array.isArray(cndl.bullish_candlestick) ? cndl.bullish_candlestick.map((c:any)=> String(c?.name||'')).filter(Boolean) : [];
      const bearC = Array.isArray(cndl.bearish_candlestick) ? cndl.bearish_candlestick.map((c:any)=> String(c?.name||'')).filter(Boolean) : [];

      // Render Pivot Levels into separate card
      const pv = (piv && (typeof piv === 'object')) ? piv : {};
      const pvItem = (k: string, label: string) => {
        const v = (pv as any)[k]?.value ?? (pv as any)[k] ?? '';
        return `<div class="kpi"><div class="muted">${label}</div><div class="stat-sm">${escapeHtml(String(v))}</div></div>`;
      };
      const pivHtml = `
        <div class="grid-3" style="gap:8px; margin-top:6px">
          ${pvItem('S3','S3')}${pvItem('S2','S2')}${pvItem('S1','S1')}
          ${pvItem('pivot_point','Pivot')}${pvItem('R1','R1')}${pvItem('R2','R2')}
          ${pvItem('R3','R3')}
        </div>`;
      try { const pvEl = document.getElementById('tlPivotBody'); if (pvEl) pvEl.innerHTML = pivHtml; } catch {}

      // Render Oscillator Details into separate card (with candlesticks)
      const oscList: any[] = Array.isArray(params.oscillator_parameter) ? params.oscillator_parameter : (Array.isArray((body as any).oscillator_parameter) ? (body as any).oscillator_parameter : []);
      const oscRows = oscList.slice(0, 12).map((o:any) => {
        const name = String(o?.name || '');
        const val = Number(o?.value);
        const col = /positive/i.test(String(o?.color||'')) ? THEME.success : /negative/i.test(String(o?.color||'')) ? THEME.danger : THEME.muted;
        const desc = String(o?.insight?.shorttext || o?.description || '');
        return `<div class=\"kpi\"><div class=\"muted\">${escapeHtml(name)}</div><div class=\"stat-sm\" style=\"color:${col}\">${Number.isFinite(val)? val.toFixed(2): '-'}</div>${desc?`<div class=\\\"muted\\\" style=\\\"font-size:11px\\\">${escapeHtml(desc)}</div>`:''}</div>`;
      }).join('');
      const cndlHtml = `
        <div class="kpi" style="margin-top:8px"><div class="section-title" style="margin-top:0">Candlestick Patterns</div>
          <div class="grid-2" style="gap:8px">
            <div><div class="muted">Bullish</div><div style="display:flex; gap:6px; flex-wrap:wrap">${bullC.slice(0,6).map(n=>`<span class="chip" style="background:${withAlpha(THEME.success,0.15)}; color:${THEME.success}">${escapeHtml(n)}</span>`).join(' ') || '<span class="muted">None</span>'}</div></div>
            <div><div class="muted">Bearish</div><div style="display:flex; gap:6px; flex-wrap:wrap">${bearC.slice(0,6).map(n=>`<span class="chip" style="background:${withAlpha(THEME.danger,0.15)}; color:${THEME.danger}">${escapeHtml(n)}</span>`).join(' ') || '<span class="muted">None</span>'}</div></div>
          </div>
        </div>`;
      try { const detEl = document.getElementById('tlOscDetailsBody'); if (detEl) detEl.innerHTML = (oscRows ? `<div class=\"grid-3\" style=\"gap:8px\">${oscRows}</div>` : '<div class=\"muted\">No oscillator details</div>') + cndlHtml; } catch {}

      // Render Oscillator Values bar chart into separate card
      try {
        const labels = oscList.map((o:any)=> String(o?.name||''));
        const values = oscList.map((o:any)=> Number(o?.value??0));
        const ctx = (document.getElementById('tlOscBars') as HTMLCanvasElement)?.getContext('2d');
        if (ctx && labels.length) {
          upsertChart('tlOscBars', ctx, {
            type:'bar', data:{ labels, datasets:[{ label:'Value', data: values, backgroundColor: THEME.brand, borderWidth:0 }] }, options:{ indexAxis:'y',
              plugins:{ legend:{ display:false }, tooltip:{ enabled:true } }, scales:{ x:{ beginAtZero:true }, y:{ ticks:{ autoSkip:false, font:{ size:10 } } } } }
          });
        }
      } catch {}

      // MA/OSC summary chips
      const maChips = `
        <span class="chip" style="background:${withAlpha(THEME.success,0.15)}; color:${THEME.success}">SMA: ${Number(maSig.sma_bullish||0)} / ${Number(maSig.sma_total||0)}</span>
        <span class="chip" style="background:${withAlpha(THEME.info,0.15)}; color:${THEME.info}">EMA: ${Number(maSig.ema_bullish||0)} / ${Number(maSig.ema_total||0)}</span>
        <span class="chip" style="background:${withAlpha(THEME.brand,0.12)}; color:${THEME.brand}">OSC: ${Number(oscSig.bullish||0)} buy / ${Number(oscSig.bearish||0)} sell</span>`;

      

      // Key indicators mini-cards
      const keyInd = `
        <div class="grid-3" style="gap:8px; margin-top:6px">
          <div class="kpi"><div class="muted">RSI</div><div class="stat-sm">${escapeHtml(String(rsi?.value ?? '-'))}</div><div class="muted" style="font-size:11px">${escapeHtml(String(rsi?.insight?.shorttext || ''))}</div></div>
          <div class="kpi"><div class="muted">MACD</div><div class="stat-sm">${escapeHtml(String(macd?.value ?? '-'))}</div><div class="muted" style="font-size:11px">${escapeHtml(String(macd?.insight?.shorttext || ''))}</div></div>
          <div class="kpi"><div class="muted">Momentum</div><div class="stat-sm">${escapeHtml(String(momentum?.value ?? '-'))}</div><div class="muted" style="font-size:11px">${escapeHtml(String(momentum?.insight?.shorttext || ''))}</div></div>
        </div>`;

      // Price analysis quick chips (show 1D, 1W, 1M if present)
      const pick = (name: string) => priceAnalysis.find(pa => String(pa?.name||'').toLowerCase().includes(name));
      const pa1d = pick('1 day'); const pa1w = pick('1 week'); const pa1m = pick('1 month');
      function paChip(pa:any) {
        if (!pa) return '';
        const n = Number(pa.changePercentSafe ?? pa.changePercent ?? pa.change ?? 0);
        const col = n>=0 ? THEME.success : THEME.danger;
        const sign = n>=0 ? '+' : '';
        return `<span class="chip" style="background:${withAlpha(col,0.15)}; color:${col}">${escapeHtml(pa.name)}: ${sign}${n.toFixed(2)}%</span>`;
      }
      const paChips = [pa1d, pa1w, pa1m].map(paChip).filter(Boolean).join(' ');

      // Beta quick chips (1M, 1Y)
      const beta1m = betaAnalysis.find(b => /1\s*month/i.test(String(b?.label||'')));
      const beta1y = betaAnalysis.find(b => /1\s*year/i.test(String(b?.label||'')));
      function betaChip(b:any) { if (!b) return ''; const v = Number(b.data); const col = /positive/i.test(String(b.color||'')) ? THEME.success : /negative/i.test(String(b.color||'')) ? THEME.danger : THEME.muted; return `<span class="chip" style="background:${withAlpha(col,0.15)}; color:${col}">${escapeHtml(String(b.label))}: ${Number.isFinite(v)? v.toFixed(2): '-'}</span>`; }
      const betaChips = [beta1m, beta1y].map(betaChip).filter(Boolean).join(' ');

      

      const src = `/api/external/trendlyne/adv-tech?symbol=${encodeURIComponent(base)}&lookback=${encodeURIComponent(String(lookback))}`;
      el.innerHTML = `
        <div class="muted">TLID: ${escapeHtml(String(tlid || 'N/A'))} • Lookback: ${escapeHtml(String(lookback))} • <a href="${src}" target="_blank">source</a></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px">${chips}</div>
        ${summary}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px">${maChips}</div>
        ${keyInd}
        ${paChips ? `<div style=\"display:flex; gap:6px; flex-wrap:wrap; margin-top:6px\"><div class=\"muted\">Price Window:</div> ${paChips}</div>` : ''}
        ${betaChips ? `<div style=\"display:flex; gap:6px; flex-wrap:wrap; margin-top:6px\"><div class=\"muted\">Beta:</div> ${betaChips}</div>` : ''}
        <details style="margin-top:8px"><summary class="muted">More details</summary>
          ${vol?.tableData ? `<div class=\"muted\" style=\"margin-top:6px\">Volume (BSE+NSE Avg / Delivery%)</div>` : ''}
          ${Array.isArray(vol?.tableData) ? `<table class=\"data-grid\"><thead><tr><th>Period</th><th>Avg</th><th>Delivery%</th><th>Delivery Vol</th></tr></thead><tbody>${(vol.tableData as any[]).slice(0,4).map(r=>`<tr><td>${escapeHtml(String(r?.[0]||''))}</td><td>${escapeHtml(String(r?.[1]||''))}</td><td>${escapeHtml(String(r?.[2]||''))}</td><td>${escapeHtml(String(r?.[3]||''))}</td></tr>`).join('')}</tbody></table>` : ''}
          <div class="muted" style="margin-top:6px">Raw JSON</div>
          <pre class="mono" style="white-space:pre-wrap; max-height:260px; overflow:auto">${escapeHtml(JSON.stringify(adv || data || {}, null, 2))}</pre>
        </details>`;
      return;
    } catch {}

    // If normalized missing, fall back to existing detailed render (below)
    // If raw adv JSON has parameters, build a graphics-first report directly from raw
    const body = (adv && (adv as any).body) || null;
    const params = (body && (body as any).parameters) || null;
    if (params) {
      // Prepare containers
      const tlApiUrl = tlid ? `https://trendlyne.com/equity/api/stock/adv-technical-analysis/${encodeURIComponent(String(tlid))}/24/` : '';
      const pivotLong = String((params as any)?.pivot_level?.insight?.longtext || (params as any)?.pivot_level?.insight?.shorttext || '');
      el.innerHTML = `
        <div class="kpi">
          <div class="section-title" style="margin-top:0">Moving Averages (Days) � SMA vs EMA</div>
          <canvas id="tlMaBars" style="max-height:220px"></canvas>
        </div>
        <div class="grid-2" style="gap:12px; margin-top:8px">
          <div class="kpi">
            <div class="section-title" style="margin-top:0">MA Signals</div>
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:6px">
              <div style="flex:1; min-width:180px"><div class="muted">SMA Bullish/Bearish</div><canvas id="tlSmaSignalPie"></canvas></div>
              <div style="flex:1; min-width:180px"><div class="muted">EMA Bullish/Bearish</div><canvas id="tlEmaSignalPie"></canvas></div>
            </div>
          </div>
          <div class="kpi">
            <div class="section-title" style="margin-top:0">Oscillators � Values</div>
            <canvas id="tlOscBars" style="max-height:220px"></canvas>
          </div>
        </div>
        <div class="kpi" style="margin-top:8px">
          <div class="section-title" style="margin-top:0">Pivot Levels vs Current Price</div>
          <canvas id="tlPivotBars" style="max-height:220px"></canvas>
          ${pivotLong ? `<div class=\"muted\" style=\"margin-top:6px\">${escapeHtml(pivotLong)}</div>` : ''}
        </div>
        <div class="kpi" style="margin-top:8px">
          <div class="section-title" style="margin-top:0">Raw JSON (Trendlyne API)</div>
          ${tlApiUrl ? `<div class=\"muted\" style=\"font-size:11px; margin-bottom:6px\">TL API: <a href=\"${tlApiUrl}\" target=\"_blank\">${tlApiUrl}</a></div>` : ''}
          <pre class="mono" style="white-space:pre-wrap; max-height:260px; overflow:auto">${escapeHtml(JSON.stringify(adv, null, 2))}</pre>
        </div>`;

      // Moving Averages bar chart (grouped SMA/EMA)
      try {
        const smaList = Array.isArray((params as any).sma_parameters) ? (params as any).sma_parameters : [];
        const emaList = Array.isArray((params as any).ema_parameters) ? (params as any).ema_parameters : [];
        const labelsSet = new Set<string>();
        smaList.forEach((x:any)=> labelsSet.add(String(x?.name||'')));
        emaList.forEach((x:any)=> labelsSet.add(String(x?.name||'')));
        const labels = Array.from(labelsSet).sort((a,b)=> parseInt(a) - parseInt(b));
        const smaMap = new Map<string, number>(); smaList.forEach((x:any)=> smaMap.set(String(x?.name||''), Number(x?.value ?? NaN)));
        const emaMap = new Map<string, number>(); emaList.forEach((x:any)=> emaMap.set(String(x?.name||''), Number(x?.value ?? NaN)));
        const smaVals = labels.map(l=> smaMap.get(l) ?? NaN);
        const emaVals = labels.map(l=> emaMap.get(l) ?? NaN);
        const ctx = (document.getElementById('tlMaBars') as HTMLCanvasElement)?.getContext('2d');
        if (ctx && labels.length) {
          upsertChart('tlMaBars', ctx, {
            type: 'bar',
            data: { labels, datasets: [
              { label:'SMA', data: smaVals, backgroundColor: withAlpha(THEME.brand, 0.7) },
              { label:'EMA', data: emaVals, backgroundColor: withAlpha(THEME.muted, 0.7) },
            ] },
            options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' }, valueLabels:{ enabled:true, precision:2, color:'#374151' } }, scales:{ x:{ ticks:{ autoSkip:true, maxTicksLimit:8 } }, y:{ beginAtZero:false } } }
          });
        }
      } catch {}

      // Oscillator bars (sorted by value desc)
      try {
        const osc = Array.isArray((params as any).oscillator_parameter) ? (params as any).oscillator_parameter : [];
        const sorted = osc.slice().sort((a:any,b:any)=> Number(b?.value??0) - Number(a?.value??0));
        const labels = sorted.map((o:any)=> String(o?.name||''));
        const values = sorted.map((o:any)=> Number(o?.value ?? 0));
        const colors = sorted.map((o:any)=> {
          const c = String(o?.color||'').toLowerCase();
          return c==='positive' ? withAlpha(THEME.success,0.8) : c==='negative' ? withAlpha(THEME.danger,0.8) : withAlpha(THEME.muted,0.8);
        });
        // Fallback oscillator bar chart removed (handled in separate card)
      } catch {}

        // MA Signals pies (SMA & EMA) + insight text
        try {
          const ms = (body as any)?.ma_signal || {};
          const smaBull = Number(ms.sma_bullish ?? 0), smaBear = Number(ms.sma_bearish ?? 0);
          const emaBull = Number(ms.ema_bullish ?? 0), emaBear = Number(ms.ema_bearish ?? 0);
          const smaInsight = String(ms.sma_insight || '');
          const emaInsight = String(ms.ema_insight || '');
          const smaCtx = (document.getElementById('tlSmaSignalPie') as HTMLCanvasElement)?.getContext('2d');
          if (smaCtx) {
            upsertChart('tlSmaSignalPie', smaCtx, { type:'doughnut', data:{ labels:['Bullish','Bearish'], datasets:[{ data:[smaBull,smaBear], backgroundColor:[THEME.success, THEME.danger], borderWidth:0 }] }, options:{ plugins:{ legend:{ display:true, position:'bottom' }, tooltip:{ enabled:true }, valueLabels: { enabled:true, piePercent:true, precision:0, color:'#374151' } }, cutout:'60%' } });
          }
          const emaCtx = (document.getElementById('tlEmaSignalPie') as HTMLCanvasElement)?.getContext('2d');
          if (emaCtx) {
            upsertChart('tlEmaSignalPie', emaCtx, { type:'doughnut', data:{ labels:['Bullish','Bearish'], datasets:[{ data:[emaBull,emaBear], backgroundColor:[THEME.success, THEME.danger], borderWidth:0 }] }, options:{ plugins:{ legend:{ display:true, position:'bottom' }, tooltip:{ enabled:true }, valueLabels: { enabled:true, piePercent:true, precision:0, color:'#374151' } }, cutout:'60%' } });
          }
          try {
            const piesWrap = (document.getElementById('tlSmaSignalPie') as HTMLCanvasElement)?.parentElement?.parentElement;
            if (piesWrap && (smaInsight || emaInsight)) {
              const txt = `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">${escapeHtml([smaInsight, emaInsight].filter(Boolean).join(' \u2014 '))}</div>`;
              piesWrap.insertAdjacentHTML('beforeend', txt);
            }
          } catch {}
        } catch {}

      // Fallback pivot chart removed (handled in separate card)

      // Parameter cards � present each parameter in its own enriched card
      try {
        const cards: string[] = [];

        // Price snapshot (current vs start)
        const cp = Number((params as any)?.current_price ?? NaN);
        const sp = Number((params as any)?.startPrice ?? NaN);
        if (Number.isFinite(cp) || Number.isFinite(sp)) {
          const ch = (Number.isFinite(cp) && Number.isFinite(sp)) ? (cp - sp) : 0;
          const pct = (Number.isFinite(cp) && Number.isFinite(sp) && sp !== 0) ? ((cp - sp)/sp)*100 : 0;
          const col = ch > 0 ? 'var(--success)' : ch < 0 ? 'var(--danger)' : 'var(--muted)';
          cards.push(`
            <div class=\"kpi\" style=\"margin-top:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">Price Snapshot</div>
              <div class=\"grid-3\" style=\"gap:8px; align-items:center\">
                <div><div class=\"muted\">Current Price</div><div class=\"stat-sm\">${Number.isFinite(cp)?cp.toFixed(2):'-'}</div></div>
                <div><div class=\"muted\">Start Price</div><div class=\"stat-sm\">${Number.isFinite(sp)?sp.toFixed(2):'-'}</div></div>
                <div><div class=\"muted\">Change</div><div class=\"stat-sm\" style=\"color:${col}\">${Number.isFinite(ch)?(ch>=0?'+':'')+ch.toFixed(2):'-'}${Number.isFinite(pct)?` (${pct.toFixed(2)}%)`:''}</div></div>
              </div>
            </div>`);
        }

        // SMA parameters table
        const sparams = Array.isArray((params as any)?.sma_parameters) ? (params as any).sma_parameters : [];
        if (sparams.length) {
          const rows = sparams.map((p:any)=> `<tr><td class=\"muted\">${escapeHtml(String(p?.name||''))}</td><td style=\"text-align:right\">${escapeHtml(String(Number(p?.value ?? 0).toFixed(2)))}</td></tr>`).join('');
          cards.push(`
            <div class=\"kpi\" style=\"margin-top:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">SMA Parameters</div>
              <table style=\"width:100%; font-size:12px; margin-top:4px\"><tbody>${rows}</tbody></table>
            </div>`);
        }

        // EMA parameters table
        const eparams = Array.isArray((params as any)?.ema_parameters) ? (params as any).ema_parameters : [];
        if (eparams.length) {
          const rows = eparams.map((p:any)=> `<tr><td class=\"muted\">${escapeHtml(String(p?.name||''))}</td><td style=\"text-align:right\">${escapeHtml(String(Number(p?.value ?? 0).toFixed(2)))}</td></tr>`).join('');
          cards.push(`
            <div class=\"kpi\" style=\"margin-top:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">EMA Parameters</div>
              <table style=\"width:100%; font-size:12px; margin-top:4px\"><tbody>${rows}</tbody></table>
            </div>`);
        }

        // Oscillator mini-cards with optional sparklines and longtext
        const oscParams = Array.isArray((params as any)?.oscillator_parameter) ? (params as any).oscillator_parameter : [];
        if (oscParams.length) {
          // fetch history once for sparkline computation
          let histRows: any[] = [];
          try {
            const hres = await new Api().history(symbol);
            histRows = Array.isArray(hres?.data) ? hres.data.slice(-180) : [];
          } catch {}
          const closes = histRows.map(r=> Number(r.close)).filter(n=>Number.isFinite(n));
          const highs = histRows.map(r=> Number(r.high)).filter(n=>Number.isFinite(n));
          const lows = histRows.map(r=> Number(r.low)).filter(n=>Number.isFinite(n));
          const grid = oscParams.map((o:any, idx:number)=>{
            const name = String(o?.name||'');
            const v = Number(o?.value ?? NaN);
            const color = String(o?.color||'').toLowerCase();
            const col = color==='positive' ? 'var(--success)' : color==='negative' ? 'var(--danger)' : 'var(--muted)';
            const longt = (o?.insight && o.insight.longtext) ? String(o.insight.longtext) : '';
            const desc = o?.description ? String(o.description) : '';
            const noteText = longt || desc;
            const note = noteText ? `<div class=\"muted\" style=\"font-size:11px; margin-top:4px\">${escapeHtml(noteText)}</div>` : '';
            const cid = `oscSpark_${idx}`;
            return `<div class=\"kpi\" style=\"padding:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">${escapeHtml(name)}</div>
              <div class=\"stat-sm\" style=\"color:${col}\">${Number.isFinite(v)?v.toFixed(2):'-'}</div>
              <canvas id=\"${cid}\" class=\"sparkline\" style=\"margin-top:4px\"></canvas>
              ${note}
            </div>`;
          }).join('');
          const wrapperId = 'oscGridWrap';
          cards.push(`<div class=\"kpi\" id=\"${wrapperId}\" style=\"margin-top:8px\"><div class=\"section-title\" style=\"margin-top:0\">Oscillator Details</div><div class=\"grid-2\" style=\"gap:8px\">${grid}</div></div>`);
          // Insert cards and then render sparklines if we have price series
          // We will compute minimal indicator series per oscillator label
          queueMicrotask(() => {
            if (!closes.length) return;
            oscParams.forEach((o:any, idx:number) => {
              const name = String(o?.name||'');
              let series: number[] | null = null; let labels: string[] | null = null;
              let thresholds: Array<{value:number, color:string}> = [];
              let yMin: number | undefined; let yMax: number | undefined;
              try {
                if (/^RSI\s*\((\d+)\)/i.test(name)) {
                  const m = name.match(/\((\d+)\)/); const p = m ? Number(m[1]) : 14; series = rsiSeries(closes, p);
                  thresholds = [{ value: 30, color: THEME.danger }, { value: 70, color: THEME.success }];
                  yMin = 0; yMax = 100;
                } else if (/^MACD/i.test(name)) {
                  const m = name.match(/\((\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*)\)/);
                  const f = m ? Number(m[2]) : 12; const s = m ? Number(m[3]) : 26; series = macdLine(closes, f, s);
                  thresholds = [{ value: 0, color: THEME.muted }];
                } else if (/Stochastic\s*RSI/i.test(name)) {
                  series = stochRsiSeries(closes, 14);
                  thresholds = [{ value: 20, color: THEME.danger }, { value: 80, color: THEME.success }];
                  yMin = 0; yMax = 100;
                } else if (/Stochastic\s*Oscillator/i.test(name)) {
                  series = stochasticK(highs, lows, closes, 14);
                  thresholds = [{ value: 20, color: THEME.danger }, { value: 80, color: THEME.success }];
                  yMin = 0; yMax = 100;
                } else if (/CCI\s*(\d+)/i.test(name)) {
                  const m = name.match(/(\d+)/); const p = m ? Number(m[1]) : 20; series = cciSeries(highs, lows, closes, p);
                  thresholds = [{ value: -100, color: THEME.danger }, { value: 100, color: THEME.success }];
                  yMin = -200; yMax = 200;
                } else if (/Momentum/i.test(name)) {
                  series = momentumSeries(closes, 10);
                  thresholds = [{ value: 0, color: THEME.muted }];
                } else if (/William/i.test(name)) { // Williams %R
                  series = williamsR(highs, lows, closes, 14);
                  thresholds = [{ value: -80, color: THEME.danger }, { value: -20, color: THEME.success }];
                  yMin = -100; yMax = 0;
                }
              } catch {}
              if (!series || series.length < 5) return;
              // Trim to last N points and build labels
              const last = series.slice(-40);
              labels = last.map((_v,_i)=> '');
              const ctx = (document.getElementById(`oscSpark_${idx}`) as HTMLCanvasElement)?.getContext('2d');
              if (ctx) {
                const threshDatasets = thresholds.map(t => ({
                  data: Array(last.length).fill(t.value),
                  borderColor: withAlpha(t.color, 0.9),
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderDash: [4,4],
                  pointRadius: 0,
                  fill: false,
                  tension: 0,
                  order: 0,
                }));
                upsertChart(`oscSpark_${idx}`, ctx, {
                  type: 'line', data: { labels, datasets: [...threshDatasets, { data: last, borderColor: THEME.brand, backgroundColor: withAlpha(THEME.brand,0.12), borderWidth: 1.2, tension: 0.25, pointRadius: 0, fill: true, order: 1 }] },
                  options: { plugins: { legend: { display:false }, tooltip: { enabled:false }, valueLabels: { enabled:true, lastValue:true, precision: 2, color: THEME.brand } }, scales: { x: { display:false }, y: { display:false, suggestedMin: yMin, suggestedMax: yMax } } }
                });
              }
            });
          });
        }

        // Candlesticks active
        const cAct = (params as any)?.candlesticks_active || {};
        const bulls = Array.isArray(cAct?.bullish_candlestick) ? cAct.bullish_candlestick : [];
        const bears = Array.isArray(cAct?.bearish_candlestick) ? cAct.bearish_candlestick : [];
        if (bulls.length || bears.length) {
          const bullChips = bulls.map((x:any)=>{
            const isObj = x && typeof x === 'object';
            const name = isObj ? (x.name || x.pattern || x.key || String(x)) : String(x);
            const desc = isObj ? (x.description || (x.insight && (x.insight.longtext || x.insight.shorttext)) || '') : '';
            const title = desc ? ` title=\"${escapeHtml(String(desc))}\"` : '';
            return `<span class=\"chip\"${title} style=\"background:${withAlpha(THEME.success,0.15)}; color:${THEME.success}\">${escapeHtml(String(name))}</span>`;
          }).join(' ');
          const bearChips = bears.map((x:any)=>{
            const isObj = x && typeof x === 'object';
            const name = isObj ? (x.name || x.pattern || x.key || String(x)) : String(x);
            const desc = isObj ? (x.description || (x.insight && (x.insight.longtext || x.insight.shorttext)) || '') : '';
            const title = desc ? ` title=\"${escapeHtml(String(desc))}\"` : '';
            return `<span class=\"chip\"${title} style=\"background:${withAlpha(THEME.danger,0.15)}; color:${THEME.danger}\">${escapeHtml(String(name))}</span>`;
          }).join(' ');
          cards.push(`
            <div class=\"kpi\" style=\"margin-top:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">Active Candlesticks</div>
              <div class=\"muted\">Bullish (${bulls.length})</div><div style=\"margin-top:4px\">${bullChips || '<span class=\\\"muted\\\">None</span>'}</div>
              <div class=\"muted\" style=\"margin-top:8px\">Bearish (${bears.length})</div><div style=\"margin-top:4px\">${bearChips || '<span class=\\\"muted\\\">None</span>'}</div>
            </div>`);
        }

        // Momentum (score + longtext)
        try {
          const momentum = (body as any)?.momentum || null;
          const mVal = Number(momentum?.value ?? NaN);
          const mColor = String(momentum?.color || '').toLowerCase();
          const mCol = mColor==='positive' ? 'var(--success)' : mColor==='negative' ? 'var(--danger)' : THEME.brand;
          const mLong = String(momentum?.insight?.longtext || momentum?.insight?.shorttext || '');
          if (momentum) {
            cards.push(`
              <div class=\"kpi\" style=\"margin-top:8px\">
                <div class=\"section-title\" style=\"margin-top:0\">${escapeHtml(String(momentum?.name || 'Momentum'))}</div>
                <div class=\"stat-sm\" style=\"color:${mCol}\">${Number.isFinite(mVal)?mVal.toFixed(2):'-'}</div>
                ${mLong ? `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">${escapeHtml(mLong)}</div>` : ''}
              </div>`);
          }
        } catch {}

        // Available frequency chips
        const freq = (params as any)?.available_frequency || null;
        if (freq && typeof freq === 'object') {
          const chips = Object.keys(freq).map(k=> `<span class=\"chip\" style=\"background:${withAlpha(THEME.brand,0.12)}; color:${THEME.brand}\">${escapeHtml(k)}</span>`).join(' ');
          cards.push(`<div class=\"kpi\" style=\"margin-top:8px\"><div class=\"section-title\" style=\"margin-top:0\">Available Frequency</div><div>${chips}</div></div>`);
        }

        if (cards.length) el.insertAdjacentHTML('beforeend', cards.join(''));
      } catch {}

      // Append complete raw JSON sections in separate cards for deep inspection
      try {
        const head = (adv as any)?.head ?? null;
        const bodyAll = (adv as any)?.body ?? null;
        const maSignal = (body as any)?.ma_signal ?? null;
        const oscParams = (params as any)?.oscillator_parameter ?? null;
        const spotData = (params as any)?.spot_data ?? null;
        const addCard = (title: string, obj: any) => {
          if (!obj) return '';
          return `
            <div class=\"kpi\" style=\"margin-top:8px\">
              <div class=\"section-title\" style=\"margin-top:0\">${escapeHtml(title)}</div>
              <pre class=\"mono\" style=\"white-space:pre-wrap; max-height:260px; overflow:auto\">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>
            </div>`;
        };
        const rawSectionsHtml = [
          addCard('Raw: head', head),
          addCard('Raw: body.parameters', params),
          addCard('Raw: body.ma_signal', maSignal),
          addCard('Raw: body.pivot_level', (params as any)?.pivot_level ?? null),
          addCard('Raw: body.oscillator_parameter', oscParams),
          addCard('Raw: body.spot_data', spotData),
          addCard('Raw: body (full)', bodyAll)
        ].join('');
        if (rawSectionsHtml) el.insertAdjacentHTML('beforeend', rawSectionsHtml);
      } catch {}

      return;
    }

    const badge = (ok:boolean) => `<span class="chip" style="background:${withAlpha(ok?THEME.success:THEME.danger,0.15)}; color:${ok?THEME.success:THEME.danger}">${ok?'OK':'FAIL'}</span>`;

    let advHtml = '';
    if (adv) {
      const strengths = Array.isArray(adv.strengths) ? adv.strengths.slice(0,5) : [];
      const weak = Array.isArray(adv.weakness) ? adv.weakness.slice(0,5) : [];
      // Summary counts if present
      const sum = (adv.summary || adv.Summary || {}) as any;
      const sumChips = ['buy','neutral','sell']
        .filter(k=>sum && (sum[k] !== undefined))
        .map(k => {
          const color = k==='buy' ? 'var(--success)' : k==='sell' ? 'var(--danger)' : THEME.brand;
          return `<span class=\"chip\" style=\"background:${withAlpha(color,0.12)}; color:${color}\">${k.toUpperCase()}: ${escapeHtml(String(sum[k]))}</span>`;
        }).join(' ');
      // Generic KPIs
      const kpis: string[] = [];
      if (typeof adv.score === 'number') kpis.push(`Score: ${adv.score}`);
      if (adv.signal) kpis.push(String(adv.signal));
      if (adv.trend) kpis.push(`Trend: ${adv.trend}`);
      // Indicators table (name, value, signal)
      const indicators = Array.isArray(adv.indicators) ? adv.indicators : (Array.isArray(adv.Indicators) ? adv.Indicators : []);
      const indRows = indicators.map((it:any)=>{
        const name = String(it?.name || it?.key || it?.indicator || '');
        const val = it?.value ?? it?.val ?? '';
        const sig = String(it?.signal || it?.indication || '');
        const col = sig==='Bullish' ? 'var(--success)' : sig==='Bearish' ? 'var(--danger)' : THEME.muted;
        const pill = sig ? `<span class=\"chip\" style=\"background:${withAlpha(col,0.15)}; color:${col}\">${escapeHtml(sig)}</span>` : '';
        return `<tr><td class=\"muted\">${escapeHtml(name)}</td><td>${escapeHtml(String(val ?? ''))}</td><td>${pill}</td></tr>`;
      }).join('');
      const indHtml = indRows ? `
        <div class=\"kpi\" style=\"margin-top:8px\">
          <div class=\"section-title\">Indicators</div>
          <table style=\"width:100%; font-size:12px; margin-top:4px\"><thead><tr><th>Indicator</th><th>Value</th><th>Signal</th></tr></thead><tbody>${indRows}</tbody></table>
        </div>` : '';
      // Moving averages (SMA/EMA) if present
      const ma = (adv.movingAverages || adv.moving_avg || adv.ma || {}) as any;
      function renderMaBlock(label:string, arr:any[]) {
        if (!Array.isArray(arr) || !arr.length) return '';
        const rows = arr.map((m:any)=>{
          const name = String(m?.name || m?.key || m?.period || '');
          const val = m?.value ?? m?.val ?? '';
          const sig = String(m?.signal || m?.indication || '');
          const col = sig==='Bullish' ? 'var(--success)' : sig==='Bearish' ? 'var(--danger)' : THEME.muted;
          const pill = sig ? `<span class=\"chip\" style=\"background:${withAlpha(col,0.15)}; color:${col}\">${escapeHtml(sig)}</span>` : '';
          return `<tr><td class=\"muted\">${escapeHtml(name)}</td><td>${escapeHtml(String(val ?? ''))}</td><td>${pill}</td></tr>`;
        }).join('');
        return `<div class=\"kpi\" style=\"margin-top:8px\"><div class=\"section-title\">${escapeHtml(label)}</div>
          <table style=\"width:100%; font-size:12px\"><thead><tr><th>MA</th><th>Value</th><th>Signal</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      const maHtml = [
        renderMaBlock('Simple MA', (ma.sma || ma.SMA || [])),
        renderMaBlock('Exponential MA', (ma.ema || ma.EMA || [])),
      ].join('');
      // Oscillators if present
      const osc = Array.isArray(adv.oscillators) ? adv.oscillators : (Array.isArray(adv.Oscillators) ? adv.Oscillators : []);
      const oscRows = osc.map((o:any)=>{
        const name = String(o?.name || o?.key || '');
        const val = o?.value ?? o?.val ?? '';
        const sig = String(o?.signal || o?.indication || '');
        const col = sig==='Bullish' ? 'var(--success)' : sig==='Bearish' ? 'var(--danger)' : THEME.muted;
        const pill = sig ? `<span class=\"chip\" style=\"background:${withAlpha(col,0.15)}; color:${col}\">${escapeHtml(sig)}</span>` : '';
        return `<tr><td class=\"muted\">${escapeHtml(name)}</td><td>${escapeHtml(String(val ?? ''))}</td><td>${pill}</td></tr>`;
      }).join('');
      const oscHtml = oscRows ? `
        <div class=\"kpi\" style=\"margin-top:8px\">
          <div class=\"section-title\">Oscillators</div>
          <table style=\"width:100%; font-size:12px; margin-top:4px\"><thead><tr><th>Oscillator</th><th>Value</th><th>Signal</th></tr></thead><tbody>${oscRows}</tbody></table>
        </div>` : '';
      // Candlestick patterns
      const candles = Array.isArray(adv.candlestick) ? adv.candlestick : (Array.isArray(adv.candles) ? adv.candles : []);
      const cRows = candles.map((c:any)=>{
        const name = String(c?.name || c?.pattern || '');
        const sig = String(c?.signal || c?.type || '');
        const col = /bull/i.test(sig) ? 'var(--success)' : /bear/i.test(sig) ? 'var(--danger)' : THEME.muted;
        const pill = sig ? `<span class=\"chip\" style=\"background:${withAlpha(col,0.15)}; color:${col}\">${escapeHtml(sig)}</span>` : '';
        return `<tr><td>${escapeHtml(name)}</td><td>${pill}</td></tr>`;
      }).join('');
      const candleHtml = cRows ? `
        <div class=\"kpi\" style=\"margin-top:8px\">
          <div class=\"section-title\">Candlestick Patterns</div>
          <table style=\"width:100%; font-size:12px; margin-top:4px\"><thead><tr><th>Pattern</th><th>Signal</th></tr></thead><tbody>${cRows}</tbody></table>
        </div>` : '';

      const sList = strengths.map((s:any)=>`<li>${escapeHtml(String(s))}</li>`).join('');
      const wList = weak.map((s:any)=>`<li>${escapeHtml(String(s))}</li>`).join('');
      const swHtml = (sList || wList) ? `<div class=\"grid-2\" style=\"gap:12px\">
            <div><div class=\"muted\">Strengths</div><ul style=\"margin:6px 0 0 16px\">${sList || '<li class=\\"muted\\">-</li>'}</ul></div>
            <div><div class=\"muted\">Weakness</div><ul style=\"margin:6px 0 0 16px\">${wList || '<li class=\\"muted\\">-</li>'}</ul></div>
          </div>` : '<div class="muted">No highlights</div>';

      advHtml = `
        <div class="kpi">
          <div class="section-title" style="margin-top:0">Advanced Technicals</div>
          ${(kpis.length || sumChips) ? `<div style=\"display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px\">${sumChips} ${kpis.map(k=>`<span class=\"chip\" style=\"background:${withAlpha(THEME.brand,0.15)}; color:${THEME.brand}\">${escapeHtml(k)}</span>`).join('')}</div>`:''}
          ${swHtml}
        </div>${indHtml}${maHtml}${oscHtml}${candleHtml}`;
    }
    let smaHtml = '';
    const tlApiUrl = tlid ? `https://trendlyne.com/equity/api/stock/adv-technical-analysis/${encodeURIComponent(String(tlid))}/${encodeURIComponent(String(lookback))}/` : '';
    const jsonHtml = `<div class="kpi" style="margin-top:8px">
      <div class="section-title" style="margin-top:0">Raw JSON (Trendlyne API)</div>
      ${tlApiUrl ? `<div class=\"muted\" style=\"font-size:11px; margin-bottom:6px\">TL API: <a href=\"${tlApiUrl}\" target=\"_blank\">${tlApiUrl}</a></div>` : ''}
      <pre class="mono" style="white-space:pre-wrap; max-height:260px; overflow:auto">${escapeHtml(JSON.stringify(adv, null, 2))}</pre>
    </div>`;
    if (sma && sma.data) {
      try {
        const points = (sma.data || []).slice(-20);
        const labels = points.map((p:any)=> new Date((p?.t || p?.time || 0)*1000).toLocaleDateString());
        const values = points.map((p:any)=> Number(p?.v ?? p?.value ?? 0));
        smaHtml = `
          <div class="kpi" style="margin-top:8px">
            <div class="section-title" style="margin-top:0">SMA (recent)</div>
            <canvas id="tlSmaSpark" class="sparkline"></canvas>
          </div>`;
        el.innerHTML = `<div class="muted">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div>` + advHtml + smaHtml + jsonHtml + `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: /api/external/trendlyne/adv-tech?symbol=${escapeHtml(symbol)}&lookback=${escapeHtml(String(lookback))}</div>`;
        // Insert visual summary (decision + charts)
        try {
          if (adv) {
            let sumBuy = 0, sumNeutral = 0, sumSell = 0; let bull = 0, bear = 0, neut = 0; let decision = 'Neutral bias'; let decisionColor = THEME.muted; let buyPct = 0, sellPct = 0;
            const indicators = Array.isArray((adv as any).indicators) ? (adv as any).indicators : (Array.isArray((adv as any).Indicators) ? (adv as any).Indicators : []);
            const ma = ((adv as any).movingAverages || (adv as any).moving_avg || (adv as any).ma || {}) as any;
            const osc = Array.isArray((adv as any).oscillators) ? (adv as any).oscillators : (Array.isArray((adv as any).Oscillators) ? (adv as any).Oscillators : []);
            const candles = Array.isArray((adv as any).candlestick) ? (adv as any).candlestick : (Array.isArray((adv as any).candles) ? (adv as any).candles : []);
            if (normalized) {
              try {
                sumBuy = Number(normalized.summary?.buy ?? 0);
                sumNeutral = Number(normalized.summary?.neutral ?? 0);
                sumSell = Number(normalized.summary?.sell ?? 0);
                bull = Number(normalized.counts?.bullish ?? 0);
                neut = Number(normalized.counts?.neutral ?? 0);
                bear = Number(normalized.counts?.bearish ?? 0);
                buyPct = Number(normalized.percentages?.buyPct ?? 0);
                sellPct = Number(normalized.percentages?.sellPct ?? 0);
                decision = String(normalized.decision || decision);
                decisionColor = decision.includes('Bullish') ? THEME.success : decision.includes('Bearish') ? THEME.danger : THEME.muted;
              } catch {}
            } else {
              const sum = (adv as any).summary || (adv as any).Summary || {};
              sumBuy = Number(sum.buy ?? 0); sumNeutral = Number(sum.neutral ?? 0); sumSell = Number(sum.sell ?? 0);
              const addSig = (s:string)=>{ if(/bull/i.test(s)) bull++; else if(/bear/i.test(s)) bear++; else neut++; };
              try { indicators.forEach((it:any)=> addSig(String(it?.signal || it?.indication || ''))); } catch {}
              try { (ma.sma||ma.SMA||[]).forEach((m:any)=> addSig(String(m?.signal || m?.indication || ''))); } catch {}
              try { (ma.ema||ma.EMA||[]).forEach((m:any)=> addSig(String(m?.signal || m?.indication || ''))); } catch {}
              try { osc.forEach((o:any)=> addSig(String(o?.signal || o?.indication || ''))); } catch {}
              try { candles.forEach((c:any)=> addSig(String(c?.signal || c?.type || ''))); } catch {}
              if (!(sum.buy||sum.neutral||sum.sell)) { sumBuy = bull; sumNeutral = neut; sumSell = bear; }
              const totalVotes = sumBuy + sumNeutral + sumSell;
              buyPct = totalVotes ? (sumBuy/totalVotes)*100 : 0;
              sellPct = totalVotes ? (sumSell/totalVotes)*100 : 0;
              const bias = buyPct - sellPct;
              if (bias > 10) { decision = 'Bullish bias'; decisionColor = THEME.success; }
              else if (bias < -10) { decision = 'Bearish bias'; decisionColor = THEME.danger; }
            }
            const vizHtml = `
              <div class=\"kpi\" style=\"margin-top:8px\"> 
                <div class=\"section-title\" style=\"margin-top:0\">TL Summary</div>
                <div class=\"grid-3\" style=\"gap:8px; align-items:center\">
                  <div><div class=\"muted\">Score</div><div class=\"stat-sm\">${escapeHtml(String((adv as any).score ?? '-'))}</div></div>
                  <div><div class=\"muted\">Signal</div><div class=\"stat-sm\">${escapeHtml(String((adv as any).signal ?? (adv as any).trend ?? '-'))}</div></div>
                  <div><div class=\"muted\">Decision</div><div class=\"stat-sm\" style=\"color:${decisionColor}\">${escapeHtml(decision)}</div></div>
                </div>
                <div class=\"grid-2\" style=\"gap:12px; margin-top:8px\">
                  <div><div class=\"muted\">Buy/Neutral/Sell</div><canvas id=\"tlSummaryPie\"></canvas></div>
                  <div><div class=\"muted\">Signal Distribution</div><canvas id=\"tlSignalBar\"></canvas></div>
                </div>
              </div>`;
            // Executive summary bullets
            try {
              const asArray = (x:any) => Array.isArray(x) ? x : [];
              const bullList: string[] = [];
              const bearList: string[] = [];
              asArray(indicators).forEach((it:any)=>{ const n=String(it?.name||it?.key||it?.indicator||''); const s=String(it?.signal||it?.indication||''); if(/bull/i.test(s)) bullList.push(n); else if(/bear/i.test(s)) bearList.push(n); });
              asArray(ma?.sma||ma?.SMA).forEach((m:any)=>{ const n=String(m?.name||m?.key||m?.period||'SMA'); const s=String(m?.signal||m?.indication||''); if(/bull/i.test(s)) bullList.push(`SMA ${n}`); else if(/bear/i.test(s)) bearList.push(`SMA ${n}`); });
              asArray(ma?.ema||ma?.EMA).forEach((m:any)=>{ const n=String(m?.name||m?.key||m?.period||'EMA'); const s=String(m?.signal||m?.indication||''); if(/bull/i.test(s)) bullList.push(`EMA ${n}`); else if(/bear/i.test(s)) bearList.push(`EMA ${n}`); });
              asArray(osc).forEach((o:any)=>{ const n=String(o?.name||o?.key||''); const s=String(o?.signal||o?.indication||''); if(/bull/i.test(s)) bullList.push(n); else if(/bear/i.test(s)) bearList.push(n); });
              const tb = bullList.filter(Boolean).slice(0,3).map(n=>`<span class=\"chip\" style=\"background:${withAlpha(THEME.success,0.12)}; color:${THEME.success}\">${escapeHtml(n)}</span>`).join(' ');
              const tr = bearList.filter(Boolean).slice(0,3).map(n=>`<span class=\"chip\" style=\"background:${withAlpha(THEME.danger,0.12)}; color:${THEME.danger}\">${escapeHtml(n)}</span>`).join(' ');
              const execHtml = `
                <div class=\"kpi\" style=\"margin-top:8px\">
                  <div class=\"section-title\" style=\"margin-top:0\">Executive Summary</div>
                  <ul style=\"margin:6px 0 0 18px\">
                    <li><b>${escapeHtml(decision)}</b> � Buy ${buyPct.toFixed(0)}%, Neutral ${ (100 - buyPct - sellPct).toFixed(0)}%, Sell ${sellPct.toFixed(0)}%.</li>
                    <li>Score: ${escapeHtml(String((adv as any).score ?? '-'))}; Signal: ${escapeHtml(String((adv as any).signal ?? (adv as any).trend ?? '-'))}.</li>
                    <li>Top bullish: ${tb || '<span class=\"muted\">n/a</span>'}</li>
                    <li>Top bearish: ${tr || '<span class=\"muted\">n/a</span>'}</li>
                  </ul>
                </div>`;
              el.insertAdjacentHTML('afterbegin', execHtml + vizHtml);
              // Decision aids
              try {
                const scoreNum = Number((adv as any).score ?? NaN);
                const actions: string[] = [];
                if (decision.includes('Bullish')) {
                  actions.push('Consider buy-on-dips; confirm with MA crossover & RSI.');
                  actions.push('Set stop-loss below recent swing low (risk-managed).');
                  actions.push('Monitor oscillators for overbought signals (trim if extreme).');
                } else if (decision.includes('Bearish')) {
                  actions.push('Avoid fresh longs; consider hedge or reduce exposure.');
                  actions.push('Watch for reversal patterns; wait for confirmation.');
                  actions.push('Use rallies to lighten positions; protect profits.');
                } else {
                  actions.push('Wait for confirmation (MA alignment or trend break).');
                  actions.push('Track key indicators (RSI/MACD) for fresh signal.');
                  actions.push('Set alerts at support/resistance to act swiftly.');
                }
                const actHtml = `<div class=\"kpi\" style=\"margin-top:8px\"><div class=\"section-title\">Decision Aids</div><ul style=\"margin:6px 0 0 18px\"><li>${actions.join('</li><li>')}</li></ul></div>`;
                el.insertAdjacentHTML('beforeend', actHtml);
              } catch {}
            } catch { el.insertAdjacentHTML('afterbegin', vizHtml); }
            const pieCtx = (document.getElementById('tlSummaryPie') as HTMLCanvasElement)?.getContext('2d');
            if (pieCtx) {
          upsertChart('tlSummaryPie', pieCtx, { type:'doughnut', data:{ labels:['Buy','Neutral','Sell'], datasets:[{ data:[sumBuy,sumNeutral,sumSell], backgroundColor:[THEME.success, THEME.muted, THEME.danger], borderWidth:0 }]}, options:{ plugins:{ legend:{ display:true, position:'bottom' }, tooltip:{ enabled:true }, valueLabels:{ enabled:true, piePercent:true, precision:0, color:'#374151' } }, cutout:'55%' } });
            }
            const barCtx = (document.getElementById('tlSignalBar') as HTMLCanvasElement)?.getContext('2d');
            if (barCtx) {
              upsertChart('tlSignalBar', barCtx, { type:'bar', data:{ labels:['Bullish','Neutral','Bearish'], datasets:[{ data:[bull,neut,bear], backgroundColor:[withAlpha(THEME.success,0.8), withAlpha(THEME.muted,0.8), withAlpha(THEME.danger,0.8)] }]}, options:{ plugins:{ legend:{ display:false }, valueLabels:{ enabled:true, precision:0, color:'#374151' } }, scales:{ x:{ display:true }, y:{ display:true, beginAtZero:true, ticks:{ precision:0 } } } } });
            }
          }
        } catch {}

        const ctx = (document.getElementById('tlSmaSpark') as HTMLCanvasElement)?.getContext('2d');
        if (ctx && labels.length && values.length) {
          upsertChart('tlSmaSpark', ctx, {
            type: 'line', data: { labels, datasets: [{ data: values, borderColor: THEME.brand, backgroundColor: withAlpha(THEME.brand,0.12), borderWidth: 1.5, tension: 0.25, pointRadius: 0, fill: true }] },
            options: { plugins: { legend: { display:false }, tooltip: { enabled:false }, valueLabels: { enabled: true, lastValue: true, precision: 2, color: THEME.brand } }, scales: { x: { display:false }, y: { display:false } } }
          });
        }
        return;
      } catch {}
    }
    // Fallback render
    if (!advHtml) {
      // Include cookie status hint if nothing visible
      try {
        const st = await new Api().tlCookieStatus();
        const info = st?.data ? ` - cookie: ${escapeHtml(JSON.stringify(st.data))}` : '';
        el.innerHTML = `<div class="muted">TLID: ${escapeHtml(String(tlid || 'N/A'))}${info}</div><div class="muted" style="margin-top:6px">No data</div>` + jsonHtml + `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: /api/external/trendlyne/adv-tech?symbol=${escapeHtml(symbol)}&lookback=${escapeHtml(String(lookback))}</div>`;
      } catch {
        el.innerHTML = `<div class="muted">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div><div class="muted" style="margin-top:6px">No data</div>` + jsonHtml + `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: /api/external/trendlyne/adv-tech?symbol=${escapeHtml(symbol)}&lookback=${escapeHtml(String(lookback))}</div>`;
      }
    } else {
      el.innerHTML = `<div class="muted">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div>` + advHtml + jsonHtml + `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: /api/external/trendlyne/adv-tech?symbol=${escapeHtml(symbol)}&lookback=${escapeHtml(String(lookback))}</div>`;
      // Insert visual summary (decision + charts) when adv present
      try {
        if (adv) {
          const sum = (adv as any).summary || (adv as any).Summary || {};
          let sumBuy = Number(sum.buy ?? 0), sumNeutral = Number(sum.neutral ?? 0), sumSell = Number(sum.sell ?? 0);
          const indicators = Array.isArray((adv as any).indicators) ? (adv as any).indicators : (Array.isArray((adv as any).Indicators) ? (adv as any).Indicators : []);
          const ma = ((adv as any).movingAverages || (adv as any).moving_avg || (adv as any).ma || {}) as any;
          const osc = Array.isArray((adv as any).oscillators) ? (adv as any).oscillators : (Array.isArray((adv as any).Oscillators) ? (adv as any).Oscillators : []);
          const candles = Array.isArray((adv as any).candlestick) ? (adv as any).candlestick : (Array.isArray((adv as any).candles) ? (adv as any).candles : []);
          let bull = 0, bear = 0, neut = 0; const addSig = (s:string)=>{ if(/bull/i.test(s)) bull++; else if(/bear/i.test(s)) bear++; else neut++; };
          try { indicators.forEach((it:any)=> addSig(String(it?.signal || it?.indication || ''))); } catch {}
          try { (ma.sma||ma.SMA||[]).forEach((m:any)=> addSig(String(m?.signal || m?.indication || ''))); } catch {}
          try { (ma.ema||ma.EMA||[]).forEach((m:any)=> addSig(String(m?.signal || m?.indication || ''))); } catch {}
          try { osc.forEach((o:any)=> addSig(String(o?.signal || o?.indication || ''))); } catch {}
          try { candles.forEach((c:any)=> addSig(String(c?.signal || c?.type || ''))); } catch {}
          if (!(sum.buy||sum.neutral||sum.sell)) { sumBuy = bull; sumNeutral = neut; sumSell = bear; }
          const totalVotes = sumBuy + sumNeutral + sumSell;
          const buyPct = totalVotes ? (sumBuy/totalVotes)*100 : 0;
          const sellPct = totalVotes ? (sumSell/totalVotes)*100 : 0;
          const bias = buyPct - sellPct;
          let decision = 'Neutral bias'; let decisionColor = THEME.muted;
          if (bias > 10) { decision = 'Bullish bias'; decisionColor = THEME.success; }
          else if (bias < -10) { decision = 'Bearish bias'; decisionColor = THEME.danger; }
          const vizHtml = `
            <div class=\"kpi\" style=\"margin-top:8px\"> 
              <div class=\"section-title\" style=\"margin-top:0\">TL Summary</div>
              <div class=\"grid-3\" style=\"gap:8px; align-items:center\">
                <div><div class=\"muted\">Score</div><div class=\"stat-sm\">${escapeHtml(String((adv as any).score ?? '-'))}</div></div>
                <div><div class=\"muted\">Signal</div><div class=\"stat-sm\">${escapeHtml(String((adv as any).signal ?? (adv as any).trend ?? '-'))}</div></div>
                <div><div class=\"muted\">Decision</div><div class=\"stat-sm\" style=\"color:${decisionColor}\">${escapeHtml(decision)}</div></div>
              </div>
              <div class=\"grid-2\" style=\"gap:12px; margin-top:8px\">
                <div><div class=\"muted\">Buy/Neutral/Sell</div><canvas id=\"tlSummaryPie\"></canvas></div>
                <div><div class=\"muted\">Signal Distribution</div><canvas id=\"tlSignalBar\"></canvas></div>
              </div>
            </div>`;
          // Executive summary bullets
          try {
            const asArray = (x:any) => Array.isArray(x) ? x : [];
            const bullList: string[] = [];
            const bearList: string[] = [];
            asArray(indicators).forEach((it:any)=>{ const n=String(it?.name||it?.key||it?.indicator||''); const s=String(it?.signal||it?.indication||''); if(/bull/i.test(s)) bullList.push(n); else if(/bear/i.test(s)) bearList.push(n); });
            asArray(ma?.sma||ma?.SMA).forEach((m:any)=>{ const n=String(m?.name||m?.key||m?.period||'SMA'); const s=String(m?.signal||m?.indication||''); if(/bull/i.test(s)) bullList.push(`SMA ${n}`); else if(/bear/i.test(s)) bearList.push(`SMA ${n}`); });
            asArray(ma?.ema||ma?.EMA).forEach((m:any)=>{ const n=String(m?.name||m?.key||m?.period||'EMA'); const s=String(m?.signal||m?.indication||''); if(/bull/i.test(s)) bullList.push(`EMA ${n}`); else if(/bear/i.test(s)) bearList.push(`EMA ${n}`); });
            asArray(osc).forEach((o:any)=>{ const n=String(o?.name||o?.key||''); const s=String(o?.signal||o?.indication||''); if(/bull/i.test(s)) bullList.push(n); else if(/bear/i.test(s)) bearList.push(n); });
            const tb = bullList.filter(Boolean).slice(0,3).map(n=>`<span class=\"chip\" style=\"background:${withAlpha(THEME.success,0.12)}; color:${THEME.success}\">${escapeHtml(n)}</span>`).join(' ');
            const tr = bearList.filter(Boolean).slice(0,3).map(n=>`<span class=\"chip\" style=\"background:${withAlpha(THEME.danger,0.12)}; color:${THEME.danger}\">${escapeHtml(n)}</span>`).join(' ');
            const execHtml = `
              <div class=\"kpi\" style=\"margin-top:8px\">
                <div class=\"section-title\" style=\"margin-top:0\">Executive Summary</div>
                <ul style=\"margin:6px 0 0 18px\">
                  <li><b>${escapeHtml(decision)}</b> � Buy ${buyPct.toFixed(0)}%, Neutral ${ (100 - buyPct - sellPct).toFixed(0)}%, Sell ${sellPct.toFixed(0)}%.</li>
                  <li>Score: ${escapeHtml(String((adv as any).score ?? '-'))}; Signal: ${escapeHtml(String((adv as any).signal ?? (adv as any).trend ?? '-'))}.</li>
                  <li>Top bullish: ${tb || '<span class=\"muted\">n/a</span>'}</li>
                  <li>Top bearish: ${tr || '<span class=\"muted\">n/a</span>'}</li>
                </ul>
              </div>`;
            el.insertAdjacentHTML('afterbegin', execHtml + vizHtml);
            // Decision aids
            try {
              const actions: string[] = [];
              if (decision.includes('Bullish')) {
                actions.push('Consider buy-on-dips; confirm with MA crossover & RSI.');
                actions.push('Set stop-loss below recent swing low (risk-managed).');
                actions.push('Monitor oscillators for overbought signals (trim if extreme).');
              } else if (decision.includes('Bearish')) {
                actions.push('Avoid fresh longs; consider hedge or reduce exposure.');
                actions.push('Watch for reversal patterns; wait for confirmation.');
                actions.push('Use rallies to lighten positions; protect profits.');
              } else {
                actions.push('Wait for confirmation (MA alignment or trend break).');
                actions.push('Track key indicators (RSI/MACD) for fresh signal.');
                actions.push('Set alerts at support/resistance to act swiftly.');
              }
              const actHtml = `<div class=\"kpi\" style=\"margin-top:8px\"><div class=\"section-title\">Decision Aids</div><ul style=\"margin:6px 0 0 18px\"><li>${actions.join('</li><li>')}</li></ul></div>`;
              el.insertAdjacentHTML('beforeend', actHtml);
            } catch {}
          } catch { el.insertAdjacentHTML('afterbegin', vizHtml); }
          const pieCtx = (document.getElementById('tlSummaryPie') as HTMLCanvasElement)?.getContext('2d');
          if (pieCtx) {
            upsertChart('tlSummaryPie', pieCtx, { type:'doughnut', data:{ labels:['Buy','Neutral','Sell'], datasets:[{ data:[sumBuy,sumNeutral,sumSell], backgroundColor:[THEME.success, THEME.muted, THEME.danger], borderWidth:0 }]}, options:{ plugins:{ legend:{ display:true, position:'bottom' }, tooltip:{ enabled:true }, valueLabels:{ enabled:true, piePercent:true, precision:0, color:'#374151' } }, cutout:'55%' } });
          }
          const barCtx = (document.getElementById('tlSignalBar') as HTMLCanvasElement)?.getContext('2d');
          if (barCtx) {
            upsertChart('tlSignalBar', barCtx, { type:'bar', data:{ labels:['Bullish','Neutral','Bearish'], datasets:[{ data:[bull,neut,bear], backgroundColor:[withAlpha(THEME.success,0.8), withAlpha(THEME.muted,0.8), withAlpha(THEME.danger,0.8)] }]}, options:{ plugins:{ legend:{ display:false } }, scales:{ x:{ display:true }, y:{ display:true, beginAtZero:true, ticks:{ precision:0 } } } } });
          }
        }
      } catch {}
    }
  } catch (e:any) {
    el.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

async function renderTrendlyneSma(symbol: string, opts?: { force?: boolean }) {
  const box = document.getElementById('tlSmaBody');
  if (!box) return;
  box.innerHTML = '<div class="muted">Loading SMA�</div>';
  try {
    // Prefer TLID if available
    const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    let tlidPref: string | undefined;
    try {
      const r = await new Api().resolveTicker(base);
      tlidPref = r?.data?.entry?.tlid || undefined;
    } catch {}
    let res = tlidPref ? await new Api().tlSmaByTlid(tlidPref, { force: !!opts?.force }) : await new Api().tlSmaBySymbol(symbol, { force: !!opts?.force });
    let data = res?.data || {};
    if (!data?.sma) {
      // Attempt cookie refresh and retry implicitly through adv-tech
    }
    const tlid = data.tlid || '';
    const sma = data.sma || null;
    // Build stock metadata table if available from Trendlyne response body
    let metaHtml = '';
    try {
      const headers = Array.isArray(sma?.body?.stockHeaders) ? sma.body.stockHeaders : [];
      const dataRow = Array.isArray(sma?.body?.stockData) ? sma.body.stockData : [];
      if (headers.length && dataRow.length) {
        const rows = headers.map((h:any, i:number) => {
          const name = String(h?.name ?? h?.unique_name ?? `Field ${i+1}`);
          const val = dataRow[i];
          return `<tr><td class=\"muted\">${escapeHtml(name)}</td><td>${escapeHtml(String(val ?? ''))}</td></tr>`;
        }).join('');
        metaHtml = `
          <div class=\"kpi\" style=\"margin-top:8px\">
            <div class=\"section-title\" style=\"margin-top:0\">Stock Details</div>
            <table style=\"width:100%; font-size:12px; margin-top:4px\"><tbody>${rows}</tbody></table>
          </div>`;
      }
    } catch {}
    if (sma && sma.data) {
      const points = (sma.data || []).slice(-150);
      const labels = points.map((p:any)=> new Date((p?.t || p?.time || 0)*1000).toLocaleDateString());
      const values = points.map((p:any)=> Number(p?.v ?? p?.value ?? 0));
      // Quick trend cue based on last vs 20 bars back
      let trendHtml = '';
      if (values.length > 20) {
        const last = values[values.length - 1];
        const prev = values[values.length - 21];
        const chg = ((last - prev) / (prev || 1)) * 100;
        const lbl = chg > 1 ? 'Bullish' : chg < -1 ? 'Bearish' : 'Sideways';
        const col = lbl === 'Bullish' ? 'var(--success)' : lbl === 'Bearish' ? 'var(--danger)' : 'var(--muted)';
        trendHtml = `<div class=\"muted\" style=\"margin-top:6px\">SMA Trend: <span class=\"chip\" style=\"background:${withAlpha(col,0.15)}; color:${col}\">${lbl} ${chg.toFixed(2)}%</span></div>`;
        // Update Quality Scores from SMA dynamics (per-stock)
        try {
          const clamp = (n:number,min:number,max:number)=> Math.min(max, Math.max(min, n));
          // Momentum: scale 20-bar % change to 0..100 (±20% => 0..100)
          const mClamped = clamp(chg, -20, 20);
          const mVal = Math.round(50 + (mClamped/20)*50);
          const mColor: 'positive'|'negative'|'neutral' = chg > 0.5 ? 'positive' : chg < -0.5 ? 'negative' : 'neutral';
          // Durability: inverse of recent volatility (avg abs 1-bar % change over last 20)
          let avgAbs = 0; let cnt = 0;
          for (let i = values.length - 19; i < values.length; i++) {
            const a = values[i-1]; const b = values[i];
            if (a && b) { avgAbs += Math.abs(((b - a) / a) * 100); cnt++; }
          }
          avgAbs = cnt ? (avgAbs / cnt) : 0;
          const dClamped = clamp(avgAbs, 0, 5);
          const dVal = Math.round(100 - (dClamped/5)*100);
          const dColor: 'positive'|'negative'|'neutral' = dVal >= 60 ? 'positive' : dVal <= 40 ? 'negative' : 'neutral';
          // Valuation: relative to median of last 100 SMA values (below median => higher score)
          const tail = values.slice(-100);
          const sorted = tail.slice().sort((a,b)=> a-b);
          const mid = sorted.length ? sorted[Math.floor(sorted.length/2)] : prev;
          const dev = ((last - (mid||last)) / (mid || 1)) * 100;
          const vClamped = clamp(-dev, -20, 20);
          const vVal = Math.round(50 + (vClamped/20)*50);
          const vColor: 'positive'|'negative'|'neutral' = vVal >= 60 ? 'positive' : vVal <= 40 ? 'negative' : 'neutral';
          try { localStorage.setItem('score:M', JSON.stringify({ val: mVal, color: mColor })); } catch {}
          try { localStorage.setItem('score:D', JSON.stringify({ val: dVal, color: dColor })); } catch {}
          try { localStorage.setItem('score:V', JSON.stringify({ val: vVal, color: vColor })); } catch {}
          try { renderQualityScores(); } catch {}
        } catch {}
      }
      box.innerHTML = `<div class=\"muted\">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div><canvas id=\"tlSmaFull\" style=\"max-height:220px\"></canvas>${trendHtml}${metaHtml}<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: https://trendlyne.com/mapp/v1/stock/chart-data/${escapeHtml(String(tlid))}/SMA/</div>`;
      const ctx = (document.getElementById('tlSmaFull') as HTMLCanvasElement)?.getContext('2d');
      if (ctx && labels.length && values.length) {
        upsertChart('tlSmaFull', ctx, {
          type: 'line',
          data: { labels, datasets: [{ label: 'SMA', data: values, borderColor: THEME.brand, backgroundColor: withAlpha(THEME.brand,0.12), borderWidth: 2, tension: 0.2, pointRadius: 0, fill: true }] },
          options: { plugins: { legend: { display: false }, valueLabels: { enabled: true, lastValue: true, precision: 2, color: THEME.brand } }, scales: { x: { display: true }, y: { display: true } } }
        });
      } else {
        box.innerHTML = `<div class=\"muted\">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div>${metaHtml}<div class=\"muted\" style=\"margin-top:6px\">No SMA data available.</div>`;
      }
    } else {
      try {
        const st = await new Api().tlCookieStatus();
        const info = st?.data ? ` - cookie: ${escapeHtml(JSON.stringify(st.data))}` : '';
        box.innerHTML = `<div class=\"muted\">TLID: ${escapeHtml(String(tlid || 'N/A'))}${info}</div>${metaHtml}<div class=\"muted\" style=\"margin-top:6px\">No SMA data available. Try \\\"Force Refresh (Trendlyne)\\\" above.</div><div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: https://trendlyne.com/mapp/v1/stock/chart-data/${escapeHtml(String(tlid))}/SMA/</div>`;
      } catch {
        box.innerHTML = `<div class=\"muted\">TLID: ${escapeHtml(String(tlid || 'N/A'))}</div>${metaHtml}<div class=\"muted\" style=\"margin-top:6px\">No SMA data available. Try \\\"Force Refresh (Trendlyne)\\\" above.</div><div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: https://trendlyne.com/mapp/v1/stock/chart-data/${escapeHtml(String(tlid))}/SMA/</div>`;
      }
    }
  } catch (e:any) {
    box.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

async function renderMarketOverview() {
  const box = document.getElementById('marketOverview');
  if (!box) return;
  // Ensure a body container exists
  box.innerHTML = '<div class="muted">Market Overview</div><div id="moBody" class="mono" style="margin-top:6px"></div>';
  const body = document.getElementById('moBody');
  if (!body) return;
  body.textContent = 'Loading...';
  try {
    const [mmi, indices] = await Promise.all([
      new Api().tickertapeMmi().catch(()=>null),
      new Api().etIndices().catch(()=>null)
    ]);
    let chips = '';
    try {
      const d: any = mmi?.data ?? null;
      if (d !== null && d !== undefined) {
        const m = (d.mmi ?? d.value ?? d.index ?? d) as any;
        const zone = (d.zone ?? d.label ?? '') as any;
        const val = typeof m === 'number' ? Math.round(m) : String(m);
        chips += `<span class="chip" style="background:${withAlpha('#0ea5e9',0.15)}; color:#0ea5e9">MMI: ${escapeHtml(String(val))}${zone?` (${escapeHtml(String(zone))})`:''}</span> `;
      }
    } catch {}
    try {
      const arr: any[] = Array.isArray(indices?.data) ? (indices!.data as any[]).slice(0, 6) : [];
      chips += arr.map((it: any) => {
        const name = it.name || it.index || it.symbol || 'Index';
        const last = Number(it.last ?? it.price ?? it.close ?? NaN);
        const chRaw = it.changePercent ?? it.chgPct ?? it.percent ?? it.change_percent ?? it.pct ?? '';
        const chNum = Number(chRaw);
        const col = Number.isFinite(chNum) ? (chNum >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)';
        const sign = Number.isFinite(chNum) && chNum >= 0 ? '+' : '';
        const chDisp = Number.isFinite(chNum) ? `${sign}${chNum.toFixed(2)}%` : (typeof chRaw === 'string' ? chRaw : '');
        const lastDisp = Number.isFinite(last) ? ` ${last.toFixed(2)}` : '';
        return `<span class=\"chip\" style=\"background:var(--panel-2); border:1px solid var(--border); color:${col}\">${escapeHtml(String(name))}:${lastDisp} ${escapeHtml(String(chDisp))}</span>`;
      }).join(' ');
    } catch {}
    if (!chips) {
      body.innerHTML = '<div class="muted">No market data available.</div>';
    } else {
      body.innerHTML = `<div style="display:flex; gap:6px; flex-wrap:wrap">${chips}</div>`;
    }
  } catch (e: any) {
    body.innerHTML = `<div class=\"mono\" style=\"color:#ff6b6b\">${escapeHtml(e?.message || e)}</div>`;
  }
}

async function renderMarketsMojo() {
  const box = document.getElementById('mmBody');
  if (!box) return;
  box.innerHTML = '<div class="muted">Loading valuation�</div>';
  try {
    const res = await new Api().marketsMojoValuation();
    const data = res?.data;
    if (!data) { box.innerHTML = '<div class="muted">No valuation data.</div>'; return; }
    // Compact KPIs: try to pick a few informative fields dynamically
    const entries = Object.entries(data as any).filter(([k,v])=> typeof v === 'string' || typeof v === 'number').slice(0,6);
    const chips = entries.map(([k,v])=> `<span class="chip" style="background:${withAlpha(THEME.brand,0.15)}; color:${THEME.brand}">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join(' ');
    // Fallback summary snippet
    const snippet = escapeHtml(JSON.stringify(data).slice(0, 360));
    box.innerHTML = `
      <div class="kpi">
        <div class="section-title" style="margin-top:0">Valuation Snapshot</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap">${chips || '<span class="muted">No quick fields</span>'}</div>
        <div class="section-title" style="margin-top:8px">Details</div>
        <div class="mono" style="white-space:pre-wrap">${snippet}${JSON.stringify(data).length>360?'�':''}</div>
      </div>`;
    box.insertAdjacentHTML('beforeend', `<div class=\"muted\" style=\"font-size:11px; margin-top:6px\">Source: /api/external/marketsmojo/valuation</div>`);
  } catch (e:any) {
    box.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message||e)}</div>`;
  }
}

async function renderProviderResolution(symbol: string) {
  const box = document.getElementById('resolveBody');
  if (!box) return;
  box.innerHTML = '<div class="muted">Resolving�</div>';
  try {
    const res = await new Api().resolveTicker(symbol);
    const d = res?.data || {};
    const entry = d.entry || {};
    box.innerHTML = `
      <div class="grid-2" style="gap:8px; font-size:12px">
        <div><div class="muted">Yahoo</div><div>${escapeHtml(String(d.yahoo||''))}</div></div>
        <div><div class="muted">MC</div><div>${escapeHtml(String(d.mc||''))}</div></div>
        <div><div class="muted">News</div><div>${escapeHtml(String(d.news||''))}</div></div>
        <div><div class="muted">Alpha</div><div>${escapeHtml(String(d.alpha||''))}</div></div>
      </div>
      <div class="section-title" style="margin-top:8px">Entry</div>
      <div class="mono" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(entry))}</div>
      <div class="muted" style="font-size:11px; margin-top:6px">Source: /api/resolve/${escapeHtml(symbol)}</div>`;
  } catch (e:any) {
    box.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message||e)}</div>`;
  }
}

async function renderYahooData(symbol: string) {
  const body = document.getElementById('yahooDataBody');
  if (!body) return;
  body.innerHTML = `<div class="muted">Loading Yahoo Data...</div>`;
  try {
    const rangeSel = document.getElementById('ydRange') as HTMLSelectElement | null;
    const intervalSel = document.getElementById('ydInterval') as HTMLSelectElement | null;
    const modules = [
      ...(document.getElementById('ydm_price') as HTMLInputElement)?.checked ? ['price'] : [],
      ...(document.getElementById('ydm_summaryDetail') as HTMLInputElement)?.checked ? ['summaryDetail'] : [],
      ...(document.getElementById('ydm_assetProfile') as HTMLInputElement)?.checked ? ['assetProfile'] : [],
      ...(document.getElementById('ydm_financialData') as HTMLInputElement)?.checked ? ['financialData'] : [],
      ...(document.getElementById('ydm_defaultKeyStatistics') as HTMLInputElement)?.checked ? ['defaultKeyStatistics'] : [],
      ...(document.getElementById('ydm_earnings') as HTMLInputElement)?.checked ? ['earnings'] : [],
      ...(document.getElementById('ydm_calendarEvents') as HTMLInputElement)?.checked ? ['calendarEvents'] : [],
      ...(document.getElementById('ydm_recommendationTrend') as HTMLInputElement)?.checked ? ['recommendationTrend'] : [],
      ...(document.getElementById('ydm_secFilings') as HTMLInputElement)?.checked ? ['secFilings'] : [],
      ...(document.getElementById('ydm_incomeStatementHistory') as HTMLInputElement)?.checked ? ['incomeStatementHistory'] : [],
    ];
    const range = rangeSel?.value || '1y';
    const interval = intervalSel?.value || '1d';
    const mods = modules.length ? modules.join(',') : 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics';
    const yf = await api.yahooFull(symbol, range, interval, mods);
    if (yf && yf.data) {
      // Extract KPIs, profile, and financials
      const info = yf.data?.info || yf.data?.profile || {};
      const qt = yf.data?.quote_table || yf.data?.quote || {};
      const sector = info.sector || info.Sector || '';
      const industry = info.industry || info.Industry || '';
      const website = info.website || info.Website || '';
      const summary = info.longBusinessSummary || info.long_business_summary || '';
      const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || qt.marketCap || '';
      const pe = qt['PE Ratio (TTM)'] || qt.peRatio || '';
      const eps = qt['EPS (TTM)'] || qt.eps || '';
      // Financials
      const financials = yf.data?.financials || yf.data?.financialData || {};
      // Render card
      body.innerHTML = `
        <div class="muted">Yahoo Fin KPIs & Profile</div>
        <div class="grid-2" style="gap:16px; margin-top:8px">
          <div>
            <div><strong>Sector:</strong> ${escapeHtml(sector)}</div>
            <div><strong>Industry:</strong> ${escapeHtml(industry)}</div>
            <div><strong>Market Cap:</strong> ${escapeHtml(String(mcap))}</div>
            <div><strong>PE Ratio:</strong> ${escapeHtml(String(pe))}</div>
            <div><strong>EPS:</strong> ${escapeHtml(String(eps))}</div>
            <div><strong>Website:</strong> <a href="${escapeHtml(website)}" target="_blank">${escapeHtml(website)}</a></div>
          </div>
          <div>
            <div class="muted" style="margin-bottom:4px">Business Summary</div>
            <div style="font-size:13px;">${escapeHtml(summary)}</div>
          </div>
        </div>
        <div class="muted" style="margin-top:12px">Financials</div>
        <pre class="mono" style="white-space:pre-wrap; margin:0; font-size:12px; background:var(--panel-2); padding:8px; border-radius:8px;">${escapeHtml(JSON.stringify(financials, null, 2))}</pre>
      `;
    } else {
      body.innerHTML = `<div class="muted">No Yahoo data available.</div>`;
    }
  } catch (e: any) {
    body.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Auto-refresh Yahoo Data card on controls change
(()=>{
  const hook = () => {
    const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
    const symbol = sel?.value || '';
    if (symbol) renderYahooData(symbol);
  };
  const rSel = document.getElementById('ydRange') as HTMLSelectElement | null;
  const iSel = document.getElementById('ydInterval') as HTMLSelectElement | null;
  if (rSel) rSel.addEventListener('change', hook);
  if (iSel) iSel.addEventListener('change', hook);
  const boxes = Array.from(document.querySelectorAll('input[id^="ydm_"]')) as HTMLInputElement[];
  boxes.forEach(b => b.addEventListener('change', () => { try {
    const range = (document.getElementById('ydRange') as HTMLSelectElement | null)?.value || '1y';
    const interval = (document.getElementById('ydInterval') as HTMLSelectElement | null)?.value || '1d';
    const mods = Array.from(document.querySelectorAll('input[id^="ydm_"]')) as HTMLInputElement[];
    const modules = mods.filter(m=>m.checked).map(m=>m.id.replace('ydm_','')).join(',');
    localStorage.setItem('yahoo:range', range); localStorage.setItem('yahoo:interval', interval); localStorage.setItem('yahoo:modules', modules);
  } catch {} hook(); }));
  // On initial load, if a symbol is already selected, render immediately
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const symbol = sel?.value || '';
  if (symbol) renderYahooData(symbol);
})();




















// Connectivity checks
(() => {
  const btn = document.getElementById('connRun');
  const body = document.getElementById('connBody');
  if (!btn || !body) return;
  btn.addEventListener('click', async () => {
    body.textContent = 'Running connectivity checks...';
    // Resolve a symbol to use for provider checks
    const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
    const sym = (sel?.value || (localStorage.getItem('selectedSymbol') || 'DABUR')).toUpperCase();
    const today = new Date();
    const dateKey = new Date(today.getTime() - (today.getTimezoneOffset()*60*1000)).toISOString().slice(0,10);
    const checks: Array<{name:string, fn:()=>Promise<any>}> = [
      { name: 'Backend /health', fn: () => new Api().health() },
      { name: 'RAG /health/rag', fn: () => new Api().ragHealth() },
      { name: 'ET Indices', fn: () => new Api().etIndices() },
      { name: 'Tickertape MMI', fn: () => new Api().tickertapeMmi() },
      { name: 'MarketsMojo Valuation', fn: () => new Api().marketsMojoValuation() },
      { name: `Trendlyne Derivatives (${dateKey})`, fn: () => new Api().tlDerivatives(dateKey) },
    ];
    const results: Array<{name:string, ok:boolean, ms:number, note?:string}> = [];
    for (const c of checks) {
      const t0 = Date.now();
      try {
        const out = await c.fn();
        const ms = Date.now() - t0;
        const ok = !!out && (out.ok !== false);
        let note = '';
        if (c.name.startsWith('RAG') && out?.data) note = JSON.stringify(out.data);
        if (c.name === 'Trendlyne Cookie') note = JSON.stringify(out?.data);
        results.push({ name: c.name, ok, ms, note });
      } catch (e:any) {
        const ms = Date.now() - t0;
        results.push({ name: c.name, ok:false, ms, note: String(e?.message || e) });
      }
    }
    const rows = results.map(r => {
      const color = r.ok ? 'var(--success)' : 'var(--danger)';
      const sym = r.ok ? 'OK' : 'FAIL';
      const note = r.note ? ` � ${escapeHtml(r.note).slice(0,120)}` : '';
      return `<div><span style="color:${color}; font-weight:600">${sym}</span> ${escapeHtml(r.name)} <span class="muted">(${r.ms} ms)</span>${note}</div>`;
    }).join('');
  body.innerHTML = rows || '<div class="muted">No checks run</div>';
  });
})();

// Smart Stock Suggestions: sector-performance based quick picks
async function renderSuggestions() {
  const el = document.getElementById('suggestionsBody');
  if (!el) return;
  el.innerHTML = '<div class="muted">Loading suggestions�</div>';
  try {
    // Pull a small batch of stocks and score them using Overview + Trendlyne
    const listRes = await new Api().listStocks();
    const stocks: Array<{ name:string; symbol:string; yahoo:string }> = (listRes?.data || []).slice(0,25);
    async function getTlNormalized(symbol: string) {
      const key = `tlnorm:${symbol}`;
      const ttl = 2 * 60 * 60 * 1000; // 2 hours
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const j = JSON.parse(raw);
          if (j && (Date.now() - Number(j.ts)) < ttl) return j.val;
        }
      } catch {}
      try {
        const tl = await new Api().tlAdvTechBySymbol(symbol);
        const val = tl?.data?.normalized || null;
        try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), val })); } catch {}
        return val;
      } catch { return null; }
    }

    async function scoreOne(s: {name:string; symbol:string; yahoo:string}) {
      const sym = s.yahoo;
      let change = 0; let tlScore = 0; let tlBias = 0; let sentiment = 0;
      try { const ov = await getOverviewCached(sym); change = Number(ov?.data?.periodChangePct ?? 0); } catch {}
      const n = await getTlNormalized(sym);
      try { tlScore = Number(n?.score ?? 0); tlBias = String(n?.decision||'').includes('Bullish') ? 1 : String(n?.decision||'').includes('Bearish') ? -1 : 0; } catch {}
      try { const avg = await getNewsSentimentCached(sym); if (Number.isFinite(avg)) sentiment = avg as any; } catch {}
      // Weighted composite score
      const score = (change/10) + (tlScore/100) + (tlBias*0.5) + (sentiment*0.3);
      return { name: s.name, symbol: sym, change, tlScore, tlBias, sentiment, score };
    }
    const batchSize = 5; const out: any[] = [];
    for (let i=0;i<stocks.length;i+=batchSize) {
      const chunk = stocks.slice(i, i+batchSize);
      const res = await Promise.all(chunk.map(scoreOne));
      out.push(...res);
    }
    const ranked = out.filter(x=> Number.isFinite(x.score)).sort((a,b)=> b.score - a.score).slice(0,10);
    el.innerHTML = `
      <div class="muted">Top Suggestions (Composite Score)</div>
      <div class="grid-2" style="gap:12px; align-items:center; margin-top:6px">
        <div><canvas id="suggestionsChart" style="max-height:240px"></canvas></div>
        <div id="suggestionsList"></div>
      </div>`;
    const ctx = (document.getElementById('suggestionsChart') as HTMLCanvasElement)?.getContext('2d');
    if (ctx) {
      upsertChart('suggestionsChart', ctx, {
        type: 'bar', data: { labels: ranked.map(r=> r.symbol), datasets: [{ label: 'Score', data: ranked.map(r=> r.score), backgroundColor: ranked.map(r=> r.score>=0 ? withAlpha(THEME.success,0.85) : withAlpha(THEME.danger,0.85)) }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { enabled: true }, valueLabels: { enabled:true, precision:2, color:'#374151' } }, scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } } }
      });
    }
    const list = document.getElementById('suggestionsList');
    if (list) {
      list.innerHTML = ranked.map(r => {
        const dir = r.tlBias > 0 ? 'Bullish' : r.tlBias < 0 ? 'Bearish' : 'Neutral';
        const col = r.tlBias > 0 ? 'var(--success)' : r.tlBias < 0 ? 'var(--danger)' : 'var(--muted)';
        return `<div class="kpi" style="margin-bottom:8px; padding:8px">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center">
            <div>
              <div class="section-title" style="margin-top:0">${escapeHtml(r.symbol)}</div>
              <div class="muted" style="font-size:11px">? ${r.change>=0?'+':''}${r.change.toFixed(2)}%, TL ${r.tlScore?.toFixed?.(0) ?? '-'} � Sent ${r.sentiment.toFixed(2)}</div>
            </div>
            <button style="padding:6px 10px; border:1px solid var(--border); border-radius:999px; background:transparent; cursor:pointer; color:${col}">${dir}</button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e:any) {
    el.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message||e)}</div>`;
  }
}

// Short TTL caches for suggestions
async function getOverviewCached(symbol: string) {
  const key = `ov:${symbol}`; const ttl = 10*60*1000;
  try { const raw = sessionStorage.getItem(key); if (raw) { const j=JSON.parse(raw); if (j && (Date.now()-Number(j.ts))<ttl) return j.val; } } catch {}
  const val = await new Api().overview(symbol).catch(()=>null);
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), val })); } catch {}
  return val;
}
async function getNewsSentimentCached(symbol: string) {
  const key = `newsavg:${symbol}`; const ttl = 10*60*1000;
  try { const raw = sessionStorage.getItem(key); if (raw) { const j=JSON.parse(raw); if (j && (Date.now()-Number(j.ts))<ttl) return j.val; } } catch {}
  try {
    const news = await new Api().news(symbol);
    const arr = Array.isArray(news?.data) ? news.data : [];
    const avg = arr.length ? arr.slice(0,20).reduce((a:any,x:any)=> a + Number(x?.sentiment ?? 0), 0) / Math.min(20, arr.length) : 0;
    const val = Number.isFinite(avg) ? avg : 0;
    try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), val })); } catch {}
    return val;
  } catch { return 0; }
}

// Kick off suggestions on load
renderSuggestions().catch(()=>{});

// History cache for mini sparklines (watchlist)
async function getHistoryCached(symbol: string, days=60) {
  const key = `hist:${symbol}:${days}`; const ttl = 5*60*1000;
  try { const raw = sessionStorage.getItem(key); if (raw) { const j=JSON.parse(raw); if (j && (Date.now()-Number(j.ts))<ttl) return j.val; } } catch {}
  try {
    const h = await new Api().history(symbol);
    const rows = Array.isArray(h?.data) ? h.data : [];
    const last = rows.slice(-days);
    const out = last.map((r:any)=> ({ t: String(r.date||'').slice(0,10), c: Number(r.close) }));
    try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), val: out })); } catch {}
    return out;
  } catch { return []; }
}

// Background prefetch of TL normalized for broader suggestions, then refresh once
let _tlWarmDone = false;
async function warmTlNormalized(limit = 100) {
  try {
    const listRes = await new Api().listStocks();
    const stocks: Array<{ name:string; symbol:string; yahoo:string }> = (listRes?.data || []).slice(0, limit);
    const batch = 6;
    for (let i=0;i<stocks.length;i+=batch) {
      const chunk = stocks.slice(i, i+batch);
      await Promise.all(chunk.map(s => (window as any).getTlNormalized ? (window as any).getTlNormalized(s.yahoo) : null));
      await new Promise(r=> setTimeout(r, 300));
    }
    if (!_tlWarmDone) { _tlWarmDone = true; try { renderSuggestions(); } catch {} }
  } catch {}
}
setTimeout(()=> warmTlNormalized(120).catch(()=>{}), 1000);

// RAG Explain wiring
function updateRagExplainHint() {
  const hint = document.getElementById('ragExplainHint');
  if (!hint) return;
  const tfDays = tfWindowDays(getTimeframe());
  const custom = (document.getElementById('ragDays') as HTMLInputElement | null)?.value;
  const n = Number(custom || 0);
  const using = (Number.isFinite(n) && n > 0) ? n : tfDays;
  hint.textContent = `Using last ${using} days ${custom? '(custom)' : '(from timeframe)'}`;
}
updateRagExplainHint();

(function initRagExplain(){
  const btn = document.getElementById('ragExplainBtn');
  const out = document.getElementById('ragExplainBody');
  if (!btn || !out) return;
  const num = document.getElementById('ragDays') as HTMLInputElement | null;
  num?.addEventListener('input', () => updateRagExplainHint());
  btn.addEventListener('click', async () => {
    const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
    const symbol = sel?.value || '';
    if (!symbol) { out.textContent = 'Select a stock first.'; return; }
    const tfDays = tfWindowDays(getTimeframe());
    const custom = (document.getElementById('ragDays') as HTMLInputElement | null)?.value;
    const n = Number(custom || 0);
    const days = (Number.isFinite(n) && n > 0) ? n : tfDays;
    const ns = symbol;
    const q = `Explain the key events and factors affecting ${symbol} over the last ${days} days. Prioritize price drivers, fundamentals, and notable news.`;
    // Loading spinner
    try { (btn as HTMLButtonElement).disabled = true; } catch {}
    (out as HTMLElement).innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="muted">Explaining�</span>';
    try {
      const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString().slice(0,10);
      // Include dateCutoff to hint backend filter when available
      const res = await fetch(`/api/rag/query`, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ namespace: ns, query: q, k: 5, withAnswer: Boolean(LLM_ENABLED), dateCutoff: cutoff }) }).then(r=> r.json());
      const ans = res?.answer ?? res?.data?.answer ?? null;
      const sources = res?.sources ?? res?.data?.sources ?? [];
      const hasSources = Array.isArray(sources) && sources.length > 0;
      const srcHtml = hasSources ? `\n\nSources:\n- ` + sources.slice(0,5).map((s:any)=> (s.metadata?.source || '').toString().slice(0,120)).join('\n- ') : '';
      if (ans) {
        (out as HTMLElement).textContent = String(ans) + srcHtml;
      } else if (hasSources) {
        const note = LLM_ENABLED ? 'No direct answer returned.' : 'LLM disabled; showing sources.';
        (out as HTMLElement).textContent = note + srcHtml;
      } else {
        (out as HTMLElement).textContent = 'No RAG documents found for this symbol. Try Ingest first, or index URLs via the RAG Index card.';
      }
    } catch (e:any) {
      (out as HTMLElement).textContent = String(e?.message || e);
    } finally {
      try { (btn as HTMLButtonElement).disabled = false; } catch {}
    }
  });
})();

// TL Cache viewer (SMA/ADV)
async function renderTlCache(symbol: string) {
  const body = document.getElementById('tlCacheBody');
  if (!body) return;
  body.textContent = 'Loading TL cache...';
  try {
    const [smaRes, advRes] = await Promise.all([
      fetch(`/api/tl-cache/by-symbol/${encodeURIComponent(symbol)}?kind=sma`).then(r=>r.json()).catch(()=>({})),
      fetch(`/api/tl-cache/by-symbol/${encodeURIComponent(symbol)}?kind=adv`).then(r=>r.json()).catch(()=>({}))
    ]);
    const sma = smaRes?.data || null;
    const adv = advRes?.data || null;
    const lastSma = (()=>{
      try {
        const arr = Array.isArray(sma?.data) ? sma.data : [];
        const tail = arr.slice(-5).map((p:any)=> Number(p?.v ?? p?.value ?? 0)).filter((n:number)=> Number.isFinite(n));
        return tail.length ? tail.map(n=> n.toFixed(2)).join(', ') : '—';
      } catch { return '—'; }
    })();
    const advSummary = (()=>{
      try {
        const sum = adv?.summary || adv?.Summary || {};
        const buy = Number(sum.buy ?? 0), neutral = Number(sum.neutral ?? 0), sell = Number(sum.sell ?? 0);
        if (buy || neutral || sell) return `Buy: ${buy}, Neutral: ${neutral}, Sell: ${sell}`;
      } catch {}
      return '—';
    })();
    body.innerHTML = `
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="muted">SMA (last points)</div>
          <div>${lastSma}</div>
        </div>
        <div>
          <div class="muted">ADV Summary</div>
          <div>${advSummary}</div>
        </div>
      </div>`;
  } catch (e:any) {
    body.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Stored features charts
async function renderFeaturesStored(symbol: string) {
  const body = document.getElementById('fsBody');
  if (!body) return;
  body.innerHTML = '<span class="spinner"></span> Loading features...';
  try {
    const days = 180;
    const res = await fetch(`/api/features-stored/${encodeURIComponent(symbol)}?days=${days}`).then(r=>r.json());
    const rows: Array<any> = Array.isArray(res?.data) ? res.data : [];
    if (!rows.length) { body.innerHTML = '<div class="muted">No stored features.</div>'; return; }
    const labels = rows.map(r=> String(r.date));
    const sma20 = rows.map(r=> Number(r.sma20 ?? NaN));
    const ema50 = rows.map(r=> Number(r.ema50 ?? NaN));
    const rsi = rows.map(r=> Number(r.rsi ?? NaN));
    const mom = rows.map(r=> Number(r.momentum ?? NaN));
    body.innerHTML = `
      <div class="muted">MA</div>
      <canvas id="fsChartMa" style="max-height:220px"></canvas>
      <div class="muted" style="margin-top:8px">RSI & Momentum</div>
      <canvas id="fsChartOsc" style="max-height:220px"></canvas>`;
    const maCtx = (document.getElementById('fsChartMa') as HTMLCanvasElement)?.getContext('2d');
    const osCtx = (document.getElementById('fsChartOsc') as HTMLCanvasElement)?.getContext('2d');
    if (maCtx) {
      upsertChart('fsChartMa', maCtx, { type:'line', data:{ labels, datasets:[
        { label:'SMA20', data: sma20, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', borderWidth:2, fill: true, tension:0.2, pointRadius:0 },
        { label:'EMA50', data: ema50, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)', borderWidth:2, fill: true, tension:0.2, pointRadius:0 }
      ]}, options:{ plugins:{ legend:{ position:'bottom' } } } });
    }
    if (osCtx) {
      upsertChart('fsChartOsc', osCtx, { type:'line', data:{ labels, datasets:[
        { label:'RSI', data: rsi, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.12)', borderWidth:2, fill: true, tension:0.2, pointRadius:0 },
        { label:'Momentum', data: mom, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.10)', borderWidth:2, fill: true, tension:0.2, pointRadius:0 }
      ]}, options:{ plugins:{ legend:{ position:'bottom' } } } });
    }
  } catch (e:any) {
    body.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Router-card registry bridge (safe append)
try {
  window.addEventListener('hashchange', () => {
    try {
      const h = (location.hash || '').toLowerCase();
      const p = h.startsWith('#/insight') ? 'insight' : h.startsWith('#/ai') ? 'ai' : h.startsWith('#/watchlist') ? 'watchlist' : h.startsWith('#/portfolio') ? 'portfolio' : h.startsWith('#/alerts') ? 'alerts' : h.startsWith('#/settings') ? 'settings' : h.startsWith('#/health') ? 'health' : 'overview';
      CardRegistry.showPage(p as any);
    } catch {}
  });
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const h = (location.hash || '').toLowerCase();
      const p = h.startsWith('#/insight') ? 'insight' : h.startsWith('#/ai') ? 'ai' : h.startsWith('#/watchlist') ? 'watchlist' : h.startsWith('#/portfolio') ? 'portfolio' : h.startsWith('#/alerts') ? 'alerts' : h.startsWith('#/settings') ? 'settings' : h.startsWith('#/health') ? 'health' : 'overview';
      CardRegistry.showPage(p as any);
      const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
      const v = sel?.value || '';
      if (v) emitSymbolChange(v);
    } catch {}
  });
} catch {}

// ----- Extra Pages: Watchlist / Portfolio / Alerts / Settings -----
function ensureExtraPages() {
  const container = document.querySelector('main.content .container') as HTMLElement | null;
  if (!container) return;
  const mkCard = (id: string, title: string, bodyId?: string) => {
    if (document.getElementById(id)) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = id;
    const inner = `<div class="muted">${title}</div>` + (bodyId ? `<div id="${bodyId}" style="margin-top:6px"></div>` : '');
    card.innerHTML = inner;
    container.appendChild(card);
  };
  mkCard('watchlistCard', 'Watchlist', 'watchlistBody');
  mkCard('portfolioCard', 'Portfolio', 'portfolioBody');
  mkCard('alertsCard', 'Alerts & Events', 'alertsBody');
  mkCard('settingsCard', 'Settings', 'settingsBody');
  // Defaults hidden; page router will toggle
  ['watchlistCard','portfolioCard','alertsCard','settingsCard'].forEach(id => { const el = document.getElementById(id); if (el) (el as HTMLElement).style.display = 'none'; });
}

type WLItem = { symbol: string };
function loadWatchlist(): WLItem[] {
  try { const raw = localStorage.getItem('watchlist') || '[]'; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}
function saveWatchlist(items: WLItem[]) {
  try { localStorage.setItem('watchlist', JSON.stringify(items)); } catch {}
}
async function renderWatchlist() {
  const body = document.getElementById('watchlistBody');
  if (!body) return;
  const items = loadWatchlist();
  if (!items.length) { body.innerHTML = '<div class="muted">Your watchlist is empty. Select a stock and click "+ Watchlist".</div>'; return; }
  body.innerHTML = '<span class="spinner"></span> Loading watchlist...';

  // Gather metrics
  type Row = { symbol:string; last:number|null; change:number|null; momentum:number|null; sentiment:number; };
  const data: Row[] = [];
  await Promise.all(items.map(async (it) => {
    const s = (it.symbol || '').toUpperCase();
    const [ov, sent] = await Promise.all([
      getOverviewCached(s).catch(()=>null),
      getNewsSentimentCached(s).catch(()=>0)
    ]);
    const last = Number(ov?.data?.lastClose ?? NaN);
    const ch = Number(ov?.data?.periodChangePct ?? NaN);
    const mom = Number(ov?.data?.momentum ?? NaN);
    data.push({ symbol: s, last: Number.isFinite(last)? last : null, change: Number.isFinite(ch)? ch : null, momentum: Number.isFinite(mom)? mom : null, sentiment: Number(sent) || 0 });
  }));

  // Sorting state
  (window as any).__wlSortKey = (window as any).__wlSortKey || 'symbol';
  (window as any).__wlSortDir = (window as any).__wlSortDir || 'asc';
  const sortKey: keyof Row = (window as any).__wlSortKey;
  const sortDir: 'asc'|'desc' = (window as any).__wlSortDir;
  data.sort((a,b)=>{
    const va:any = a[sortKey]; const vb:any = b[sortKey];
    const ra = (va==null || Number.isNaN(va)) ? -Infinity : va;
    const rb = (vb==null || Number.isNaN(vb)) ? -Infinity : vb;
    const cmp = (ra < rb) ? -1 : (ra > rb) ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const head = `<tr>
    <th data-key="symbol">Symbol</th>
    <th data-key="last" style="text-align:right">Last</th>
    <th data-key="change" style="text-align:right">Change%</th>
    <th data-key="momentum" style="text-align:right">Momentum</th>
    <th data-key="sentiment" style="text-align:right">News Sent.</th>
    <th>Spark</th>
    <th></th>
  </tr>`;
  const rows = data.map(r=>{
    const sColor = r.sentiment>=0 ? 'var(--success)' : 'var(--danger)';
    const mColor = (r.momentum ?? 0)>=0 ? 'var(--success)' : 'var(--danger)';
    const sparkId = `wlSpark-${r.symbol}`;
    return `<tr>
      <td style="font-weight:600">${r.symbol}</td>
      <td style="text-align:right">${r.last!=null ? r.last.toFixed(2) : '-'}</td>
      <td style="text-align:right">${r.change!=null ? r.change.toFixed(2)+'%' : '-'}</td>
      <td style="text-align:right; color:${mColor}">${r.momentum!=null ? (r.momentum*100).toFixed(1)+'%' : '-'}</td>
      <td style="text-align:right; color:${sColor}">${r.sentiment.toFixed(2)}</td>
      <td style="min-width:120px"><canvas id="${sparkId}" class="spark-mini"></canvas></td>
      <td style="text-align:right"><button class="btn-sm" data-remove="${r.symbol}">Remove</button></td>
    </tr>`;
  }).join('');
  body.innerHTML = `<table class="data-grid">${head}${rows}</table>`;
  // Sort header indicators and click
  const ths = Array.from(body.querySelectorAll('th[data-key]')) as HTMLTableCellElement[];
  ths.forEach(th => {
    const k = th.getAttribute('data-key') || '';
    th.classList.remove('sort-asc','sort-desc');
    if (k === sortKey) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key') || 'symbol';
      const curK = (window as any).__wlSortKey;
      const curD = (window as any).__wlSortDir;
      (window as any).__wlSortKey = key;
      (window as any).__wlSortDir = (curK === key && curD === 'asc') ? 'desc' : 'asc';
      renderWatchlist();
    });
  });
  // Remove handlers
  body.querySelectorAll('button[data-remove]')
    .forEach(btn => btn.addEventListener('click', (ev) => {
      const sym = (ev.currentTarget as HTMLButtonElement).getAttribute('data-remove') || '';
      const cur = loadWatchlist().filter(x => (x.symbol||'').toUpperCase() !== sym.toUpperCase());
      saveWatchlist(cur);
      renderWatchlist();
    }));

  // Render mini sparklines
  await Promise.all(data.map(async (r) => {
    const series = await getHistoryCached(r.symbol, 60);
    const labels = series.map(x => x.t);
    const values = series.map(x => x.c);
    const ctx = (document.getElementById(`wlSpark-${r.symbol}`) as HTMLCanvasElement | null)?.getContext('2d');
    if (!ctx) return;
    const first = values[0]; const last = values[values.length-1];
    let line = THEME.brand, fill = withAlpha(THEME.brand, 0.12);
    if (Number.isFinite(first) && Number.isFinite(last)) {
      if (last > first) { line = THEME.success; fill = withAlpha(THEME.success, 0.12); }
      if (last < first) { line = THEME.danger; fill = withAlpha(THEME.danger, 0.12); }
    }
    upsertChart(`wlSpark-${r.symbol}`, ctx, {
      type:'line',
      data: { labels, datasets: [{ data: values, borderColor: line, backgroundColor: fill, borderWidth: 1.5, fill:true, tension:0.25, pointRadius:0 }] },
      options: { plugins:{ legend:{ display:false }, tooltip:{ enabled:false } }, scales: { x:{ display:false }, y:{ display:false } } }
    });
  }));
}

function initSettingsPage() {
  const body = document.getElementById('settingsBody');
  if (!body) return;
  body.innerHTML = `
    <div class="muted">Preferences</div>
    <div class="flex" style="gap:8px; margin-top:6px; flex-wrap:wrap">
      <button id="clearWatchlist" class="btn-sm">Clear Watchlist</button>
      <button id="clearCaches" class="btn-sm">Clear Caches</button>
    </div>
    <div class="muted" style="margin-top:8px; font-size:12px">Theme and timeframe controls are available in the top toolbar.</div>
  `;
  const clearW = document.getElementById('clearWatchlist');
  clearW?.addEventListener('click', () => { saveWatchlist([]); renderWatchlist(); });
  const clearC = document.getElementById('clearCaches');
  clearC?.addEventListener('click', () => { try { sessionStorage.clear(); localStorage.removeItem('selectedSymbol'); } catch {} alert('Cleared caches.'); });
}

// Add to watchlist button wiring
(function initWatchlistButton(){
  const btn = document.getElementById('addToWatchlist');
  btn?.addEventListener('click', () => {
    const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
    const sym = (sel?.value || '').toUpperCase();
    if (!sym) return;
    const wl = loadWatchlist();
    if (!wl.some(x => (x.symbol||'').toUpperCase() === sym)) {
      wl.push({ symbol: sym });
      saveWatchlist(wl);
      renderWatchlist();
    }
  });
})();

window.addEventListener('DOMContentLoaded', () => {
  ensureExtraPages();
  renderWatchlist();
  initSettingsPage();
  initPortfolioPage();
  try { renderQualityScores(); } catch {}
});

// ----- Portfolio placeholder -----
function initPortfolioPage() {
  const body = document.getElementById('portfolioBody');
  if (!body) return;
  if ((body as any).__init_done) return; // initialize once
  (body as any).__init_done = true;
  body.innerHTML = `
    <div class="muted">Paste CSV: symbol, quantity, avg_price</div>
    <div class="flex" style="gap:8px; margin-top:6px; align-items:flex-start">
      <textarea id="pfCsv" rows="6" style="flex:1; min-width:260px" placeholder="symbol,qty,avg_price\nAAPL,10,175\nTSLA,5,220\nINFY.NS,12,1480"></textarea>
      <div style="display:flex; flex-direction:column; gap:6px">
        <button id="pfCompute" class="btn">Compute P/L</button>
        <button id="pfSample" class="btn-sm">Load Sample</button>
      </div>
    </div>
    <div id="pfOut" style="margin-top:10px"></div>
  `;
  const ta = document.getElementById('pfCsv') as HTMLTextAreaElement | null;
  const out = document.getElementById('pfOut') as HTMLElement | null;
  const btn = document.getElementById('pfCompute');
  const sample = document.getElementById('pfSample');
  sample?.addEventListener('click', () => {
    if (!ta) return;
    ta.value = 'symbol,qty,avg_price\nAAPL,10,175\nTSLA,5,220\nINFY.NS,12,1480\nDABUR.NS,20,560';
  });
  btn?.addEventListener('click', async () => {
    if (!ta || !out) return;
    const rows = parseCsv(ta.value || '');
    if (!rows.length) { out.innerHTML = '<div class="muted">No valid rows found.</div>'; return; }
    out.innerHTML = '<span class="spinner"></span> Calculating...';
    type R = { symbol:string; qty:number; avg:number; last:number|null; value:number; pl:number; plpct:number|null };
    const data: R[] = [];
    await Promise.all(rows.map(async r => {
      const sym = String(r.symbol||'').toUpperCase();
      const qty = Number(r.qty||r.quantity||r.shares||0);
      const avg = Number(r.avg_price||r.avg||r.price||0);
      if (!sym || !Number.isFinite(qty) || !Number.isFinite(avg)) return;
      const ov = await getOverviewCached(sym).catch(()=>null);
      const last = Number(ov?.data?.lastClose ?? NaN);
      const lastNum = Number.isFinite(last) ? last : null;
      const value = lastNum!=null ? lastNum*qty : 0;
      const pl = (lastNum!=null ? (lastNum - avg) : 0) * qty;
      const plpct = lastNum!=null && avg!==0 ? ((lastNum-avg)/avg)*100 : null;
      data.push({ symbol:sym, qty, avg, last:lastNum, value, pl, plpct });
    }));
    // totals
    const totalValue = data.reduce((a,x)=> a + x.value, 0);
    const totalCost = data.reduce((a,x)=> a + (x.avg * x.qty), 0);
    const totalPL = totalValue - totalCost;
    const totalPLPct = totalCost!==0 ? (totalPL/totalCost)*100 : null;
    const head = `<tr>
      <th>Symbol</th>
      <th style="text-align:right">Qty</th>
      <th style="text-align:right">Avg</th>
      <th style="text-align:right">Last</th>
      <th style="text-align:right">Value</th>
      <th style="text-align:right">P/L</th>
      <th style="text-align:right">P/L%</th>
    </tr>`;
    const rowsHtml = data.map(d => {
      const plc = d.pl>=0 ? 'var(--success)' : 'var(--danger)';
      return `<tr>
        <td>${d.symbol}</td>
        <td style="text-align:right">${d.qty}</td>
        <td style="text-align:right">${d.avg.toFixed(2)}</td>
        <td style="text-align:right">${d.last!=null ? d.last.toFixed(2) : '-'}</td>
        <td style="text-align:right">${d.value.toFixed(2)}</td>
        <td style="text-align:right; color:${plc}">${d.pl.toFixed(2)}</td>
        <td style="text-align:right; color:${plc}">${d.plpct!=null ? d.plpct.toFixed(2)+'%' : '-'}</td>
      </tr>`;
    }).join('');
    const totc = totalPL>=0 ? 'var(--success)' : 'var(--danger)';
    const foot = `<tr>
      <th>Total</th>
      <th></th>
      <th></th>
      <th></th>
      <th style="text-align:right">${totalValue.toFixed(2)}</th>
      <th style="text-align:right; color:${totc}">${totalPL.toFixed(2)}</th>
      <th style="text-align:right; color:${totc}">${totalPLPct!=null ? totalPLPct.toFixed(2)+'%' : '-'}</th>
    </tr>`;
    out.innerHTML = `<table class="data-grid">${head}${rowsHtml}${foot}</table>`;
  });
}

function parseCsv(text: string): Array<Record<string, string|number>> {
  const lines = (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0];
  const hasHeader = /symbol/i.test(first) && /(qty|quantity|shares)/i.test(first);
  const rows = hasHeader ? lines.slice(1) : lines;
  const out: Array<Record<string, string|number>> = [];
  for (const line of rows) {
    const parts = line.split(/\s*,\s*/g);
    if (parts.length < 3) continue;
    const [symbol, qty, avg] = parts;
    out.push({ symbol, qty: Number(qty), avg_price: Number(avg) });
  }
  return out;
}

// Render three score cards (Durability / Valuation / Momentum)
async function renderQualityScores() {
  const wrap = document.getElementById('scoreCardsBody');
  if (!wrap) return;
  wrap.innerHTML = '<div class="muted">Loading scores…</div>';

  // Helpers
  type S = { val: number; color: 'positive'|'negative'|'neutral' };
  const color = (c: S['color']) => c==='positive' ? cssVar('--success','#16a34a') : c==='negative' ? cssVar('--danger','#ef4444') : '#f1c40f';
  const label = (c: S['color']) => c==='positive' ? 'Positive' : c==='negative' ? 'Negative' : 'Neutral';
  const card = (name: string, s: S) => `
    <div class="score">
      <div class="label">${name}</div>
      <div class="value" style="color:${color(s.color)}">${Number(s.val).toFixed(2)}
        <span class="pill" style="background:${withAlpha(color(s.color),0.15)}; color:${color(s.color)}">${label(s.color)}</span>
      </div>
    </div>`;

  // Determine current selection (base symbol without suffix for resolution)
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  const raw = (sel?.value || (localStorage.getItem('selectedSymbol') || '')).toUpperCase();
  const base = raw.includes('.') ? raw.split('.')[0] : raw;
  if (!base) { wrap.innerHTML = '<div class="muted">Select a stock to see scores.</div>'; return; }

  try {
    // Fetch SMA bundle via backend (resolves tlid automatically)
    const smaRes = await new Api().tlSmaBySymbol(base).catch(()=>null);
    const sma = (smaRes?.data?.sma ?? smaRes?.sma ?? smaRes?.data ?? null) as any;

    // Preferred source: Trendlyne stockHeaders + stockData provide D/V/M directly
    const headers: Array<{ unique_name?: string; name?: string }> = (sma?.body?.stockHeaders || []) as any[];
    const row: any[] = Array.isArray(sma?.body?.stockData) ? sma.body.stockData : [];
    const findIdx = (key: string) => headers.findIndex(h => String(h?.unique_name || '').toLowerCase() === key);
    const iD = findIdx('d_value');
    const iV = findIdx('v_value');
    const iM = findIdx('m_value');
    const iDc = findIdx('d_color');
    const iVc = findIdx('v_color');
    const iMc = findIdx('m_color');

    let sD: S | null = null, sV: S | null = null, sM: S | null = null;
    if (row.length && iD >= 0 && iV >= 0 && iM >= 0) {
      const dRaw = Number(row[iD]);
      const vRaw = Number(row[iV]);
      const mRaw = Number(row[iM]);
      const dc = String(row[iDc] || 'neutral') as S['color'];
      const vc = String(row[iVc] || 'neutral') as S['color'];
      const mc = String(row[iMc] || 'neutral') as S['color'];
      sD = { val: Number.isFinite(dRaw) ? dRaw : 0, color: (dc === 'positive' || dc === 'negative') ? dc : 'neutral' };
      sV = { val: Number.isFinite(vRaw) ? vRaw : 0, color: (vc === 'positive' || vc === 'negative') ? vc : 'neutral' };
      sM = { val: Number.isFinite(mRaw) ? mRaw : 0, color: (mc === 'positive' || mc === 'negative') ? mc : 'neutral' };
    }

    // Fallback: derive from SMA series if headers not present
    if (!sD || !sV || !sM) {
      // Heuristics to extract latest SMA(20/50/200)
      function latestOf(series: any): number | null {
        if (!series) return null;
        try {
          if (Array.isArray(series) && series.length) {
            const last = series[series.length-1];
            const v = Array.isArray(last) ? Number(last[1] ?? last[0]) : Number((last as any).v ?? (last as any).value ?? last);
            return Number.isFinite(v) ? v : null;
          }
        } catch {}
        return null;
      }
      function pickSeries(src: any, keyHints: string[]): any {
        if (!src) return null;
        for (const k of Object.keys(src)) {
          const kl = k.toLowerCase();
          if (keyHints.some(h => kl.includes(h))) return (src as any)[k];
        }
        if (Array.isArray(src)) {
          const ds = src.find((d: any)=> {
            const lab = String(d?.label || d?.name || '').toLowerCase();
            return keyHints.some(h=> lab.includes(h));
          });
          if (ds) return ds.data || ds.values || ds.series || ds;
        }
        if (Array.isArray(src?.data)) return src.data;
        return null;
      }
      const s20 = pickSeries(sma, ['20']);
      const s50 = pickSeries(sma, ['50']);
      const s200 = pickSeries(sma, ['200']);
      const v20 = latestOf(s20);
      const v50 = latestOf(s50);
      const v200 = latestOf(s200);
      const valOr = (v: number | null, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
      const mVal = valOr(v20, valOr(v50, valOr(v200, 0)));
      const dVal = valOr(v200, valOr(v50, valOr(v20, 0)));
      const valVal = valOr(v50, valOr(v20, valOr(v200, 0)));
      sD = sD || { val: dVal, color: 'neutral' };
      sV = sV || { val: valVal, color: 'neutral' };
      sM = sM || { val: mVal, color: 'neutral' };
    }

    wrap.innerHTML = `<div class="score-grid">${card('Durability Score', sD)}${card('Valuation Score', sV)}${card('Momentum Score', sM)}</div>`;
  } catch (e:any) {
    wrap.innerHTML = `<div class="mono" style="color:#ff6b6b">${escapeHtml(e?.message || e)}</div>`;
  }
}





