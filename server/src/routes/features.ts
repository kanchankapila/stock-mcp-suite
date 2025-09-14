import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { MLClient } from '../clients/mlClient.js';
import db from '../db.js';

export const router = Router();

router.get('/features/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const days = req.query.days ? Number(req.query.days) : 60;
  const ENABLE_ML = String(process.env.ENABLE_ML ?? 'false').toLowerCase() === 'true';
  if (!symbol) return res.status(400).json({ ok:false, error:'symbol required' });
  if (!ENABLE_ML) {
    return res.json({ ok:true, data: { symbol, days, features: null }, note: 'ML disabled; enable ENABLE_ML and ML_BASE_URL' });
  }
  try {
    const ml = new MLClient();
    const data = await ml.features(symbol, days);
    res.json({ ok:true, data });
  } catch (err:any) {
    logger.error({ err }, 'features_proxy_failed');
    res.status(502).json({ ok:false, error: String(err?.message || err) });
  }
}));

// Read stored features from DB (no ML dependency)
router.get('/features-stored/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const days = req.query.days ? Number(req.query.days) : 60;
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!symbol) return res.status(400).json({ ok:false, error:'symbol required' });
  try {
    let rows: Array<any> = [];
    if (from && to) {
      const stmt = db.prepare(`SELECT date, ret1, ret5, ret20, vol, rsi, sma20, ema50, momentum, sent_avg, pcr, pvr FROM features WHERE symbol=? AND date>=? AND date<=? ORDER BY date ASC`);
      rows = stmt.all(symbol, from, to);
    } else {
      const cutoff = new Date(Date.now() - Math.max(1, days)*24*60*60*1000).toISOString().slice(0,10);
      const stmt = db.prepare(`SELECT date, ret1, ret5, ret20, vol, rsi, sma20, ema50, momentum, sent_avg, pcr, pvr FROM features WHERE symbol=? AND date>=? ORDER BY date ASC`);
      rows = stmt.all(symbol, cutoff);
    }
    res.json({ ok:true, data: rows });
  } catch (err:any) {
    logger.warn({ err, symbol }, 'features_read_failed');
    res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}));
