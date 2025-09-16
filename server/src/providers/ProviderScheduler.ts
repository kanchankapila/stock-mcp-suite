import cron from 'node-cron';
import { ProviderRegistry } from './ProviderRegistry.js';
import { ingestionManager } from './IngestionManager.js';
import { logger } from '../utils/logger.js';

interface ScheduledJob { providerId: string; task: cron.ScheduledTask; running: boolean; }

class ProviderSchedulerImpl {
  private jobs = new Map<string, ScheduledJob>();
  private enabled = true;
  constructor() {}
  start() {
    if (!this.enabled) return;
    const list = ProviderRegistry.list();
    for (const p of list) {
      const cfg = ProviderRegistry.getConfig(p.id);
      if (!cfg?.scheduleCron || !cfg.enabled) continue;
      if (this.jobs.has(p.id)) continue;
      try {
        const task = cron.schedule(cfg.scheduleCron, () => this.run(p.id), { scheduled: true });
        this.jobs.set(p.id, { providerId: p.id, task, running: false });
        logger.info({ provider: p.id, cron: cfg.scheduleCron }, 'provider_job_scheduled');
      } catch (err) {
        logger.warn({ provider: p.id, err, cron: cfg.scheduleCron }, 'provider_cron_invalid');
      }
    }
  }
  async run(providerId: string) {
    const job = this.jobs.get(providerId);
    if (job && job.running) { logger.warn({ providerId }, 'provider_job_overlap_skipped'); return; }
    if (ProviderRegistry.isDisabled(providerId)) { logger.warn({ providerId }, 'provider_disabled_skip_schedule'); return; }
    if (job) job.running = true;
    const cfg = ProviderRegistry.getConfig(providerId);
    try {
      await ingestionManager.run({ providerId, rag: cfg?.ragEnabled });
    } catch (err) {
      logger.warn({ providerId, err }, 'scheduled_ingest_failed');
    } finally { if (job) job.running = false; }
  }
  stop() {
    for (const j of this.jobs.values()) { try { j.task.stop(); } catch {} }
    this.jobs.clear();
  }
  restart() { this.stop(); this.start(); }
  list() { return Array.from(this.jobs.values()).map(j => ({ providerId: j.providerId, running: j.running })); }
}

export const ProviderScheduler = new ProviderSchedulerImpl();
