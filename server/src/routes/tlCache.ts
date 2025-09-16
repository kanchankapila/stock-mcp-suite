import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getTlCache } from '../db.js';
import { resolveTicker } from '../utils/ticker.js';

export const router = Router();

router.get('/tl-cache/:tlid', asyncHandler(async (req, res) => {
  const tlid = String(req.params.tlid || '').trim();
  const kind = (String(req.query.kind || 'sma').toLowerCase() as 'sma'|'adv');
  if (!tlid) return res.status(400).json({ ok:false, error:'tlid required' });
  const data = getTlCache(tlid, kind);
  res.json({ ok:true, data });
}));

router.get('/tl-cache/by-symbol/:symbol', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  const kind = (String(req.query.kind || 'sma').toLowerCase() as 'sma'|'adv');
  if (!input) return res.status(400).json({ ok:false, error:'symbol required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const tlid = resolveTicker(base, 'trendlyne');
  if (!tlid) return res.status(404).json({ ok:false, error:'tlid_not_found' });
  const data = getTlCache(tlid, kind);
  res.json({ ok:true, data, tlid });
}));

