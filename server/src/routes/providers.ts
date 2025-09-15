import express from 'express';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ingestionManager } from '../providers/IngestionManager.js';
import { logger } from '../utils/logger.js';
import { ProviderMetrics } from '../providers/ProviderMetrics.js';
import { ProviderScheduler } from '../providers/ProviderScheduler.js';
import { listRecentProviderRuns, listProviderRunErrors, getProviderLastSuccess, getProviderConsecutiveFailures } from '../db.js';

export const router = express.Router();

router.get('/providers', (_req, res) => {
  const list = ProviderRegistry.list().map(p => ({ ...p }));
  res.json({ ok: true, providers: list });
});

router.get('/providers/:id', (req, res) => {
  const id = req.params.id;
  const prov = ProviderRegistry.get(id);
  if (!prov) return res.status(404).json({ ok:false, error: 'not_found' });
  const cfg = ProviderRegistry.getConfig(id) || null;
  res.json({ ok:true, provider: { id: prov.id, name: prov.name, kind: prov.kind, supportsSymbol: prov.supportsSymbol, config: cfg } });
});

router.post('/providers/:id/ingest', async (req, res) => {
  const id = req.params.id;
  try {
    const { symbols, rag, dryRun, apiKey } = req.body || {};
    const result = await ingestionManager.run({ providerId: id, symbols, rag, dryRun, apiKey });
    res.json({ ok:true, result });
  } catch (err:any) {
    logger.warn({ err, id }, 'provider_ingest_failed');
    res.status(400).json({ ok:false, error: String(err?.message||err) });
  }
});

router.get('/providers/:id/health', (req, res) => {
  const id = req.params.id;
  const cfg = ProviderRegistry.getConfig(id);
  const prov = ProviderRegistry.get(id); // null if disabled
  const runs = listRecentProviderRuns(id, 5);
  const last = runs.length ? runs[0] : null;
  const errors = listProviderRunErrors(id, last?.id, 25);
  const metrics = ProviderMetrics.list().find(m=>m.providerId===id) || null;
  const lastSuccess = getProviderLastSuccess(id);
  const consecutiveFailures = getProviderConsecutiveFailures(id);
  res.json({ ok:true, data: { id, config: cfg || null, disabled: !prov, lastRun: last, lastSuccess, consecutiveFailures, recentRuns: runs, lastRunErrors: errors, metrics } });
});

router.get('/providers/metrics', (_req, res) => {
  const list = ProviderMetrics.list();
  const enriched = list.map(m => { const lastSuccess = getProviderLastSuccess(m.providerId); const fails = getProviderConsecutiveFailures(m.providerId); return { ...m, lastSuccess, consecutiveFailures: fails }; });
  res.json({ ok:true, data: enriched });
});

router.get('/providers/schedule', (_req, res) => {
  const jobs = ProviderScheduler.list();
  const cfgs = jobs.map(j => ({ providerId: j.providerId, running: j.running, scheduleCron: ProviderRegistry.getConfig(j.providerId)?.scheduleCron || null }));
  res.json({ ok:true, data: cfgs });
});

router.post('/providers/:id/enable', (req, res) => {
  const id = req.params.id;
  ProviderRegistry.enable(id);
  res.json({ ok:true });
});

router.post('/providers/:id/disable', (req, res) => {
  const id = req.params.id;
  ProviderRegistry.disable(id, 'manual_disable');
  res.json({ ok:true });
});

router.post('/providers/:id/schedule/run', async (req, res) => {
  const id = req.params.id;
  try {
    await ProviderScheduler.run(id);
    res.json({ ok:true });
  } catch (err:any) { res.status(400).json({ ok:false, error: String(err?.message||err) }); }
});

router.post('/providers/schedule/restart', (_req, res) => {
  ProviderScheduler.restart();
  res.json({ ok:true });
});
