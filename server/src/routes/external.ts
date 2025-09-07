import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { etGetAllIndices, etSectorPerformance, etIndexConstituents, mcPriceVolume, mcStockHistory, tickertapeMmiNow, marketsMojoValuationMeter, mcChartInfo, mcPriceForecast, mcFnoExpiries, mcTechRsi } from '../providers/external.js';
import { tlAdvTechnical, tlSmaChart, tlDerivativeBuildup, tlHeatmap, getTrendlyneCookieStatus, getTrendlyneCookieDetails, normalizeAdvTechnical } from '../providers/trendlyne.js';
import fetch from 'node-fetch';
import { refreshTrendlyneCookieHeadless } from '../providers/trendlyneHeadless.js';
import { resolveTicker, findStockEntry } from '../utils/ticker.js';
import { fetchMcTech } from '../providers/moneycontrol.js';

export const router = Router();

router.get('/et/indices', asyncHandler(async (_req, res) => {
  const data = await etGetAllIndices();
  res.json({ ok: true, data });
}));

router.get('/et/sector-performance', asyncHandler(async (_req, res) => {
  const data = await etSectorPerformance();
  res.json({ ok: true, data });
}));

// ET: index constituents by indexId
router.get('/et/index-constituents', asyncHandler(async (req, res) => {
  const indexId = String(req.query.indexId || req.query.indexid || '').trim();
  if (!indexId) return res.status(400).json({ ok:false, error:'indexId required' });
  const pageSize = req.query.pagesize ? Number(req.query.pagesize) : 500;
  const pageNo = req.query.pageno ? Number(req.query.pageno) : 1;
  const data = await etIndexConstituents(indexId, pageSize, pageNo);
  res.json({ ok: true, data });
}));

router.get('/mc/price-volume', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '').toUpperCase();
  if (!input) return res.status(400).json({ ok:false, error:'symbol required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const entry = findStockEntry(base);
  const mcs = entry?.mcsymbol;
  if (!mcs) return res.status(404).json({ ok:false, error:`mcsymbol not found for ${input}` });
  const data = await mcPriceVolume(mcs);
  res.json({ ok: true, data });
}));

router.get('/mc/stock-history', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '').toUpperCase();
  if (!input) return res.status(400).json({ ok:false, error:'symbol required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const entry = findStockEntry(base);
  const mcs = entry?.mcsymbol;
  if (!mcs) return res.status(404).json({ ok:false, error:`mcsymbol not found for ${input}` });
  const resolution = String(req.query.resolution || '1D');
  const from = req.query.from ? Number(req.query.from) : undefined;
  const to = req.query.to ? Number(req.query.to) : undefined;
  const data = await mcStockHistory(mcs, resolution, from, to);
  res.json({ ok: true, data });
}));

// Moneycontrol quick bundle: chartInfo, price-forecast, expiries, RSI D/W/M
router.get('/mc/quick', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '').toUpperCase();
  if (!input) return res.status(400).json({ ok:false, error:'symbol required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const entry = findStockEntry(base);
  const mcs = entry?.mcsymbol;
  if (!mcs) return res.status(404).json({ ok:false, error:'mcsymbol not found' });
  const [chart, forecast, rD, rW, rM] = await Promise.all([
    mcChartInfo(mcs, '1D').catch(()=>null),
    mcPriceForecast(mcs).catch(()=>null),
    mcTechRsi(mcs, 'D').catch(()=>null),
    mcTechRsi(mcs, 'W').catch(()=>null),
    mcTechRsi(mcs, 'M').catch(()=>null),
  ]);
  // Optional F&O expiries require a different id (e.g., IDF01); attempt from entry.tlid or symbol mapping if provided via query
  const fid = String(req.query.fid || '');
  const expiries = fid ? await mcFnoExpiries(fid).catch(()=>null) : null;
  res.json({ ok:true, data: { mcsymbol: mcs, chart, forecast, expiries, rsi: { D: rD, W: rW, M: rM } } });
}));

router.get('/mc/tech', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '').toUpperCase();
  if (!input) return res.status(400).json({ ok:false, error:'symbol required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const entry = findStockEntry(base);
  const mcs = entry?.mcsymbol;
  if (!mcs) return res.status(404).json({ ok:false, error:`mcsymbol not found for ${input}` });
  const freq = String(req.query.freq || 'D') as 'D'|'W'|'M';
  const data = await fetchMcTech(mcs, freq);
  res.json({ ok: true, data });
}));

// Trendlyne advanced technicals and SMA chart by tlid or symbol
router.get('/trendlyne/adv-tech', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '');
  const tlid = String(req.query.tlid || '');
  const lookback = req.query.lookback ? Number(req.query.lookback) : 24;
  let id = tlid;
  if (!id && input) {
    const base = input.includes('.') ? input.split('.')[0] : input;
    try { id = resolveTicker(base, 'trendlyne'); } catch { id = ''; }
  }
  if (!id) return res.status(400).json({ ok:false, error: 'tlid or symbol required' });
  // Public unauthenticated fetch for Advanced Technicals (no cookie handling)
  const url = `https://trendlyne.com/equity/api/stock/adv-technical-analysis/${encodeURIComponent(id)}/${encodeURIComponent(String(isFinite(lookback) && lookback > 0 ? lookback : 24))}/`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Referer': 'https://trendlyne.com/'
      }
    } as any);
    if (!resp.ok) return res.status(resp.status).json({ ok:false, error: `trendlyne_${resp.status}` });
    const adv = await resp.json().catch(()=>null);
    // Optionally include a lightweight SMA for the card sparkline
    const sma = await tlSmaChart(id).catch(()=>null);
    const normalized = adv ? normalizeAdvTechnical(adv) : null;
    return res.json({ ok: true, data: { tlid: id, adv, sma, normalized } });
  } catch (err) {
    return res.status(502).json({ ok:false, error: 'trendlyne_adv_fetch_failed' });
  }
}));

router.get('/trendlyne/derivatives', asyncHandler(async (req, res) => {
  const dateKey = String(req.query.date || '').trim();
  let tlid = String(req.query.tlid || '').trim();
  const symbol = String(req.query.symbol || '').trim();
  if (!dateKey) return res.status(400).json({ ok:false, error:'date required (e.g., 2024-08-30)' });
  if (!tlid && symbol) {
    const base = symbol.includes('.') ? symbol.split('.')[0] : symbol;
    try { tlid = resolveTicker(base, 'trendlyne'); } catch {}
  }
  const [buildup, heatmap] = await Promise.all([
    tlid ? tlDerivativeBuildup(dateKey, tlid).catch(()=>null) : Promise.resolve(null),
    tlHeatmap(dateKey).catch(()=>null)
  ]);
  res.json({ ok:true, data: { buildup, heatmap } });
}));

// Trendlyne cookie status
router.get('/trendlyne/cookie-status', asyncHandler(async (_req, res) => {
  res.json({ ok: true, data: getTrendlyneCookieStatus() });
}));

// Trendlyne SMA chart by tlid or symbol (ensures cookie if possible)
router.get('/trendlyne/sma', asyncHandler(async (req, res) => {
  const input = String(req.query.symbol || '');
  const tlid = String(req.query.tlid || '');
  let id = tlid;
  if (!id && input) {
    const base = input.includes('.') ? input.split('.')[0] : input;
    try { id = resolveTicker(base, 'trendlyne'); } catch { id = ''; }
  }
  if (!id) return res.status(400).json({ ok:false, error: 'tlid or symbol required' });
  // Prefer cookie-backed provider with smart fallback
  try {
    let sma = await tlSmaChart(id).catch(()=>null);
    if (!sma || (Array.isArray((sma as any)?.data) && !(sma as any).data.length)) {
      // Retry via headless cookie refresh if creds are present
      if (process.env.TRENDLYNE_EMAIL && process.env.TRENDLYNE_PASSWORD) {
        try { await refreshTrendlyneCookieHeadless(); } catch {}
        sma = await tlSmaChart(id).catch(()=>null);
      }
    }
    if (!sma) {
      // Public unauthenticated fetch (as last resort)
      const url = `https://trendlyne.com/mapp/v1/stock/chart-data/${encodeURIComponent(id)}/SMA/`;
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json,text/plain,*/*',
            'Referer': 'https://trendlyne.com/'
          }
        } as any);
        if (resp.ok) sma = await resp.json().catch(()=>null);
      } catch {}
    }
    return res.json({ ok: true, data: { tlid: id, sma } });
  } catch {
    return res.status(502).json({ ok:false, error: 'trendlyne_sma_fetch_failed' });
  }
}));

// Trendlyne cookie dump (masked by default). To allow raw dump, set ALLOW_COOKIE_DUMP=true
router.get('/trendlyne/cookie-dump', asyncHandler(async (req, res) => {
  const wantRaw = String(req.query.raw || '').toLowerCase() === 'true';
  const allow = String(process.env.ALLOW_COOKIE_DUMP || 'false') === 'true';
  const data = getTrendlyneCookieDetails(wantRaw && allow);
  if (wantRaw && !allow) {
    return res.json({ ok: true, data, note: 'Raw cookie disabled. Set ALLOW_COOKIE_DUMP=true to enable.' });
  }
  res.json({ ok: true, data });
}));

// Headless refresh of Trendlyne cookie (requires TRENDLYNE_EMAIL & TRENDLYNE_PASSWORD)
router.post('/trendlyne/cookie-refresh', asyncHandler(async (_req, res) => {
  const out = await refreshTrendlyneCookieHeadless();
  res.json({ ok: true, data: out });
}));

router.get('/tickertape/mmi', asyncHandler(async (_req, res) => {
  const data = await tickertapeMmiNow();
  res.json({ ok: true, data });
}));

router.get('/marketsmojo/valuation', asyncHandler(async (_req, res) => {
  const data = await marketsMojoValuationMeter();
  res.json({ ok: true, data });
}));
