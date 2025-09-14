import type express from 'express';

type JobInfo = { name: string; schedule?: string; lastRun?: string; enabled: boolean };
const jobs: JobInfo[] = [
  { name: 'ingest:prices', schedule: process.env.CRON_PRICES || '0 */2 * * *', enabled: false },
  { name: 'ingest:news', schedule: process.env.CRON_NEWS || '15 */2 * * *', enabled: false },
  { name: 'ingest:tl', schedule: process.env.CRON_TRENDLYNE || '30 */4 * * *', enabled: false },
  { name: 'rag:reindex', schedule: process.env.CRON_RAG || '0 */6 * * *', enabled: false },
  { name: 'top-picks:snapshot', schedule: '5 18 * * *', enabled: false },
];

export function startJobs(_app: express.Express) {
  const ENABLE_JOBS = String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true';
  if (!ENABLE_JOBS) return { enabled:false, jobs };
  // Placeholder in-process tickers; replace with BullMQ+Redis if available.
  const intervals: any[] = [];
  function mark(name: string) { const j = jobs.find(x=>x.name===name); if (j) { j.lastRun = new Date().toISOString(); j.enabled = true; } }
  intervals.push(setInterval(()=> mark('ingest:prices'), 2*60*60*1000));
  intervals.push(setInterval(()=> mark('ingest:news'), 2*60*60*1000 + 15*60*1000));
  intervals.push(setInterval(()=> mark('ingest:tl'), 4*60*60*1000 + 30*60*1000));
  intervals.push(setInterval(()=> mark('rag:reindex'), 6*60*60*1000));
  // daily snapshot approx
  intervals.push(setInterval(()=> mark('top-picks:snapshot'), 24*60*60*1000));
  jobs.forEach(j => j.enabled = true);
  return { enabled:true, jobs, stop: () => intervals.forEach(clearInterval) };
}

export function jobsStatus() { return { enabled: String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true', jobs }; }

