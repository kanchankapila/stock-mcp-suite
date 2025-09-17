import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { resolveTicker, findStockEntry } from '../utils/ticker.js';
import { fetchMcExtended } from '../providers/moneycontrol.js';

export const router = Router();

router.get('/extended/:symbol', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  if (!input) return res.status(400).json({ ok:false, error:'symbol_required' });
  const base = input.includes('.') ? input.split('.')[0] : input;
  let mcid = '';
  try { mcid = resolveTicker(base, 'mc'); } catch {}
  if (!mcid) {
    const entry = findStockEntry(base);
    mcid = (entry as any)?.mcsymbol || '';
  }
  if (!mcid) return res.status(404).json({ ok:false, error:'mcsymbol_not_found' });
  const full = String(req.query.full || '').toLowerCase() === 'true';
  try {
    const extended = await fetchMcExtended(mcid);
    if (!extended) return res.status(502).json({ ok:false, error:'mc_extended_fetch_failed' });
    if (!full) {
      const { seasonality, indicesList } = extended;
      return res.json({ ok:true, data: { scId: mcid, seasonality, indicesList }, meta: { full:false } });
    }
    res.json({ ok:true, data: extended, meta: { full:true } });
  } catch (err:any) {
    res.status(500).json({ ok:false, error:'mc_extended_internal', message: err?.message||String(err) });
  }
}));
