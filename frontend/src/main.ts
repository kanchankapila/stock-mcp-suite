// @ts-nocheck
// Lightweight bootstrapping for the demo UI using vanilla TS + Vite.
// If you want a full Angular project, generate one with Angular CLI and port the components/services.

import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { emitSymbolChange } from './lib/events';
import * as CardRegistry from './cards/registry';
import { escapeHtml } from './lib/format';
import { emit as emitEvent } from './lib/events';

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
  info: cssVar('--info', '#0ea5e9'),
};

// Patch: helper local history cache used by watchlist sparklines
async function getHistoryCached(symbol: string, days=60): Promise<Array<{ t: string; c: number }>> {
  try { return await new Api().historySeriesCached(symbol, days); } catch { return []; }
}

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
          <div id="wsStatus" class="muted"></div>
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

// Minimal Moneycontrol technicals renderer (pivot + MA summary)
async function renderMcTech(symbol: string, pivot: 'classic'|'fibonacci'|'camarilla', freq: 'D'|'W'|'M') {
  const box = document.getElementById('mctechBody');
  if (!box) return;
  box.innerHTML = '<span class="spinner"></span> Loading technicals...';
  try {
    const res = await new Api().mcTech(symbol, freq);
    const data = res?.data || {};
    const piv = (data.pivots && data.pivots[pivot]) || data.pivots || {};
    const maSig = data.movingAverages || data.ma || {};
    const fmt = (n: any) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—');
    const pivotHtml = Object.keys(piv).length
      ? `<div class="grid-3" style="gap:6px; margin-top:6px">` +
        Object.entries(piv).map(([k,v]) => `<div class="chip" style="background:${withAlpha(THEME.brand,0.10)}; color:${THEME.brand}">${k.toUpperCase()}: ${fmt(v as any)}</div>`).join('') + '</div>'
      : '<div class="muted">No pivot data.</div>';
    const maHtml = `<div style="margin-top:8px">`+
      `<span class="chip" style="background:${withAlpha(THEME.success,0.15)}; color:${THEME.success}">SMA: ${Number(maSig.sma_bullish||0)} / ${Number(maSig.sma_total||0)}</span> `+
      `<span class="chip" style="background:${withAlpha(THEME.info,0.15)}; color:${THEME.info}">EMA: ${Number(maSig.ema_bullish||0)} / ${Number(maSig.ema_total||0)}</span>`+
      `</div>`;
    box.innerHTML = `<div class="muted">${symbol} • ${pivot} • ${freq}</div>${pivotHtml}${maHtml}`;
  } catch (e: any) {
    box.innerHTML = `<div class="mono" style="color:${THEME.danger}">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Minimal Moneycontrol stock history renderer (price spark + stats)
async function renderMcStockHistory(symbol: string) {
  const body = document.getElementById('mcHistBody');
  if (!body) return;
  body.innerHTML = '<span class="spinner"></span> Loading history...';
  try {
    const resSel = document.getElementById('mcHistResolution') as HTMLSelectElement | null;
    const resolution = resSel?.value || '1D';
    const res = await new Api().mcStockHistory(symbol, resolution);
    const rows: Array<any> = Array.isArray(res?.data) ? res.data : [];
    if (!rows.length) { body.innerHTML = '<div class="muted">No MC history.</div>'; return; }
    const last = rows[rows.length-1];
    const closes = rows.map(r => Number(r.close ?? r.c ?? NaN)).filter(n => Number.isFinite(n));
    const min = Math.min(...closes); const max = Math.max(...closes); const ch = closes.length>1 ? (closes[closes.length-1] - closes[0]) / closes[0] * 100 : 0;
    body.innerHTML = `<div class="muted">${rows.length} pts • Range ${min.toFixed(2)}–${max.toFixed(2)} • Change ${ch.toFixed(2)}%</div>`;
  } catch (e:any) {
    body.innerHTML = `<div class="mono" style="color:${THEME.danger}">${escapeHtml(e?.message || e)}</div>`;
  }
}

// Fix implicit any in sorting tail arrays
function sortNums(arr: number[]) { return arr.slice().sort((a: number, b: number) => a - b); }

// Ensure watchlist sparkline map callbacks have typed params
// (Any existing usage will benefit from the explicit function definitions above.)

// --- Agent Q&A Card Initialization (Added) ---
(function initAgentQa(){
  const askBtn = document.getElementById('ask') as HTMLButtonElement | null;
  const input = document.getElementById('agentq') as HTMLInputElement | null;
  const answer = document.getElementById('agentAnswer') as HTMLElement | null;
  const historyBox = document.getElementById('historyBox') as HTMLElement | null;
  if (!askBtn || !input || !answer) return; // Card not rendered yet
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  let busy = false;
  const history: string[] = [];
  function renderHistory(){ if (historyBox) historyBox.textContent = history.slice(-50).join('\n'); }
  function fmtPct(x: any){ return (typeof x === 'number' && Number.isFinite(x)) ? (x*100).toFixed(2)+'%' : 'n/a'; }
  function fmtNum(x: any, d=2){ return (typeof x === 'number' && Number.isFinite(x)) ? x.toFixed(d) : 'n/a'; }
  async function run(){
    if (busy) return; const q = (input.value || '').trim(); if (!q) return;
    const symbol = sel?.value || undefined;
    busy = true; askBtn.disabled = true; input.disabled = true;
    answer.textContent = '⏳ Running agent...';
    try {
      const apiRes = await new Api().agent(q, symbol);
      if (!apiRes || apiRes.ok === false) throw new Error(apiRes?.error || 'Agent failed');
      // Shape: { ok:true, data:{ answer, intents, data } }
      const payload = apiRes.data || {};
      const agentAnswer = payload.answer || payload.data?.answer || '';
      const stats = payload.data; // raw stats object (latest, changePct etc.)
      let extra = '';
      if (stats && typeof stats === 'object' && stats.latest) {
        const latest = stats.latest || {};
        extra += '\n';
        extra += 'Key Metrics:\n';
        extra += `  Close: ${fmtNum(latest.close)} (Δ ${fmtNum(stats.change)} / ${fmtPct(stats.changePct)})\n`;
        extra += `  5d: ${fmtPct(stats.ret5)} • 20d: ${fmtPct(stats.ret20)}\n`;
        extra += `  RSI: ${fmtNum(stats.rsi)} • Sentiment: ${fmtNum(stats.sentiment,3)}\n`;
        if (stats.options) extra += `  Options PCR: ${fmtNum(stats.options.pcr)} PVR: ${fmtNum(stats.options.pvr)} Bias: ${fmtNum(stats.options.bias)}\n`;
        if (stats.prediction) extra += `  Pred Next Close: ${fmtNum(stats.prediction)} (${fmtPct(stats.predictionPct)})\n`;
      } else if (payload.intents?.wantStats && !stats?.latest) {
        extra += '\n(No local price data. Run Ingest first to populate history.)';
      }
      const finalText = agentAnswer ? agentAnswer + extra : JSON.stringify(payload, null, 2);
      answer.textContent = finalText;
      history.push(`> ${q}`); history.push(finalText.split('\n')[0]);
      renderHistory();
    } catch (err: any) {
      answer.textContent = '❌ ' + (err?.message || String(err));
    } finally {
      busy = false; askBtn.disabled = false; input.disabled = false; input.focus();
    }
  }
  askBtn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { run(); } });
})();
// --- End Agent Q&A ---

// --- Stock Select Initialization (Added) ---
(function initStockSelectorV2(){
  const sel = document.getElementById('stockSelect') as HTMLSelectElement | null;
  if (!sel) return;
  const LS_KEY_LAST = 'stocks:last';
  let loading = false;
  async function fetchList(force=false){
    if (loading) return; loading = true;
    try {
      const api = new Api();
      const listRes = await api.listStocksCached(force);
      const list: any[] = Array.isArray((listRes as any).data) ? (listRes as any).data : Array.isArray(listRes) ? listRes : [];
      if (!sel.querySelector('option[data-loaded]')) {
        Array.from(sel.options).forEach(o => { if (!o.disabled) sel.removeChild(o); });
        for (const r of list.slice(0, 3000)) {
          const opt = document.createElement('option');
          opt.value = r.symbol;
          opt.textContent = `${r.symbol} — ${r.name || r.symbol}`;
          opt.setAttribute('data-loaded','1');
          sel.appendChild(opt);
        }
      }
      const last = localStorage.getItem(LS_KEY_LAST);
      if (last && list.some(l => l.symbol === last) && sel.value !== last) {
        sel.value = last;
        sel.dispatchEvent(new Event('change'));
      }
    } catch (err){ console.warn('listStocksCached failed', err); }
    finally { loading = false; }
  }
  let currentSymbolAbort: AbortController | null = null;
  async function loadSymbolDataV2(symbol: string){
    if (!symbol) return;
    try { localStorage.setItem(LS_KEY_LAST, symbol); } catch {}
    emitEvent('symbol:selected', symbol);
    // Abort previous in-flight requests
    if (currentSymbolAbort) { try { currentSymbolAbort.abort(); } catch {} }
    currentSymbolAbort = new AbortController();
    const signal = currentSymbolAbort.signal;
    performance.mark('symbol-load-start');
    const ov = document.getElementById('overview');
    const hist = document.getElementById('history');
    const newsBox = document.getElementById('news');
    if (ov) ov.innerHTML = '<div class="muted">Overview</div><div class="mono">Loading...</div>';
    if (hist) hist.innerHTML = '<div class="muted">Price History</div><div class="mono">Loading...</div>';
    if (newsBox) newsBox.innerHTML = '<div class="muted">News (RAG)</div><div class="mono">Loading...</div>';
    try {
      const [ovr, hst, nws, ana] = await Promise.allSettled([
        new Api().overview(symbol, { signal }),
        new Api().history(symbol, { signal }),
        new Api().news(symbol, { signal }),
        new Api().analyze(symbol, { signal })
      ]);
      if (ov && ovr.status === 'fulfilled') {
        const d = ovr.value?.data || ovr.value;
        ov.innerHTML = `<div class='muted'>Overview</div><pre class='mono' style='white-space:pre-wrap'>${escapeHtml(JSON.stringify(d, null, 2))}</pre>`;
      }
      if (hist && hst.status === 'fulfilled') {
        const arr = hst.value?.data || hst.value || [];
        const last = Array.isArray(arr) && arr.length ? arr[arr.length-1] : null;
        hist.innerHTML = `<div class='muted'>Price History</div><div class='mono'>Rows: ${Array.isArray(arr)?arr.length:0}${last?` | Last Close ${last.close} (${last.date})`:''}</div>`;
      }
      if (newsBox && nws.status === 'fulfilled') {
        const arr = nws.value?.data || nws.value || [];
        const top = Array.isArray(arr)?arr.slice(0,5):[];
        newsBox.innerHTML = `<div class='muted'>News (RAG)</div><div class='mono' style='white-space:pre-wrap'>${top.map((n:any)=>`- ${escapeHtml(n.title||'')}`).join('\n') || 'No news'}</div>`;
      }
      if (ana.status === 'fulfilled') {
        const a = ana.value?.data || ana.value;
        const sentCard = document.getElementById('sentiment');
        if (sentCard) sentCard.innerHTML = `<div class='muted'>Sentiment & Recommendation</div><div class='mono'>Sentiment: ${a?.sentiment?.toFixed? a.sentiment.toFixed(3):a?.sentiment} | Pred: ${a?.predictedClose} | Score: ${a?.score} | Rec: ${escapeHtml(a?.recommendation||'')}</div>`;
      }
    } catch (err:any) {
      if (err?.name === 'AbortError') {
        console.debug('symbol load aborted', symbol);
      } else {
        console.warn('symbol load failed', err);
      }
    } finally {
      performance.mark('symbol-load-end');
      try { const measure = performance.measure('symbol-load', 'symbol-load-start', 'symbol-load-end'); console.debug('symbol-load ms', measure.duration); } catch {}
    }
  }
  sel.addEventListener('change', ()=>{
    const symbol = sel.value;
    if (!symbol) return;
    loadSymbolDataV2(symbol);
  });
  fetchList();
})();
// --- End Stock Select Initialization ---

// --- Cache Debug Panel (dev aid) ---
(function initCacheDebug(){
  const container = document.querySelector('.container');
  if (!container) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'cacheDebug';
  card.innerHTML = `<div class="muted">Cache Debug</div>
    <div class='flex' style='margin-top:6px'>
      <button id='cacheRefresh' class='btn-sm'>Refresh Keys</button>
      <button id='cacheClear' class='btn-sm'>Clear All</button>
      <input id='cachePrefix' placeholder='Prefix (optional)' style='flex:1; min-width:140px' />
      <button id='cacheInvalidate' class='btn-sm'>Invalidate Prefix</button>
    </div>
    <pre id='cacheKeysBox' class='mono' style='white-space:pre-wrap; margin-top:6px; max-height:160px; overflow:auto'></pre>`;
  container.appendChild(card);
  function render(){
    try { (document.getElementById('cacheKeysBox') as HTMLElement).textContent = Api.cacheKeys().join('\n') || '(empty)'; } catch {}
  }
  card.querySelector('#cacheRefresh')?.addEventListener('click', render);
  card.querySelector('#cacheClear')?.addEventListener('click', ()=>{ Api.invalidate(); render(); });
  card.querySelector('#cacheInvalidate')?.addEventListener('click', ()=>{ const p = (document.getElementById('cachePrefix') as HTMLInputElement).value.trim(); if (p) Api.invalidate(p); render(); });
  render();
})();
// --- End Cache Debug Panel ---

// --- Stub helpers to satisfy references (real implementations may live elsewhere) ---
function applyTimeframe(tf: 'D'|'M'|'Y') {
  // Placeholder: could adjust chart windows / aggregation.
  console.debug('[applyTimeframe]', tf);
}
function renderYahooData(symbol: string) {
  console.debug('[renderYahooData] stub', symbol);
}
function renderMcPriceVolume(symbol: string) {
  console.debug('[renderMcPriceVolume] stub', symbol);
  // Optional: lazy fetch to warm cache
  try { new Api().mcPriceVolume(symbol).catch(()=>{}); } catch {}
}
function renderTrendlyneAdvTech(symbol: string) {
  console.debug('[renderTrendlyneAdvTech] stub', symbol);
}
function renderWatchlist() { console.debug('[renderWatchlist] stub'); }
function initPortfolioPage() { console.debug('[initPortfolioPage] stub'); }
function initSettingsPage() { console.debug('[initSettingsPage] stub'); }
// --- End stubs ---





