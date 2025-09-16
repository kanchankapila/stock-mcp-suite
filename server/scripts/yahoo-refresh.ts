import 'dotenv/config';
import fetch from 'node-fetch';
import { listWatchlistSymbols, listPortfolioEntries, pruneProviderData } from '../src/db.js';

async function main() {
  const port = Number(process.env.PORT || 3000);
  const base = `http://localhost:${port}`;
  const keep = Number(process.env.YAHOO_REFRESH_KEEP || 5);
  const maxAgeDays = Number(process.env.YAHOO_REFRESH_MAX_AGE_DAYS || 14);
  const concurrency = Math.max(1, Math.min(10, Number(process.env.YAHOO_REFRESH_CONCURRENCY || 4)));
  const only = (process.argv.slice(2).find(a=>/^--symbols=/.test(a))||'').split('=')[1];
  let symbols: string[];
  if (only) {
    symbols = only.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  } else {
    const wl = listWatchlistSymbols().map(r=>r.symbol.toUpperCase());
    const pf = listPortfolioEntries().map(r=>r.symbol.toUpperCase());
    symbols = Array.from(new Set([...wl, ...pf]));
  }
  if (!symbols.length) { console.log('No symbols to refresh'); return; }
  console.log(`Refreshing Yahoo full data for ${symbols.length} symbols ...`);
  let idx=0, active=0, ok=0, fail=0; const started = Date.now();
  await new Promise<void>(resolve => {
    const launch = () => {
      while (active < concurrency && idx < symbols.length) {
        const sym = symbols[idx++]; active++;
        fetch(`${base}/stocks/${sym}/yahoo-full`).then(r=>{ if (r.ok) ok++; else fail++; }).catch(()=> fail++).finally(()=> { active--; if (idx>=symbols.length && active===0) resolve(); else launch(); });
      }
    }; launch();
  });
  const dur = ((Date.now()-started)/1000).toFixed(1);
  console.log(`Fetch complete ok=${ok} fail=${fail} duration=${dur}s`);
  const pr = pruneProviderData('yahoo_full', { keepPerSymbol: keep, maxAgeDays });
  console.log(`Pruned provider_data deleted=${pr.deleted}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
