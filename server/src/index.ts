import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as stockRoutes } from './routes/stocks.js';
import { router as ragRoutes } from './routes/rag.js';
import { router as externalRoutes } from './routes/external.js';
import { startTrendlyneCookieAutoRefresh } from './providers/trendlyneHeadless.js';
import { attachMcp } from './mcp/mcp-server.js';
import { attachLive } from './ws/live.js';
import { logger } from './utils/logger.js';
import { startYahooPrefetchFromStocklist } from './providers/prefetch.js';

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

const PORT = Number(process.env.PORT || 4010);
const server = app.listen(PORT, ()=>{
  logger.info({ port: PORT }, 'server_listening');
});

// Attach WebSocket live quotes
attachLive(server);

// Background prefetcher for NSE tickers from stocklist.ts via Yahoo
startYahooPrefetchFromStocklist();

// Trendlyne cookie auto-refresh scheduler
startTrendlyneCookieAutoRefresh();
