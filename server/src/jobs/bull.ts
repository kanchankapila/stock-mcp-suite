import { logger } from '../utils/logger.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker } from '../utils/ticker.js';
import { insertPriceRow, insertNewsRow, upsertStock, upsertMcTech, listNewsSince, upsertFeaturesRow } from '../db.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { indexDocs } from '../rag/indexer.js';
import { latestPrice } from '../db.js';
import { refreshTrendlyneCookieHeadless } from '../providers/trendlyneHeadless.js';
import { tlSmaChart, tlAdvTechnical } from '../providers/trendlyne.js';
import { upsertTlCache } from '../db.js';
import crypto from 'crypto';

type Bull = typeof import('bullmq');

export type BullJobRefs = {
  queues: Record<string, any>;
  workers: Record<string, any>;
  schedulers: Record<string, any>;
};

let refs: BullJobRefs | null = null;

export async function startBullJobs(): Promise<{ enabled: boolean; note?: string }> {
  const ENABLE_JOBS = String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true';
  const REDIS_URL = String(process.env.REDIS_URL || '').trim();
  if (!ENABLE_JOBS) return { enabled:false, note:'ENABLE_JOBS=false' };
  if (!REDIS_URL) return { enabled:false, note:'REDIS_URL missing' };

  try {
    const bull: Bull = await import('bullmq');
    const connection = { connection: { url: REDIS_URL } } as any;
    const queues: Record<string, any> = {
      prices: new bull.Queue('ingest:prices', connection),
      news: new bull.Queue('ingest:news', connection),
      tl: new bull.Queue('ingest:tl', connection),
      rag: new bull.Queue('rag:reindex', connection),
      top: new bull.Queue('top-picks:snapshot', connection),
    };
    const schedulers: Record<string, any> = {};
    const BATCH = Math.max(1, Number(process.env.JOB_BATCH || 20));
    const metrics: Record<string, { runs: number; lastMs: number; avgMs: number }> = {};
    function tickMetric(name: string, ms: number) {
      const m = metrics[name] || { runs: 0, lastMs: 0, avgMs: 0 };
      m.runs += 1; m.lastMs = ms; m.avgMs = m.avgMs ? (m.avgMs * 0.9 + ms * 0.1) : ms;
      metrics[name] = m;
    }
    // expose metrics
    (globalThis as any).__bullMetrics = metrics;
    async function eachSymbol(fn: (sym: string) => Promise<void>) {
      const list = loadStocklist();
      const symbols = list.map(e => String(e.symbol || '').toUpperCase()).filter(Boolean);
      const slice = symbols.slice(0, BATCH);
      for (const s of slice) { try { await fn(s); } catch (err) { logger.warn({ err, s }, 'job_symbol_failed'); } }
    }
    const workers: Record<string, any> = {
      prices: new bull.Worker('ingest:prices', async (job: any) => {
        const t0 = Date.now();
        const listSymbols: string[] = Array.isArray(job?.data?.symbols) ? job.data.symbols : [];
        const iter = listSymbols.length ? listSymbols : undefined;
        const run = async (s: string) => {
          const yahoo = String(s).toUpperCase();
          // choose smaller range if we already have recent data
          let range = '1mo';
          try {
            const lp = latestPrice(yahoo);
            if (!lp) range = '1y';
            else {
              const d = new Date(lp.date);
              const ageDays = Math.floor((Date.now() - d.getTime()) / (24*60*60*1000));
              range = ageDays > 40 ? '6mo' : '1mo';
            }
          } catch {}
          // Fetch daily history via Stooq (Yahoo removed)
          const rows = await (await import('../providers/stooq.js')).fetchStooqDaily(yahoo);
          rows.forEach(r => insertPriceRow(r));
          upsertStock(yahoo, s);
        };
        if (iter) { for (const s of iter) { try { await run(s); } catch (e) { logger.warn({ e, s }, 'ingest_prices_symbol_failed'); } } }
        else { await eachSymbol(run); }
        tickMetric('ingest:prices', Date.now() - t0);
      }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_PRICES || 2) }),
      news: new bull.Worker('ingest:news', async (job: any) => {
        const t0 = Date.now();
        const listSymbols: string[] = Array.isArray(job?.data?.symbols) ? job.data.symbols : [];
        const iter = listSymbols.length ? listSymbols : undefined;
        const run = async (s: string) => {
          const query = resolveTicker(s, 'news');
          const NA = process.env.NEWS_API_KEY;
          const json = await fetchNews(query, NA);
          const news = parseNews(String(s).toUpperCase(), json);
          for (const n of news) {
            const sent = sentimentScore([`${n.title}. ${n.summary}`]);
            // dedupe: ensure id present, else hash fallback
            let nid = n.id;
            if (!nid) {
              const h = crypto.createHash('sha1');
              h.update(`${n.symbol}:${n.date}:${n.title}`);
              nid = `hash:${h.digest('hex')}`;
            }
            insertNewsRow({ id: nid, symbol: n.symbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: sent });
          }
        };
        if (iter) { for (const s of iter) { try { await run(s); } catch (e) { logger.warn({ e, s }, 'ingest_news_symbol_failed'); } } }
        else { await eachSymbol(run); }
        tickMetric('ingest:news', Date.now() - t0);
      }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_NEWS || 2) }),
      tl: new bull.Worker('ingest:tl', async (job: any) => {
        const t0 = Date.now();
        // Opportunistic TL cookie refresh if creds provided
        if (process.env.TRENDLYNE_EMAIL && process.env.TRENDLYNE_PASSWORD) {
          try { await refreshTrendlyneCookieHeadless(); } catch (err) { logger.warn({ err }, 'tl_cookie_refresh_failed'); }
        }
        const listSymbols: string[] = Array.isArray(job?.data?.symbols) ? job.data.symbols : [];
        const iter = listSymbols.length ? listSymbols : undefined;
        const run = async (s: string) => {
          const mcs = resolveTicker(s, 'mc');
          try {
            const tech = await fetchMcTech(mcs, 'D');
            upsertMcTech(resolveTicker(s, 'yahoo'), 'D', tech);
          } catch {}
          try { await fetchMcInsights(mcs, 'c'); } catch {}
          // Trendlyne specific cache: SMA + Advanced Tech
          try {
            const tlid = resolveTicker(s, 'trendlyne');
            if (tlid) {
              try { const sma = await tlSmaChart(tlid); upsertTlCache(tlid, 'sma', sma); } catch (err) { logger.warn({ err, tlid }, 'tl_sma_fetch_failed'); }
              try { const adv = await tlAdvTechnical(tlid, 24); upsertTlCache(tlid, 'adv', adv); } catch (err) { logger.warn({ err, tlid }, 'tl_adv_fetch_failed'); }
            }
          } catch {}
        };
        if (iter) { for (const s of iter) { try { await run(s); } catch (e) { logger.warn({ e, s }, 'ingest_tl_symbol_failed'); } } }
        else { await eachSymbol(run); }
        tickMetric('ingest:tl', Date.now() - t0);
      }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_TL || 1) }),
      rag: new bull.Worker('rag:reindex', async (job: any) => {
        const t0 = Date.now();
        const days = Math.max(1, Number(process.env.RAG_REINDEX_DAYS || 30));
        const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();
        const listSymbols: string[] = Array.isArray(job?.data?.symbols) ? job.data.symbols : [];
        const iter = listSymbols.length ? listSymbols : undefined;
        const run = async (s: string) => {
          const sym = String(s).toUpperCase();
          const items = listNewsSince(sym, cutoff) as Array<{id:string,date:string,title:string,summary:string,url:string}>;
          try { indexDocs(sym, items); } catch {}
        };
        if (iter) { for (const s of iter) { try { await run(s); } catch (e) { logger.warn({ e, s }, 'rag_symbol_failed'); } } }
        else { await eachSymbol(run); }
        tickMetric('rag:reindex', Date.now() - t0);
      }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_RAG || 1) }),
      top: new bull.Worker('top-picks:snapshot', async () => {
        const t0 = Date.now();
        try {
          const base = process.env.SELF_BASE_URL || 'http://localhost:4010';
          await fetch(`${base}/api/top-picks/snapshot`, { method:'POST' });
        } catch (err) { logger.warn({ err }, 'top_picks_snapshot_failed'); }
        tickMetric('top-picks:snapshot', Date.now() - t0);
      }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_TOP || 1) }),
    };

    const CRON_PRICES = process.env.CRON_PRICES || '0 */2 * * *';
    const CRON_NEWS = process.env.CRON_NEWS || '15 */2 * * *';
    const CRON_TRENDLYNE = process.env.CRON_TRENDLYNE || '30 */4 * * *';
    const CRON_RAG = process.env.CRON_RAG || '0 */6 * * *';

    const attempts = Number(process.env.JOB_ATTEMPTS || 2);
    const backoff = Number(process.env.JOB_BACKOFF_MS || 500);
    const jobOpts = { attempts, backoff: { type: 'exponential', delay: backoff }, removeOnComplete: true, removeOnFail: true } as any;
    await queues.prices.add('tick', {}, { repeat: { cron: CRON_PRICES }, ...jobOpts });
    await queues.news.add('tick', {}, { repeat: { cron: CRON_NEWS }, ...jobOpts });
    await queues.tl.add('tick', {}, { repeat: { cron: CRON_TRENDLYNE }, ...jobOpts });
    await queues.rag.add('tick', {}, { repeat: { cron: CRON_RAG }, ...jobOpts });
    await queues.top.add('tick', {}, { repeat: { cron: '5 18 * * *' }, ...jobOpts });

    // Nightly feature build
    const featuresQ = new bull.Queue('features:build', connection);
    function sma(arr: number[], n: number) { const out:number[]=[]; let s=0; const q:number[]=[]; for (const v of arr){ q.push(v); s+=v; if(q.length>n) s-=q.shift() as number; out.push(s/Math.min(q.length,n)); } return out; }
    function ema(arr: number[], n: number) { const out:number[]=[]; const k=2/(n+1); let e: number|null=null; for (const v of arr){ e = e===null? v : (v - e)*k + e; out.push(e); } return out; }
    function rsi(arr: number[], n=14) {
      let prev: number|undefined; const gains:number[]=[]; const losses:number[]=[]; const out:number[]=[];
      for (const v of arr){ if(prev===undefined){ gains.push(0); losses.push(0);}else{ const ch=v-prev; gains.push(Math.max(0,ch)); losses.push(Math.max(0,-ch)); } prev=v; if(gains.length<n){ out.push(50); } else { const ag=gains.slice(-n).reduce((a,b)=>a+b,0)/n; const al=losses.slice(-n).reduce((a,b)=>a+b,0)/n; const rs = al===0? 0 : ag/al; out.push(100 - (100/(1+rs))); } } return out;
    }
      const featuresW = new bull.Worker('features:build', async (job: any) => {
        const list = loadStocklist();
        let symbols = list.map(e => String(e.symbol || '').toUpperCase()).filter(Boolean).slice(0, BATCH);
        const listSymbols: string[] = Array.isArray(job?.data?.symbols) ? job.data.symbols : [];
        if (listSymbols.length) symbols = listSymbols;
        // Compute features using DB helper
        for (const s of symbols) {
          try {
          const sym = String(s).toUpperCase();
          const { listPrices } = await import('../db.js');
          const pdata = listPrices(sym, 500) as Array<{ date:string, close:number }>;
          const closes = pdata.map(r => Number(r.close));
          if (!closes.length) continue;
          const ret1 = [0].concat(closes.slice(1).map((v,i)=> (v - closes[i]) / (closes[i] || 1)));
          const ret5 = closes.map((v,i)=> i>=5 ? (v - closes[i-5])/(closes[i-5]||1) : 0);
          const ret20 = closes.map((v,i)=> i>=20 ? (v - closes[i-20])/(closes[i-20]||1) : 0);
          const sma20 = sma(closes, 20);
          const ema50 = ema(closes, 50);
          const rsi14 = rsi(closes, 14);
          const mom20 = closes.map((v,i)=> i>=20 ? (v - closes[i-20])/(closes[i-20]||1) : 0);
          // Volatility: stdev of ret1 over past 20
          for (let i=0;i<closes.length;i++) {
            const date = String(pdata[i].date).slice(0,10);
            const r1 = ret1[i] || 0, r5 = ret5[i] || 0, r20 = ret20[i] || 0, s20 = sma20[i] || null, e50 = ema50[i] || null, rsiV = rsi14[i] || null, m20 = mom20[i] || 0;
            const win = ret1.slice(Math.max(0, i-19), i+1); const mean = win.reduce((a,b)=>a+b,0) / Math.max(1, win.length); const variance = win.reduce((a,b)=> a + Math.pow(b-mean,2), 0) / Math.max(1, win.length);
            const vol = Math.sqrt(variance);
            upsertFeaturesRow({ symbol: sym, date, ret1: r1, ret5: r5, ret20: r20, sma20: s20, ema50: e50, rsi: rsiV, momentum: m20, vol });
          }
        } catch (err) { logger.warn({ err, s }, 'features_build_failed'); }
      }
    }, { ...connection, concurrency: Number(process.env.JOB_CONCURRENCY_FEATURES || 1) });
    await featuresQ.add('tick', {}, { repeat: { cron: process.env.CRON_FEATURES || '0 2 * * *' }, ...jobOpts });

    refs = { queues: { ...queues, features: featuresQ }, workers: { ...workers, features: featuresW }, schedulers };
    // also attach metrics
    (refs as any).metrics = metrics;
    logger.info('bull_jobs_started');
    return { enabled:true };
  } catch (err) {
    logger.warn({ err }, 'bull_jobs_start_failed');
    return { enabled:false, note: 'bullmq not available' };
  }
}

export function bullStatus() {
  const ENABLE_JOBS = String(process.env.ENABLE_JOBS ?? 'false').toLowerCase() === 'true';
  return { enabled: ENABLE_JOBS, active: !!refs, queues: refs ? Object.keys(refs.queues) : [] };
}

export async function enqueueJob(queueName: 'ingest:prices'|'ingest:news'|'ingest:tl'|'rag:reindex'|'top-picks:snapshot'|'features:build', data: any = {}) {
  if (!refs) throw new Error('jobs_not_initialized');
  const q = refs.queues?.[queueName];
  if (!q) throw new Error(`queue_not_found:${queueName}`);
  return q.add('once', data, { removeOnComplete: true, removeOnFail: true });
}
