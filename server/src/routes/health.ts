import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getProviderResolutionConfig, listTickerProvidersFromEnv } from '../utils/ticker.js';
import { bullStatus } from '../jobs/bull.js';

export const router = Router();

router.get('/health/providers', asyncHandler(async (_req, res) => {
  const providers = listTickerProvidersFromEnv().map(p => ({ provider: p, config: getProviderResolutionConfig(p as any) }));
  res.json({ ok:true, data: { providers } });
}));

router.get('/health/queue', asyncHandler(async (_req, res) => {
  const enabled = String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true';
  res.json({ ok:true, data: { enabled, bull: bullStatus() } });
}));

router.get('/jobs/status', asyncHandler(async (_req, res) => {
  const stat = bullStatus();
  let metrics: any = null;
  try { const refs: any = (globalThis as any).__bullMetrics; metrics = refs || null; } catch {}
  res.json({ ok:true, data: { ...stat, metrics } });
}));
