import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { enqueueJob, bullStatus } from '../jobs/bull.js';

export const router = Router();

router.post('/jobs/enqueue', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const symbols: string[] = Array.isArray(body.symbols) ? body.symbols : [];
  const targets: string[] = Array.isArray(body.targets) ? body.targets : ['ingest:tl','features:build'];
  const queued: Array<{ queue: string, id: string }> = [];
  for (const t of targets) {
    const ret = await enqueueJob(t as any, { symbols });
    queued.push({ queue: t, id: String(ret?.id || '') });
  }
  res.json({ ok: true, queued, status: bullStatus() });
}));

