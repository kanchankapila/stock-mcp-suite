import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import zlib from 'zlib';

type Client = { ws: WebSocket; subs: Set<string> };

// Upstream Yahoo streamer singleton connection
let upstream: WebSocket | null = null;
let upstreamReady = false;
let upstreamConnecting = false;
const upstreamSubs = new Set<string>();
let upstreamReconnectAttempts = 0;

// Local subscription registry symbol -> Set<Client>
const symbolClients = new Map<string, Set<Client>>();
// Synthetic fallback prices
const syntheticPrices = new Map<string, number>();
let syntheticTimer: NodeJS.Timeout | null = null;

function ensureSyntheticLoop() {
  if (syntheticTimer) return;
  syntheticTimer = setInterval(() => {
    const nowIso = new Date().toISOString();
    for (const [sym, clients] of symbolClients.entries()) {
      if (clients.size === 0) continue;
      if (upstreamReady) continue; // real feed active, skip
      let p = syntheticPrices.get(sym) ?? (100 + Math.random() * 50);
      const drift = (Math.random() - 0.5) * 0.4; // small movement
      p = Math.max(1, p + drift);
      syntheticPrices.set(sym, p);
      const msg = JSON.stringify({ type: 'quote', symbol: sym, price: Number(p.toFixed(2)), time: nowIso, source: 'synthetic' });
      for (const c of clients) safeSend(c.ws, msg);
    }
  }, 3000);
}

function connectUpstream() {
  if (upstreamReady || upstreamConnecting) return;
  upstreamConnecting = true;
  const url = 'wss://streamer.finance.yahoo.com';
  logger.info({ url }, 'yahoo_ws_connecting');
  upstream = new WebSocket(url, { perMessageDeflate: false });
  const onOpen = () => {
    upstreamReady = true; upstreamConnecting = false; upstreamReconnectAttempts = 0;
    logger.info('yahoo_ws_connected');
    // Resubscribe all symbols
    if (upstreamSubs.size) sendUpstreamSubscribe(Array.from(upstreamSubs));
  };
  const onClose = (code: number, reason: Buffer) => {
    logger.warn({ code, reason: reason.toString() }, 'yahoo_ws_closed');
    upstreamReady = false; upstreamConnecting = false; upstream = null;
    scheduleReconnect();
  };
  const onError = (err: any) => {
    logger.error({ err }, 'yahoo_ws_error');
  };
  const onMessage = (data: WebSocket.RawData) => {
    // Yahoo frames are deflate (raw) compressed JSON lines
    let txt: string | null = null;
    if (Buffer.isBuffer(data)) {
      try { txt = zlib.inflateRawSync(data).toString('utf8'); } catch { /* ignore */ }
    } else if (typeof data === 'string') {
      txt = data;
    }
    if (!txt) return;
    const lines = txt.split('\n').filter(l => l.trim().length);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Typical shape: { id:"AAPL", price: 190.12, time: 1726372812, ... }
        if (obj && obj.id && (obj.price != null)) {
          const sym = String(obj.id).toUpperCase();
            const priceNum = Number(obj.price);
          if (!Number.isFinite(priceNum)) continue;
          const iso = obj.time ? new Date(Number(obj.time) * 1000).toISOString() : new Date().toISOString();
          const payload = JSON.stringify({ type: 'quote', symbol: sym, price: priceNum, time: iso, source: 'yahoo' });
          const clients = symbolClients.get(sym);
          if (clients) {
            for (const c of clients) safeSend(c.ws, payload);
          }
        }
      } catch {/* ignore parse errors */}
    }
  };
  upstream.on('open', onOpen);
  upstream.on('close', onClose);
  upstream.on('error', onError);
  upstream.on('message', onMessage);
}

function scheduleReconnect() {
  if (upstreamReady) return;
  upstreamReconnectAttempts += 1;
  const delay = Math.min(30_000, 1000 * Math.pow(2, upstreamReconnectAttempts));
  logger.info({ delay }, 'yahoo_ws_reconnect_scheduled');
  setTimeout(() => connectUpstream(), delay);
}

function sendUpstreamSubscribe(symbols: string[]) {
  if (!upstream || !upstreamReady) return;
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (!unique.length) return;
  try { upstream.send(JSON.stringify({ subscribe: unique })); } catch (err) { logger.warn({ err }, 'yahoo_ws_subscribe_failed'); }
}

function safeSend(ws: WebSocket, msg: string) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(msg); } catch {}
  }
}

export function attachLive(server: HttpServer) {
  const ENABLE = String(process.env.LIVE_WS ?? 'true').toLowerCase() !== 'false';
  if (!ENABLE) {
    logger.warn('live_ws_disabled_env');
    return;
  }
  const wss = new WebSocketServer({ server, path: '/ws' });
  logger.info('live_ws_server_initialized');

  ensureSyntheticLoop();

  wss.on('connection', (ws) => {
    const client: Client = { ws, subs: new Set<string>() };
    logger.info('ws_client_connected');
    safeSend(ws, JSON.stringify({ type: 'info', message: 'Connected', upstream: upstreamReady ? 'yahoo' : 'synthetic' }));

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg?.type === 'subscribe' && msg.symbol) {
        const sym = String(msg.symbol).toUpperCase().replace(/[^A-Z0-9_.-]/g,'');
        if (!sym) return;
        if (!client.subs.has(sym)) {
          client.subs.add(sym);
          if (!symbolClients.has(sym)) symbolClients.set(sym, new Set());
          symbolClients.get(sym)!.add(client);
          safeSend(ws, JSON.stringify({ type: 'subscribed', symbol: sym }));
          // Upstream subscribe if first time globally
          if (!upstreamSubs.has(sym)) {
            upstreamSubs.add(sym);
            connectUpstream();
            if (upstreamReady) sendUpstreamSubscribe([sym]);
          }
        }
      } else if (msg?.type === 'unsubscribe' && msg.symbol) {
        const sym = String(msg.symbol).toUpperCase();
        if (client.subs.delete(sym)) {
          const set = symbolClients.get(sym);
          set?.delete(client);
          safeSend(ws, JSON.stringify({ type: 'unsubscribed', symbol: sym }));
          // We keep upstream subscription (simple; avoids churn). Could implement unsubscribe.
        }
      }
    });

    ws.on('close', () => {
      logger.info('ws_client_disconnected');
      // Remove client from all symbol sets
      for (const sym of client.subs) {
        const set = symbolClients.get(sym);
        set?.delete(client);
        if (set && set.size === 0) {
          symbolClients.delete(sym);
          // Keep upstream subscription (idempotent). Could: upstreamSubs.delete(sym)
        }
      }
      client.subs.clear();
    });
  });
}
