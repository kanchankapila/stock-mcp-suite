import express from 'express';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ingestionManager } from '../providers/IngestionManager.js';
import { logger } from '../utils/logger.js';
import { ProviderMetrics } from '../providers/ProviderMetrics.js';
import { ProviderScheduler } from '../providers/ProviderScheduler.js';
import { listRecentProviderRuns, listProviderRunErrors, getProviderLastSuccess, getProviderConsecutiveFailures, listProviderRunsPaged, listProviderRunBatches, aggregateAllProvidersPerformance, aggregateProviderPerformance, pruneProviderRuns } from '../db.js';

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

router.post('/providers/ingest/all', async (req, res) => {
  const { providers, rag, dryRun, concurrency = 1, apiKey } = req.body || {};
  const all = ProviderRegistry.list().filter(p=> (providers ? providers.includes(p.id) : true));
  if (!all.length) return res.status(400).json({ ok:false, error: 'no_providers' });
  const limit = Math.max(1, Number(concurrency)||1);
  const queue = all.slice();
  const results: any[] = []; const errors: any[] = [];
  async function worker() {
    while (queue.length) {
      const prov = queue.shift(); if (!prov) break;
      try {
        const r = await ingestionManager.run({ providerId: prov.id, rag, dryRun, apiKey });
        results.push({ providerId: prov.id, ok:true, meta: { prices: r.prices?.length||0, news: r.news?.length||0, batches: (r as any).batches?.length||0 } });
      } catch (err:any) {
        const msg = String(err?.message||err);
        errors.push({ providerId: prov.id, error: msg });
        logger.warn({ providerId: prov.id, err: msg }, 'bulk_ingest_provider_failed');
      }
    }
  }
  const workers = Array.from({ length: limit }, ()=> worker());
  const started = Date.now();
  await Promise.all(workers);
  const durationMs = Date.now()-started;
  res.json({ ok: errors.length===0, durationMs, results, errors, totalProviders: all.length });
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

router.get('/providers/:id/runs', (req, res) => {
  const id = req.params.id;
  const limit = Math.min(100, Number(req.query.limit)||20);
  const offset = Math.max(0, Number(req.query.offset)||0);
  const rows = listProviderRunsPaged(id, limit, offset);
  res.json({ ok:true, data: rows });
});

router.get('/providers/runs/:runId/batches', (req, res) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) return res.status(400).json({ ok:false, error: 'bad_run_id' });
  const rows = listProviderRunBatches(runId);
  res.json({ ok:true, data: rows });
});

router.get('/providers/perf/aggregate', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit)||50);
  const data = aggregateAllProvidersPerformance(limit);
  res.json({ ok:true, data });
});

router.get('/providers/:id/perf', (req, res) => {
  const id = req.params.id;
  const limit = Math.min(200, Number(req.query.limit)||50);
  const data = aggregateProviderPerformance(id, limit);
  res.json({ ok:true, data });
});

router.post('/providers/runs/prune', (req, res) => {
  const days = Number(req.body?.days|| req.query.days || 0);
  if (!days) return res.status(400).json({ ok:false, error: 'missing_days' });
  const out = pruneProviderRuns(days);
  res.json({ ok:true, pruned: out });
});

router.get('/providers/:id/ingest/stream', async (req, res) => {
  const id = req.params.id;
  const dryRun = String(req.query.dryRun||'false')==='true';
  const rag = String(req.query.rag||'false')==='true';
  const symbols = (req.query.symbols? String(req.query.symbols).split(',').filter(Boolean): undefined);
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();

  let closed=false; const abort = { aborted:false };
  req.on('close', ()=> { closed=true; abort.aborted=true; });
  const send = (event:string, data:any)=> { if (closed) return; res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
  send('start', { providerId: id, ts: Date.now() });
  try {
    await ingestionManager.runWithProgress({ providerId: id, symbols, rag, dryRun, onProgress: (p)=> send('progress', p), abortSignal: abort });
    send('end', { ok:true, ts: Date.now() });
  } catch (err:any) {
    send('error', { ok:false, error: String(err?.message||err) });
  } finally {
    res.end();
  }
});
