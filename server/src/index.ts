import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as stockRoutes } from './routes/stocks.js';
import { router as ragRoutes } from './routes/rag.js';
import { ragHealth } from './rag/langchain.js';
import { router as externalRoutes } from './routes/external.js';
import { startTrendlyneCookieAutoRefresh } from './providers/trendlyneHeadless.js';
import { attachMcp } from './mcp/mcp-server.js';
import { attachLive } from './ws/live.js';
import { logger } from './utils/logger.js';
import { startYahooPrefetchFromStocklist } from './providers/prefetch.js';
import { startRagAutoTasks } from './rag/auto.js';
import { metricsWithMeta } from './utils/metrics.js';

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

app.get('/health', (_req, res)=> res.json({ ok:true }));
app.get('/health/rag', async (_req, res) => {
  try {
    const h = await ragHealth();
    res.json({ ok: h.ok, data: h });
  } catch (err:any) {
    res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
});

app.get('/api/metrics', (_req, res) => {
  res.json({ ok: true, data: metricsWithMeta() });
});

app.use('/api', stockRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/external', externalRoutes);
attachMcp(app);

// Error handler (keep last)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled_error');
  const status = err?.status || 500;
  res.status(status).json({ ok:false, error: status === 500 ? 'Internal Server Error' : String(err?.message || err) });
});

// Global process-level safety nets
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled_rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught_exception');
});

const BASE_PORT = Number(process.env.PORT || 4010);
const PORT_AUTOINC = String(process.env.PORT_AUTOINC ?? 'true') === 'true';
const PORT_MAX_TRIES = Number(process.env.PORT_MAX_TRIES || 5);

function listenOnce(port: number) {
  return new Promise<import('http').Server>((resolve, reject) => {
    const srv = app.listen(port, async () => {
      logger.info({ port }, 'server_listening');
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
      // Attach WebSocket live quotes once server is listening
      attachLive(srv);
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

// Background prefetcher for NSE tickers from stocklist.ts via Yahoo
startYahooPrefetchFromStocklist();

// Trendlyne cookie auto-refresh scheduler
startTrendlyneCookieAutoRefresh();
