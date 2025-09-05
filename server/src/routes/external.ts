import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { etGetAllIndices, etSectorPerformance, etIndexConstituents, mcPriceVolume, mcStockHistory, tickertapeMmiNow, marketsMojoValuationMeter, mcChartInfo, mcPriceForecast, mcFnoExpiries, mcTechRsi } from '../providers/external.js';
import { tlAdvTechnical, tlSmaChart, tlDerivativeBuildup, tlHeatmap, getTrendlyneCookieStatus } from '../providers/trendlyne.js';
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
  let id = tlid;
  if (!id && input) {
    const base = input.includes('.') ? input.split('.')[0] : input;
    const e = findStockEntry(base);
    id = e?.tlid || '';
  }
  if (!id) return res.status(400).json({ ok:false, error: 'tlid or symbol required' });
  const [adv, sma] = await Promise.all([
    tlAdvTechnical(id, 24).catch(()=>null),
    tlSmaChart(id).catch(()=>null)
  ]);
  res.json({ ok: true, data: { tlid: id, adv, sma } });
}));

router.get('/trendlyne/derivatives', asyncHandler(async (req, res) => {
  const dateKey = String(req.query.date || '').trim();
  const tlid = String(req.query.tlid || '').trim();
  if (!dateKey) return res.status(400).json({ ok:false, error:'date required (e.g., 2024-08-30)' });
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
