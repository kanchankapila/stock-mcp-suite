import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as stockRoutes } from './routes/stocks.js';
import { router as ragRoutes } from './routes/rag.js';
import { router as featuresRoutes } from './routes/features.js';
import { router as mlRoutes } from './routes/ml.js';
import { router as backtestRoutes } from './routes/backtest.js';
import { router as healthRoutes } from './routes/health.js';
import { router as tlCacheRoutes } from './routes/tlCache.js';
import { router as sourcesRoutes } from './routes/sources.js';
import { ragHealth } from './rag/langchain.js';
import { router as externalRoutes } from './routes/external.js';
import { startTrendlyneCookieAutoRefresh } from './providers/trendlyneHeadless.js';
import { attachMcp } from './mcp/mcp-server.js';
import { logger } from './utils/logger.js';
import { bootstrapProviders } from './providers/ProviderRegistry.js';
import { router as providersRoutes } from './routes/providers.js';
import { ProviderScheduler } from './providers/ProviderScheduler.js';
import { startRagAutoTasks } from './rag/auto.js';
import { startBullJobs } from './jobs/bull.js';
import { router as jobsRoutes } from './routes/jobs.js';
import { router as portfolioRoutes } from './routes/portfolio.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { ResponseUtils } from './shared/utils/response.utils.js';
import { router as agentRoutes } from './routes/agent.js';
import { startYahooPrefetchFromStocklist } from './providers/prefetch.js';
import { router as moneycontrolRoutes } from './routes/moneycontrol.js';
import { router as mcLiteRoutes } from './routes/mc.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start }, 'http_request');
    });
    next();
  });

  app.get('/health', (_req, res)=> res.json(ResponseUtils.success(true)));
  app.get('/health/rag', async (_req, res) => {
    try {
      const h = await ragHealth();
      if (!h.ok) return res.status(503).json(ResponseUtils.error('RAG store unavailable'));
      res.json(ResponseUtils.success(h));
    } catch (err:any) {
      res.status(500).json(ResponseUtils.internalError());
    }
  });

  app.use('/api', stockRoutes);
  app.use('/api', featuresRoutes);
  app.use('/api', mlRoutes);
  app.use('/api', backtestRoutes);
  app.use('/api', healthRoutes);
  app.use('/api', jobsRoutes);
  app.use('/api', tlCacheRoutes);
  app.use('/api', sourcesRoutes);
  app.use('/api', portfolioRoutes);
  app.use('/api', providersRoutes);
  app.use('/api', agentRoutes);
  app.use('/api/moneycontrol', moneycontrolRoutes);
  app.use('/api/mc', mcLiteRoutes);
  app.use('/api/rag', ragRoutes);
  app.use('/api/external', externalRoutes);
  attachMcp(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export async function initializeBackground() {
  try {
    const providers = bootstrapProviders();
    logger.info({ count: providers.length }, 'providers_bootstrapped');
    ProviderScheduler.start();
    logger.info('provider_scheduler_started');
  } catch (err:any) { logger.warn({ err }, 'providers_bootstrap_failed'); }
  try { const h = await ragHealth(); if (h.ok) logger.info({ rag: h }, 'rag_store_ready'); else logger.warn({ rag: h }, 'rag_store_unavailable'); startRagAutoTasks(); } catch (err:any) { logger.warn({ err }, 'rag_health_check_failed'); }
  try { if (String(process.env.PREFETCH_DISABLED || 'false').toLowerCase() !== 'true') { startYahooPrefetchFromStocklist(); logger.info('prefetch_started'); } else { logger.warn('prefetch_disabled_env'); } } catch (err:any) { logger.warn({ err }, 'prefetch_start_failed'); }
  if (String(process.env.PREFETCH_DISABLED || 'false').toLowerCase() !== 'true') { startTrendlyneCookieAutoRefresh(); } else { logger.warn('trendlyne_cookie_refresh_disabled_env'); }
  startBullJobs().then((s)=> logger.info({ s }, 'jobs_init')).catch(()=>{});
}
