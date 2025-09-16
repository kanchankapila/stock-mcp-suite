import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MLClient } from '../clients/mlClient.js';

export const router = Router();

function mlEnabled() { return String(process.env.ENABLE_ML ?? 'false').toLowerCase() === 'true'; }

router.post('/predict/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ ok:false, error:'symbol required' });
  if (!mlEnabled()) return res.status(501).json({ ok:false, error:'ML disabled; set ENABLE_ML=true and ML_BASE_URL' });
  const horizon = Number(req.query.horizon ?? 1);
  const ml = new MLClient();
  const data = await ml.predict(symbol, { horizon });
  res.json({ ok:true, data });
}));

router.get('/models', asyncHandler(async (_req, res) => {
  if (!mlEnabled()) return res.json({ ok:true, data: [] });
  const ml = new MLClient();
  const data = await ml.models();
  res.json({ ok:true, data });
}));

router.get('/models/:id', asyncHandler(async (req, res) => {
  if (!mlEnabled()) return res.status(404).json({ ok:false, error:'ML disabled' });
  const id = String(req.params.id || '');
  const ml = new MLClient();
  const data = await ml.modelById(id);
  res.json({ ok:true, data });
}));

router.post('/walkforward/:symbol', asyncHandler(async (req, res) => {
  if (!mlEnabled()) return res.status(501).json({ ok:false, error:'ML disabled; set ENABLE_ML=true and ML_BASE_URL' });
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ ok:false, error:'symbol required' });
  const ml = new MLClient();
  const data = await ml.walkforward(symbol, req.body || {});
  res.json({ ok:true, data });
}));
