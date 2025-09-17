import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { resolveTicker, findStockEntry } from '../utils/ticker.js';
import { listProviderData, insertProviderData } from '../db.js';
import { fetchMcExtended } from '../providers/moneycontrol.js';

export const router = Router();

// List available stocks (symbol, name, mcsymbol)
router.get('/stocks', asyncHandler(async (_req, res) => {
  try {
    const listMod: any = await import('../../stocklist.js');
    const raw = (listMod.default && listMod.default.Data) ? listMod.default.Data : (listMod.Data || []);
    const data = (raw || []).map((e:any)=> ({ symbol: e.symbol, name: e.name, mcsymbol: e.mcsymbol || e.mcsymbol || e.symbol }));
    res.json({ ok: true, count: data.length, data });
  } catch (err:any) { res.status(500).json({ ok:false, error:'stocklist_load_failed' }); }
}));

// Get extended bundle for a symbol (symbol param -> resolve to mcsymbol)
router.get('/:symbol/extended', asyncHandler(async (req, res) => {
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
  const force = String(req.query.refresh || req.query.force || '').toLowerCase() === 'true';
  let extended: any = null; let fromCache = false;
  try {
    if (!force) {
      const rows = listProviderData(base, 'moneycontrol', 3) || [];
      for (const r of rows) {
        const ext = r.payload?.extended; if (ext && ext.scId) { extended = ext; fromCache = true; break; }
      }
    }
    if (!extended) {
      extended = await fetchMcExtended(mcid);
      if (extended) {
        try { insertProviderData({ provider_id:'moneycontrol', symbol: base, captured_at: new Date().toISOString(), payload:{ extended } }); } catch {}
      }
    }
    if (!extended) return res.status(502).json({ ok:false, error:'mc_extended_fetch_failed' });
    res.json({ ok:true, data: extended, meta: { symbol: base, mcid, fromCache } });
  } catch (err:any) {
    res.status(500).json({ ok:false, error:'mc_extended_internal', message: err?.message||String(err) });
  }
}));
