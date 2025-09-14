import type { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';

type Client = { ws: import('ws').WebSocket, subs: Set<string> };

export function attachLive(server: HttpServer) {
  // Live WebSocket quotes disabled (Yahoo provider removed)
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    logger.info('ws_client_connected');
    ws.send(JSON.stringify({ type: 'info', message: 'Live quotes disabled' }));
    ws.on('close', () => logger.info('ws_client_disconnected'));
  });
}
