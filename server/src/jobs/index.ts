import type express from 'express';
import { listWatchlistSymbols, listPortfolioEntries, pruneProviderData } from '../db.js';

type JobInfo = { name: string; schedule?: string; lastRun?: string; enabled: boolean };
const jobs: JobInfo[] = [
  { name: 'ingest:prices', schedule: process.env.CRON_PRICES || '0 */2 * * *', enabled: false },
  { name: 'ingest:news', schedule: process.env.CRON_NEWS || '15 */2 * * *', enabled: false },
  { name: 'ingest:tl', schedule: process.env.CRON_TRENDLYNE || '30 */4 * * *', enabled: false },
  { name: 'rag:reindex', schedule: process.env.CRON_RAG || '0 */6 * * *', enabled: false },
  { name: 'top-picks:snapshot', schedule: '5 18 * * *', enabled: false },
  { name: 'yahoo_full:refresh', schedule: process.env.CRON_YAHOO_FULL || '0 */4 * * *', enabled: false },
];

export function startJobs(_app: express.Express) {
  const ENABLE_JOBS = String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true';
  if (!ENABLE_JOBS) return { enabled:false, jobs };
  // Placeholder in-process tickers; replace with BullMQ+Redis if available.
  const intervals: any[] = [];
  function mark(name: string) { const j = jobs.find(x=>x.name===name); if (j) { j.lastRun = new Date().toISOString(); j.enabled = true; } }

  async function runYahooFullRefresh() {
    const jobName = 'yahoo_full:refresh';
    const port = Number(process.env.PORT || 3000);
    const base = `http://localhost:${port}`;
    try {
      const keep = Number(process.env.YAHOO_REFRESH_KEEP || 5);
      const maxAgeDays = Number(process.env.YAHOO_REFRESH_MAX_AGE_DAYS || 14);
      const wl = listWatchlistSymbols().map(r=>r.symbol.toUpperCase());
      const pf = listPortfolioEntries().map(r=>r.symbol.toUpperCase());
      const symbols = Array.from(new Set([...wl, ...pf])).slice(0, 200); // safety cap
      if (!symbols.length) { mark(jobName); return; }
      const delay = (ms:number)=> new Promise(r=>setTimeout(r, ms));
      const concurrency = Math.max(1, Math.min(5, Number(process.env.YAHOO_REFRESH_CONCURRENCY || 2)));
      let idx = 0; let active = 0; let done = 0;
      await new Promise<void>((resolve)=>{
        const launch = () => {
          while (active < concurrency && idx < symbols.length) {
            const sym = symbols[idx++]; active++;
            fetch(`${base}/stocks/${sym}/yahoo-full`).catch(()=>null).finally(()=>{ active--; done++; if (idx >= symbols.length && active===0) resolve(); else launch(); });
          }
        }; launch();
      });
      pruneProviderData('yahoo_full', { keepPerSymbol: keep, maxAgeDays });
    } catch (err) {
      // swallow errors to avoid crashing job loop
    } finally { mark(jobName); }
  }

  intervals.push(setInterval(()=> mark('ingest:prices'), 2*60*60*1000));
  intervals.push(setInterval(()=> mark('ingest:news'), 2*60*60*1000 + 15*60*1000));
  intervals.push(setInterval(()=> mark('ingest:tl'), 4*60*60*1000 + 30*60*1000));
  intervals.push(setInterval(()=> mark('rag:reindex'), 6*60*60*1000));
  // daily snapshot approx
  intervals.push(setInterval(()=> mark('top-picks:snapshot'), 24*60*60*1000));
  // Yahoo full refresh scheduled via interval minutes (default 240m)
  const yMinutes = Math.max(15, Number(process.env.YAHOO_REFRESH_INTERVAL_MIN || 240));
  intervals.push(setInterval(()=> { runYahooFullRefresh(); }, yMinutes * 60 * 1000));
  // kick initial run if env wants
  if (String(process.env.YAHOO_REFRESH_ON_START || 'true').toLowerCase() === 'true') {
    runYahooFullRefresh();
  }
  jobs.forEach(j => j.enabled = true);
  return { enabled:true, jobs, stop: () => intervals.forEach(clearInterval) };
}

export function jobsStatus() { return { enabled: String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true', jobs }; }

