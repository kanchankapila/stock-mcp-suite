import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { SOURCES, allowedHost } from '../config/sources.js';
import { resolveTicker } from '../utils/ticker.js';
import { fetchJson } from '../utils/http.js';

export const router = Router();

router.get('/sources/list', asyncHandler(async (_req, res) => {
  // Expose only safe metadata; do not expose full URL templates if you prefer
  const list = SOURCES.map(s => ({ name: s.name, label: s.label, page: s.page, cardId: s.cardId, tickerProvider: s.tickerProvider }));
  res.json({ ok: true, data: list });
}));

router.get('/sources/fetch', asyncHandler(async (req, res) => {
  const name = String(req.query.name || '').trim();
  const input = String(req.query.symbol || '').toUpperCase();
  if (!name || !input) return res.status(400).json({ ok:false, error:'name and symbol required' });
  const src = SOURCES.find(s => s.name === name);
  if (!src) return res.status(404).json({ ok:false, error:'source_not_found' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  const ticker = resolveTicker(base, src.tickerProvider);
  const urlStr = src.urlTemplate.replace('{symbol}', encodeURIComponent(ticker));
  const url = new URL(urlStr);
  if (!allowedHost(url)) return res.status(400).json({ ok:false, error:'host_not_allowed' });
  const json = await fetchJson(url.toString(), { timeoutMs: 8_000, retries: 1, retryDelayMs: 250 });
  res.json({ ok:true, data: json });
}));

