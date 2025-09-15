import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import {
  addPortfolioEntry,
  listPortfolioEntries,
  portfolioSummary,
  portfolioPerformance,
  addWatchlistSymbol,
  listWatchlistSymbols,
  listAlerts,
  listRssNews,
  listOptionsMetrics,
  latestPrice,
  listProviderData,
  removePortfolioEntry,
  removeWatchlistSymbol,
  removeAlert,
  addAlert
} from '../db.js';
import { etGetAllIndices, etSectorPerformance } from '../providers/external.js';
import { evaluateAlerts } from '../services/alertsEvaluator.js';
import { ResponseUtils } from '../shared/utils/response.utils.js';

export const router = Router();

// Simple in-memory rate limiter (per IP, write endpoints)
const writeLimiter: import('express').RequestHandler = (req, res, next) => {
  const key = req.ip || 'anon';
  const now = Date.now();
  const bucketMs = 10 * 60 * 1000; // 10 min
  const maxWrites = 60; // 60 writes / 10 min
  (global as any).__WRITE_BUCKETS ||= new Map();
  const map: Map<string, { windowStart: number; count: number }> = (global as any).__WRITE_BUCKETS;
  const b = map.get(key);
  if (!b || now - b.windowStart > bucketMs) {
    map.set(key, { windowStart: now, count: 1 });
    return next();
  }
  if (b.count >= maxWrites) {
    return res.status(429).json(ResponseUtils.rateLimited('Too many write requests, retry later.'));
  }
  b.count += 1; return next();
};

function validSymbol(sym: string) {
  return /^[A-Z0-9_.-]{1,20}$/.test(sym);
}

// ---- Portfolio Endpoints ----
router.get('/portfolio', asyncHandler((_, res) => {
  const rows = listPortfolioEntries().map(r => {
    const lp = latestPrice(r.symbol);
    const currentPrice = lp?.close ?? r.buy_price;
    const invested = r.buy_price * r.quantity;
    const currentValue = currentPrice * r.quantity;
    const pnl = currentValue - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { ...r, currentPrice, invested, currentValue, pnl, pnlPct };
  });
  res.json(ResponseUtils.success(rows));
}));

router.post('/portfolio/add', writeLimiter, asyncHandler((req, res) => {
  const { symbol, buyDate, buyPrice, quantity } = req.body || {};
  if (!symbol || !buyDate || !Number.isFinite(Number(buyPrice)) || !Number.isFinite(Number(quantity))) {
    return res.status(400).json(ResponseUtils.error('symbol, buyDate, buyPrice, quantity required'));
  }
  const sym = String(symbol).toUpperCase().trim();
  if (!validSymbol(sym)) return res.status(400).json(ResponseUtils.error('invalid_symbol'));
  addPortfolioEntry({ symbol: sym, buy_date: String(buyDate), buy_price: Number(buyPrice), quantity: Number(quantity) });
  res.json(ResponseUtils.success(true));
}));

router.delete('/portfolio/:id', writeLimiter, asyncHandler((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(ResponseUtils.error('invalid_id'));
  removePortfolioEntry(id);
  res.json(ResponseUtils.success(true));
}));

router.get('/portfolio/summary', asyncHandler((_, res) => {
  res.json(ResponseUtils.success(portfolioSummary()));
}));

router.get('/portfolio/performance', asyncHandler((_, res) => {
  res.json(ResponseUtils.success(portfolioPerformance()));
}));

// ---- Watchlist ----
router.get('/watchlist', asyncHandler((_, res) => {
  res.json(ResponseUtils.success(listWatchlistSymbols()));
}));

router.post('/watchlist/add', writeLimiter, asyncHandler((req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json(ResponseUtils.error('symbol required'));
  const sym = String(symbol).toUpperCase().trim();
  if (!validSymbol(sym)) return res.status(400).json(ResponseUtils.error('invalid_symbol'));
  addWatchlistSymbol(sym);
  res.json(ResponseUtils.success(true));
}));

router.delete('/watchlist/:symbol', writeLimiter, asyncHandler((req, res) => {
  const sym = String(req.params.symbol || '').toUpperCase().trim();
  if (!validSymbol(sym)) return res.status(400).json(ResponseUtils.error('invalid_symbol'));
  removeWatchlistSymbol(sym);
  res.json(ResponseUtils.success(true));
}));

// ---- Alerts ----
router.get('/alerts', asyncHandler((req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(ResponseUtils.success(listAlerts(Math.max(1, Math.min(500, limit)))));
}));

router.post('/alerts/add', writeLimiter, asyncHandler((req, res) => {
  const { symbol, kind, level, note } = req.body || {};
  if (!symbol || !kind || !Number.isFinite(Number(level))) return res.status(400).json(ResponseUtils.error('symbol, kind, level required'));
  const sym = String(symbol).toUpperCase().trim();
  if (!validSymbol(sym)) return res.status(400).json(ResponseUtils.error('invalid_symbol'));
  if (!/^rsi|price_drop|custom$/i.test(kind)) return res.status(400).json(ResponseUtils.error('invalid_kind'));
  addAlert({ symbol: sym, kind: String(kind).toLowerCase(), level: Number(level), note: note ? String(note).slice(0,200) : undefined });
  res.json(ResponseUtils.success(true));
}));

router.delete('/alerts/:id', writeLimiter, asyncHandler((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(ResponseUtils.error('invalid_id'));
  removeAlert(id);
  res.json(ResponseUtils.success(true));
}));

router.post('/alerts/evaluate', asyncHandler(async (_req, res) => {
  const result = await evaluateAlerts();
  res.json(ResponseUtils.success(result));
}));

// ---- RSS + News (ingested) ----
router.get('/rss', asyncHandler((req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(ResponseUtils.success(listRssNews(Math.max(1, Math.min(200, limit)))));
}));

// ---- F&O / Options Metrics ----
router.get('/fo/:symbol', asyncHandler((req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const rows = listOptionsMetrics(symbol, { days: 90, limit: 120 });
  const latest = rows.length ? rows[rows.length - 1] : null;
  res.json(ResponseUtils.success({ latest, history: rows }));
}));

// ---- Provider Data (generic) ----
router.get('/provider-data/:symbol', asyncHandler((req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const provider = req.query.provider ? String(req.query.provider) : undefined;
  res.json(ResponseUtils.success(listProviderData(symbol, provider)));
}));

// ---- Default Watchlist (indices + sectors) ----
const DEFAULT_WATCHLIST = [
  { symbol: 'NIFTY', name: 'Nifty 50 Index' },
  { symbol: 'SENSEX', name: 'BSE Sensex' },
  { symbol: 'BANKNIFTY', name: 'Nifty Bank' },
  { symbol: 'PHARMANIFTY', name: 'Nifty Pharma' },
  { symbol: 'FINNIFTY', name: 'Nifty Financial Services' }
];
router.get('/defaultWatchlist', asyncHandler((_, res) => {
  const enriched = DEFAULT_WATCHLIST.map(w => {
    const lp = latestPrice(w.symbol);
    return { ...w, lastClose: lp?.close ?? null, lastDate: lp?.date ?? null };
  });
  res.json(ResponseUtils.success(enriched));
}));

// ---- Indices (enhanced via ET provider if available) ----
router.get('/indices', asyncHandler(async (_req, res) => {
  try {
    const raw: any = await etGetAllIndices().catch(()=>null);
    if (raw && Array.isArray(raw.searchresult)) {
      const mapped = raw.searchresult.slice(0,15).map((r:any)=> ({
        symbol: String(r.ticker || r.symbol || r.index_name || '').toUpperCase(),
        name: r.index_name || r.fullname || r.name || null,
        last: r.lastvalue ?? r.last ?? null,
        dayChange: r.change ?? null,
        dayPct: r.percentchange ?? null,
        turnoverCr: r.turnover ?? null
      }));
      return res.json(ResponseUtils.success(mapped));
    }
  } catch {}
  const indices = [{ symbol:'NIFTY', name:'Nifty 50'}, { symbol:'SENSEX', name:'BSE Sensex' }].map(i => { const lp = latestPrice(i.symbol); return { ...i, last: lp?.close ?? null }; });
  res.json(ResponseUtils.success(indices));
}));

// ---- Sector Highlights (enhanced from ET provider) ----
router.get('/sectors', asyncHandler(async (_req, res) => {
  try {
    const raw: any = await etSectorPerformance().catch(()=>null);
    if (raw && Array.isArray(raw.searchresult)) {
      const sectors = raw.searchresult.map((s:any)=> ({
        sector: s.sector_name || s.name || s.sector || 'UNKNOWN',
        changePct: s.marketcappercentchange ?? s.percentchange ?? null,
        advancers: s.advances ?? null,
        decliners: s.declines ?? null,
        unchanged: s.unchanged ?? null
      }));
      return res.json(ResponseUtils.success(sectors));
    }
  } catch {}
  res.json(ResponseUtils.success([ { sector:'IT', changePct:null, advancers:null, decliners:null, unchanged:null } ]));
}));

// ---- Market Status (IST) ----
function computeMarketStatus(now = new Date()) {
  // Indian market hours: 09:15 - 15:30 IST (Mon-Fri)
  try {
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay(); // 0 Sun ... 6 Sat
    const isWeekend = (day === 0 || day === 6);
    const h = ist.getHours();
    const m = ist.getMinutes();
    const minutes = h * 60 + m;
    const openMin = 9 * 60 + 15; // 09:15
    const closeMin = 15 * 60 + 30; // 15:30
    const isOpen = !isWeekend && minutes >= openMin && minutes <= closeMin;
    let status = isOpen ? 'OPEN' : 'CLOSED';
    // next open/close estimates
    let nextOpen: string | null = null;
    let nextClose: string | null = null;
    if (isOpen) {
      const closeDate = new Date(ist);
      closeDate.setHours(15,30,0,0);
      nextClose = closeDate.toISOString();
    } else {
      // find next weekday
      const next = new Date(ist);
      next.setHours(9,15,0,0);
      while (next.getDay() === 0 || next.getDay() === 6 || next <= ist) {
        next.setDate(next.getDate() + 1);
        next.setHours(9,15,0,0);
      }
      nextOpen = next.toISOString();
    }
    // Added homepage friendly fields
    const dateStr = ist.toISOString().slice(0,10);
    const timeStr = ist.toISOString().slice(11,19);
    return { istIso: ist.toISOString(), status, isOpen, nextOpen, nextClose, date: dateStr, time: timeStr, timezone: 'IST', marketOpen: isOpen };
  } catch (err) {
    logger.warn({ err }, 'market_status_failed');
    return { istIso: new Date().toISOString(), status: 'UNKNOWN', isOpen: false, nextOpen: null, nextClose: null, date: new Date().toISOString().slice(0,10), time: new Date().toISOString().slice(11,19), timezone: 'IST', marketOpen: false };
  }
}

router.get('/marketStatus', asyncHandler((_, res) => {
  res.json(ResponseUtils.success(computeMarketStatus()));
}));

export default router;