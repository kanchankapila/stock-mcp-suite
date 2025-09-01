import type { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { fetchYahooQuotesBatch, fetchYahooDaily, parseYahooDaily } from '../providers/yahoo.js';
import { resolveTicker } from '../utils/ticker.js';
import { insertPriceRow, upsertStock, latestPrice } from '../db.js';
import { logger } from '../utils/logger.js';

type Client = { ws: import('ws').WebSocket, subs: Set<string> };

export function attachLive(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<Client>();
  const subscriptions = new Map<string, number>(); // symbol -> refcount

  // Tunables for polling + backoff
  const LIVE_BASE_MS = Number(process.env.LIVE_POLL_BASE_MS || 10_000);
  const LIVE_BACKOFF_MULT = Number(process.env.LIVE_BACKOFF_MULT || 2);
  const LIVE_BACKOFF_MAX_MS = Number(process.env.LIVE_BACKOFF_MAX_MS || 60_000);
  const LIVE_BACKOFF_DECAY_MS = Number(process.env.LIVE_BACKOFF_DECAY_MS || 500);
  const LIVE_QUOTE_BATCH_SIZE = Number(process.env.LIVE_QUOTE_BATCH_SIZE || 25);
  const LIVE_INTER_CHUNK_MS = Number(process.env.LIVE_INTER_CHUNK_MS || 200);
  const LIVE_USE_CHART_FALLBACK = String(process.env.LIVE_USE_CHART_FALLBACK || 'true') === 'true';

  function subscribe(sym: string) {
    const s = sym.toUpperCase();
    subscriptions.set(s, (subscriptions.get(s) || 0) + 1);
  }
  function unsubscribe(sym: string) {
    const s = sym.toUpperCase();
    const n = (subscriptions.get(s) || 0) - 1;
    if (n <= 0) subscriptions.delete(s); else subscriptions.set(s, n);
  }

  wss.on('connection', (ws) => {
    const client: Client = { ws, subs: new Set<string>() };
    clients.add(client);
    logger.info('ws_client_connected');
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === 'subscribe' && msg.symbol) {
          const sym = resolveTicker(String(msg.symbol), 'yahoo').toUpperCase();
          client.subs.add(sym);
          subscribe(sym);
          ws.send(JSON.stringify({ type:'subscribed', symbol: sym }));
          // Try to send latest cached price immediately (if any)
          try {
            const last = latestPrice(sym);
            if (last) {
              const time = new Date(last.date + 'T15:30:00Z').toISOString();
              ws.send(JSON.stringify({ type:'quote', symbol: sym, price: last.close, time }));
            }
          } catch {}
        }
        if (msg.type === 'unsubscribe' && msg.symbol) {
          const sym = resolveTicker(String(msg.symbol), 'yahoo').toUpperCase();
          client.subs.delete(sym);
          unsubscribe(sym);
          ws.send(JSON.stringify({ type:'unsubscribed', symbol: sym }));
        }
      } catch {}
    });
    ws.on('close', () => {
      for (const s of client.subs) unsubscribe(s);
      clients.delete(client);
      logger.info('ws_client_disconnected');
    });
  });

  // Poller to fetch quotes and store (with batching + backoff)
  let currentDelay = LIVE_BASE_MS;
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const poll = async () => {
    try {
      const syms = Array.from(subscriptions.keys());
      if (syms.length) {
        for (let i = 0; i < syms.length; i += LIVE_QUOTE_BATCH_SIZE) {
          const chunk = syms.slice(i, i + LIVE_QUOTE_BATCH_SIZE);
          try {
            const quotes = await fetchYahooQuotesBatch(chunk);
            for (const q of quotes) {
              const date = new Date(q.time).toISOString().slice(0,10);
              const row = { symbol: q.symbol, date, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 };
              insertPriceRow(row);
              upsertStock(q.symbol, q.symbol);
              const payload = JSON.stringify({ type: 'quote', symbol: q.symbol, price: q.price, time: q.time });
              for (const c of clients) { if (c.subs.has(q.symbol) && c.ws.readyState === 1) c.ws.send(payload); }
            }
            // success: decay delay
            if (currentDelay > LIVE_BASE_MS) {
              currentDelay = Math.max(LIVE_BASE_MS, currentDelay - LIVE_BACKOFF_DECAY_MS);
            }
          } catch (err) {
            logger.error({ err, symbols: chunk.join(',') }, 'yahoo_quote_failed');
            // Optional chart-based fallback per symbol
            if (LIVE_USE_CHART_FALLBACK) {
              for (const s of chunk) {
                try {
                  const chart = await fetchYahooDaily(s, '1d', '1m');
                  const rows = parseYahooDaily(s, chart);
                  const last = rows[rows.length - 1];
                  if (last) {
                    insertPriceRow(last);
                    upsertStock(s, s);
                    const time = new Date(last.date + 'T15:30:00Z').toISOString();
                    const payload = JSON.stringify({ type: 'quote', symbol: s, price: last.close, time });
                    for (const c of clients) { if (c.subs.has(s) && c.ws.readyState === 1) c.ws.send(payload); }
                  }
                  await sleep(Math.max(200, LIVE_INTER_CHUNK_MS));
                } catch (e) {
                  logger.error({ err: e, symbol: s }, 'yahoo_chart_fallback_failed');
                }
              }
            }
            // failure: backoff
            currentDelay = Math.min(LIVE_BACKOFF_MAX_MS, Math.max(LIVE_BASE_MS, currentDelay * LIVE_BACKOFF_MULT));
          }
          await sleep(LIVE_INTER_CHUNK_MS);
        }
      }
    } catch (err) {
      logger.error({ err }, 'ws_poll_cycle_failed');
      currentDelay = Math.min(LIVE_BACKOFF_MAX_MS, Math.max(LIVE_BASE_MS, currentDelay * LIVE_BACKOFF_MULT));
    } finally {
      setTimeout(poll, currentDelay);
    }
  };
  // start polling loop
  setTimeout(poll, currentDelay);
}
