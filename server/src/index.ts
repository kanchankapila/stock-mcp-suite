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
// Live WS and Yahoo prefetch removed (Yahoo provider deprecated)
import { startRagAutoTasks } from './rag/auto.js';
import { startBullJobs } from './jobs/bull.js';
import { router as jobsRoutes } from './routes/jobs.js';
import { router as portfolioRoutes } from './routes/portfolio.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { ResponseUtils } from './shared/utils/response.utils.js';
import { router as agentRoutes } from './routes/agent.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Lightweight request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start
    }, 'http_request');
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
app.use('/api/rag', ragRoutes);
app.use('/api/external', externalRoutes);
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
attachMcp(app);

// 404 handler
app.use(notFoundHandler);

// Central error handler (must be last)
app.use(errorHandler);

// Global process-level safety nets
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled_rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught_exception');
});

const BASE_PORT = Number(process.env.PORT || 4010);
const isDev = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
// Disable auto-increment by default in dev for stability; allow prod to keep prior behavior
const PORT_AUTOINC = String(process.env.PORT_AUTOINC ?? (isDev ? 'false' : 'true')) === 'true';
const PORT_MAX_TRIES = Number(process.env.PORT_MAX_TRIES || 5);

function listenOnce(port: number) {
  return new Promise<import('http').Server>((resolve, reject) => {
    const srv = app.listen(port, async () => {
      logger.info({ port }, 'server_listening');
      try {
        const providers = bootstrapProviders();
        logger.info({ count: providers.length }, 'providers_bootstrapped');
        ProviderScheduler.start();
        logger.info('provider_scheduler_started');
      } catch (err:any) { logger.warn({ err }, 'providers_bootstrap_failed'); }
      try {
        const h = await ragHealth();
        if (h.ok) logger.info({ rag: h }, 'rag_store_ready');
        else logger.warn({ rag: h }, 'rag_store_unavailable');
        // Kick off RAG auto-tasks (migrate/build) in background
        startRagAutoTasks();
      } catch (err:any) {
        logger.warn({ err }, 'rag_health_check_failed');
      }
      resolve(srv);
    });
    srv.on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') return reject(Object.assign(err, { port }));
      reject(err);
    });
  });
}

async function startWithRetry(basePort: number) {
  let port = basePort;
  for (let attempt = 0; attempt < Math.max(1, PORT_MAX_TRIES); attempt++) {
    try {
      const srv = await listenOnce(port);
      // Live WebSocket disabled (Yahoo provider removed)
      return srv;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE') {
        if (!PORT_AUTOINC) {
          logger.error({ err, port }, 'port_in_use_exit');
          process.exit(1);
        }
        logger.warn({ port }, 'port_in_use_try_next');
        port += 1;
        continue;
      }
      logger.error({ err }, 'server_listen_failed');
      process.exit(1);
    }
  }
  logger.error({ basePort, tries: PORT_MAX_TRIES }, 'port_autoinc_exhausted');
  process.exit(1);
}

// Start server with auto-increment if configured
startWithRetry(BASE_PORT);

// Background Yahoo prefetch removed

// Trendlyne cookie auto-refresh scheduler (can be heavy; gate when prefetch disabled)
if (String(process.env.PREFETCH_DISABLED || 'false').toLowerCase() !== 'true') {
  startTrendlyneCookieAutoRefresh();
} else {
  logger.warn('trendlyne_cookie_refresh_disabled_env');
}

// Yahoo cookie auto-refresh removed (no longer used)

// Start BullMQ jobs if enabled and available
startBullJobs().then((s)=> logger.info({ s }, 'jobs_init')).catch(()=>{});
