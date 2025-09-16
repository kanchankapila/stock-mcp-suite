import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MLClient } from '../clients/mlClient.js';
import { insertBacktestRun, getBacktestRun } from '../db.js';

export const router = Router();

const runs = new Map<string, any>();
function mlEnabled() { return String(process.env.ENABLE_ML ?? 'false').toLowerCase() === 'true'; }

router.post('/backtest/run', asyncHandler(async (req, res) => {
  const cfg = req.body || {};
  if (!mlEnabled()) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    insertBacktestRun({ id, status: 'disabled', cfg, metrics: null, equity: null });
    return res.json({ ok:true, id, status: 'disabled' });
  }
  const ml = new MLClient();
  const out = await ml.backtestRun(cfg);
  const id = out?.id || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  insertBacktestRun({ id, status: out?.status || 'done', cfg, metrics: out?.metrics || null, equity: out?.equity || null });
  res.json({ ok:true, id, status: out?.status || 'done' });
}));

router.get('/backtest/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ ok:false, error:'id required' });
  const dbRow = getBacktestRun(id);
  if (dbRow) return res.json({ ok:true, data: dbRow });
  if (!mlEnabled()) return res.json({ ok:true, data: null });
  const ml = new MLClient();
  const data = await ml.backtestGet(id);
  // persist if present
  if (data) insertBacktestRun({ id, status: data?.status || 'done', cfg: {}, metrics: data?.metrics || null, equity: data?.equity || null });
  res.json({ ok:true, data: data || null });
}));
