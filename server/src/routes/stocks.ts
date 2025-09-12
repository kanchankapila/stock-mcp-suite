import { Router } from 'express';
import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews, saveAnalysis, getMcTech, upsertMcTech, upsertYahooCache, getLatestOptionsBias, listOptionsMetrics } from '../db.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../providers/alphaVantage.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { fetchYahooDaily, parseYahooDaily, fetchYahooQuoteSummary, fetchYahooQuote, YahooInterval } from '../providers/yahoo.js';
import { fetchYahooFin } from '../providers/yahooFin.js';
import { fetchStooqDaily } from '../providers/stooq.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';
import { backtestSMA, scoreStrategy } from '../analytics/backtest.js';
import { indexDocs } from '../rag/indexer.js';
import { indexNamespace } from '../rag/langchain.js';
import { retrieve } from '../rag/retriever.js';
import { agentAnswer, agentAnswerStream } from '../agent/agent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker, findStockEntry, listTickerProvidersFromEnv, getProviderResolutionConfig } from '../utils/ticker.js';
import { spawn } from 'child_process';
import { searchStocks, stockIndexStats } from '../utils/stockIndex.js';

export const router = Router();

router.post('/ingest/:symbol', asyncHandler(async (req, res) => {
  try {
    const input = String(req.params.symbol || '').toUpperCase();
    const { name } = req.body || {};
    const NA = process.env.NEWS_API_KEY;

    // Provider-specific identifiers
    const yahooSymbol = resolveTicker(input, 'yahoo');
    const newsQuery = resolveTicker(input, 'news');

    logger.info({ input, yahooSymbol, newsQuery }, 'ingest_start');
    const messages: string[] = [];
    if (!NA) messages.push('NewsAPI: using sample data (no API key set).');
    // Fetch prices from Yahoo by default
    let rows;
    try {
      const chart = await fetchYahooDaily(yahooSymbol, '1y', '1d');
      rows = parseYahooDaily(yahooSymbol, chart);
    } catch (err) {
      logger.warn({ err, symbol: yahooSymbol }, 'yahoo_daily_failed_ingest');
      if (String(process.env.INGEST_USE_STOOQ_FALLBACK || 'true') === 'true') {
        try {
          rows = await fetchStooqDaily(yahooSymbol);
        } catch (e2) {
          logger.error({ err: e2, symbol: yahooSymbol }, 'stooq_fallback_failed_ingest');
          const e: any = new Error(String((err as any)?.message || err));
          e.status = 502;
          throw e; // end ingest with explicit status
        }
      } else {
        const e: any = new Error(String((err as any)?.message || err));
        e.status = 502;
        throw e;
      }
    }
    if (!rows.length) {
      const err: any = new Error('No price data returned from Yahoo.');
      err.status = 502;
      throw err;
    }
    rows.forEach(r => insertPriceRow(r));

    let news: Array<{id:string,date:string,title:string,summary:string,url:string}> = [];
    try {
      const newsJson = await fetchNews(newsQuery, NA);
      news = parseNews(yahooSymbol, newsJson);
    } catch (e:any) {
      const msg = String(e?.message || e);
      if (/429/.test(msg)) {
        logger.warn({ symbol: yahooSymbol, err: msg }, 'news_rate_limited_ingest');
        const FALLBACK_ON_429 = String(process.env.NEWS_FALLBACK_TO_SAMPLE_ON_429 ?? 'true').toLowerCase() === 'true';
        if (FALLBACK_ON_429) {
          messages.push('NewsAPI: rate limited (429). Using sample data.');
          try {
            const sampleJson = await fetchNews(newsQuery, undefined);
            news = parseNews(yahooSymbol, sampleJson);
          } catch (e2:any) {
            logger.warn({ symbol: yahooSymbol, err: e2?.message || e2 }, 'news_sample_fallback_failed');
            news = [];
          }
        } else {
          messages.push('NewsAPI: rate limited (429). Skipping news.');
          news = [];
        }
      } else {
        throw e;
      }
    }
    // NewsAPI may also be rate limited; allow zero news but log
    if (!news.length) {
      logger.warn({ symbol: yahooSymbol }, 'news_zero_articles');
      messages.push('NewsAPI: zero articles returned.');
    }

    // Moneycontrol insights using mcsymbol from stocklist
    const mcid = resolveTicker(input, 'mc');
    if (mcid) {
      const mc = await fetchMcInsights(mcid, 'c');
      if (mc) {
        const title = mc.shortDesc ? `MC Insights: ${mc.shortDesc}` : `MC Insights (${mc.scId})`;
        const summary = mc.longDesc ? `${mc.longDesc} (Score: ${mc.stockScore ?? 0})` : `Score: ${mc.stockScore ?? 0}`;
        const date = new Date().toISOString();
        const id = `mc:insights:${mc.scId}`;
        const sent = sentimentScore([`${title}. ${summary}`]);
        insertNewsRow({ id, symbol: yahooSymbol, date, title, summary, url: 'https://www.moneycontrol.com/', sentiment: sent });
        messages.push('Moneycontrol insights ingested.');
      }
    }

    // Yahoo_fin profile & KPIs + financials summary -> sentiment + RAG docs + options metrics
    try {
      const yfin = await fetchYahooFin(yahooSymbol, '1y', '1d').catch(()=>null);
      if (yfin && yfin.ok !== false) {
        const qt = (yfin as any).quote_table || {};
        const info = (yfin as any).info || {};
        const sector = info.sector || info.Sector || '';
        const industry = info.industry || info.Industry || '';
        const website = info.website || info.Website || '';
        const summary = info.longBusinessSummary || info.long_business_summary || '';
        const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
        const pe = qt['PE Ratio (TTM)'] || '';
        const eps = qt['EPS (TTM)'] || '';
        const kpiText = `Sector: ${sector}. Industry: ${industry}. Market Cap: ${mcap}. PE: ${pe}. EPS: ${eps}. ${summary}`.trim();
        const makeFinSummary = () => {
          try {
            // Revenue trend
            const isObj = (yfin as any)?.income_statement || {};
            const revMap = isObj?.totalRevenue || isObj?.TotalRevenue || null;
            let revSummary = '';
            if (revMap && typeof revMap === 'object') {
              const entries = Object.entries(revMap).filter(([k,_]) => /(\d{4}(-\d{2}-\d{2})?)/.test(String(k))).sort((a,b)=> String(a[0]) < String(b[0]) ? -1 : 1);
              const nums = entries.map(([,v]) => Number(v)).filter(n=> Number.isFinite(n));
              if (nums.length >= 2) {
                const first = nums[0], last = nums[nums.length-1];
                const pct = first !== 0 ? ((last-first)/Math.abs(first))*100 : 0;
                revSummary = `Revenue ${pct>=0? 'increased':'decreased'} ${Math.abs(pct).toFixed(1)}% over ${entries.length} periods.`;
              }
            }
            // Operating cash flow trend
            const cfObj = (yfin as any)?.cash_flow || {};
            const ocfMap = (cfObj?.totalCashFromOperatingActivities) || (cfObj?.TotalCashFromOperatingActivities) || null;
            let ocfSummary = '';
            if (ocfMap && typeof ocfMap === 'object') {
              const entries = Object.entries(ocfMap).filter(([k,_]) => /(\d{4}(-\d{2}-\d{2})?)/.test(String(k))).sort((a,b)=> String(a[0]) < String(b[0]) ? -1 : 1);
              const nums = entries.map(([,v]) => Number(v)).filter(n=> Number.isFinite(n));
              if (nums.length >= 2) {
                const first = nums[0], last = nums[nums.length-1];
                const pct = first !== 0 ? ((last-first)/Math.abs(first))*100 : 0;
                ocfSummary = `Operating cash flow ${pct>=0? 'increased':'decreased'} ${Math.abs(pct).toFixed(1)}% over ${entries.length} periods.`;
              }
            }
            // Margins from stats
            let marginsSummary = '';
            try {
              const statsArr: Array<any> = Array.isArray((yfin as any)?.stats) ? (yfin as any).stats : [];
              const findAttr = (name: string) => {
                const row = (statsArr || []).find((r: any) => new RegExp(name, 'i').test(String(r?.Attribute || r?.attribute || '')));
                return row ? (row?.Value ?? row?.value ?? '') : '';
              };
              const pm = String(findAttr('Profit Margin'));
              const om = String(findAttr('Operating Margin')) || String(findAttr('Operating Margin (ttm)'));
              const pmNum = (()=>{ const m = pm.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; })();
              const omNum = (()=>{ const m = om.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; })();
              const parts = [] as string[];
              if (Number.isFinite(pmNum)) parts.push(`Profit margin ${pmNum.toFixed(1)}%`);
              if (Number.isFinite(omNum)) parts.push(`Operating margin ${omNum.toFixed(1)}%`);
              if (parts.length) marginsSummary = parts.join(', ') + '.';
            } catch {}
            return [revSummary, ocfSummary, marginsSummary].filter(Boolean).join(' ');
          } catch { return ''; }
        };
        const finText = makeFinSummary();
        const date = new Date().toISOString();
        const texts: Array<{ text: string; metadata: any }> = [];
        if (kpiText) {
          const sid = `yfin:profile:${yahooSymbol}`;
          const s = sentimentScore([kpiText]);
          insertNewsRow({ id: sid, symbol: yahooSymbol, date, title: 'Yahoo Profile & KPIs', summary: kpiText.slice(0, 960), url: website || 'https://finance.yahoo.com/', sentiment: s });
          texts.push({ text: kpiText, metadata: { date: date.slice(0,10), source: 'yahoo_fin', url: website || '' } });
        }
        if (finText) {
          const fid = `yfin:financials:${yahooSymbol}`;
          const s2 = sentimentScore([finText]);
          insertNewsRow({ id: fid, symbol: yahooSymbol, date, title: 'Yahoo Financials Summary', summary: finText.slice(0, 960), url: 'https://finance.yahoo.com/', sentiment: s2 });
          texts.push({ text: finText, metadata: { date: date.slice(0,10), source: 'yahoo_fin_financials', url: '' } });
        }
        if (texts.length) { try { await indexNamespace(yahooSymbol, { texts }); } catch {} }

        // Store options metrics if options present
        try {
          const opt = (yfin as any)?.options || null;
          const calls: Array<any> = Array.isArray(opt?.calls) ? opt.calls : [];
          const puts: Array<any> = Array.isArray(opt?.puts) ? opt.puts : [];
          const sum = (arr: Array<any>, key: string) => arr.reduce((a, r)=> a + (Number(r?.[key]) || 0), 0);
          const callOi = sum(calls, 'Open Interest') || sum(calls, 'openInterest') || sum(calls, 'open_interest');
          const putOi = sum(puts, 'Open Interest') || sum(puts, 'openInterest') || sum(puts, 'open_interest');
          const callVol = sum(calls, 'Volume') || sum(calls, 'volume');
          const putVol = sum(puts, 'Volume') || sum(puts, 'volume');
          let pcr: number | null = null, pvr: number | null = null, bias: number | null = null;
          if ((callOi + putOi) > 0) { pcr = putOi / Math.max(1, callOi); bias = (callOi - putOi) / (callOi + putOi); }
          if ((callVol + putVol) > 0) { pvr = putVol / Math.max(1, callVol); }
          const now = new Date().toISOString().slice(0,10);
          try { const { upsertOptionsMetrics } = await import('../db.js'); (upsertOptionsMetrics as any)({ symbol: yahooSymbol, date: now, pcr, pvr, bias }); } catch {}
        } catch {}
      }
    } catch {}

    // compute per-article sentiment and store
    for (const n of news) {
      const s = sentimentScore([`${n.title}. ${n.summary}`]);
      insertNewsRow({ id: n.id, symbol: yahooSymbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
    }

    upsertStock(yahooSymbol, name || input);

    // Index for RAG (both legacy TF-IDF and vector store)
    try { indexDocs(yahooSymbol, news); } catch {}
    try {
      const texts: Array<{ text: string; metadata: Record<string, unknown> }> = [];
      for (const n of news) {
        const text = `${(n as any).title?.trim() || ''}. ${(n as any).summary?.trim() || ''}`.trim();
        if (!text) continue;
        texts.push({ text, metadata: { date: String((n as any).date || '').slice(0,10), source: 'news', url: (n as any).url || '' } });
      }
      try {
        const row = db.prepare("SELECT id, date, title, summary FROM news WHERE symbol=? AND id LIKE 'mc:insights:%' ORDER BY date DESC LIMIT 1").get(yahooSymbol) as {id:string,date:string,title:string,summary:string}|undefined;
        if (row) {
          const t = `${row.title?.trim() || ''}. ${row.summary?.trim() || ''}`.trim();
          if (t) texts.push({ text: t, metadata: { date: String(row.date || '').slice(0,10), source: 'mc', url: '' } });
        }
      } catch {}
      if (texts.length) { await indexNamespace(yahooSymbol, { texts }); }
    } catch {}

    logger.info({ symbol: yahooSymbol, insertedPrices: rows.length, insertedNews: news.length }, 'ingest_complete');
    res.json({ ok:true, insertedPrices: rows.length, insertedNews: news.length, alphaSource: 'yahoo', priceSource: 'yahoo', newsSource: NA ? 'live' : 'sample', symbol: yahooSymbol, messages });
  } catch (err: any) {
    const msg = String(err?.message || err || 'ingest_failed');
    const status = Number(err?.status || 500);
    return res.status(status === 500 ? 400 : status).json({ ok:false, error: msg });
  }
}));

// Fuzzy search over stocklist (symbol, name, mcsymbol, isin, tlid)
router.get('/stocks/search', asyncHandler((req, res) => {
  const q = String((req.query.q || req.query.query || '')).trim();
  const limit = req.query.limit ? Number(req.query.limit) : 15;
  if (!q) return res.json({ ok: true, data: [] });
  const data = searchStocks(q, limit);
  res.json({ ok: true, data, meta: { query: q, limit } });
}));

// Diagnostics for the in-memory stock index
router.get('/stocks/search/stats', asyncHandler((_req, res) => {
  res.json({ ok: true, data: stockIndexStats() });
}));

router.get('/stocks/:symbol/overview', asyncHandler(async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 2000);
  if (!prices.length) return res.status(404).json({ ok:false, error: 'No data' });
  const last = prices[prices.length-1];
  const first = prices[0];
  const change = last.close - first.close;
  const changePct = (change/first.close)*100;
  res.json({ ok:true, data: {
    symbol,
    lastClose: last.close,
    periodChangePct: changePct,
    nPrices: prices.length
  }});
}));

router.get('/stocks/:symbol/history', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 2000);
  res.json({ ok:true, data: prices });
}));

router.get('/stocks/:symbol/news', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const news = listNews(symbol, 50);
  res.json({ ok:true, data: news });
}));

// Options metrics (PCR, PVR, bias) for a symbol
router.get('/stocks/:symbol/options-metrics', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = req.query.days ? Number(req.query.days) : 60;
  const limit = req.query.limit ? Number(req.query.limit) : 90;
  const rows = listOptionsMetrics(symbol, { days, limit });
  const latest = rows.length ? rows[rows.length - 1] : null;
  res.json({ ok: true, data: { latest, history: rows } });
}));

router.post('/stocks/:symbol/analyze', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 500);
  if (!prices.length) return res.status(404).json({ ok:false, error:'No data' });
  const news = listNews(symbol, 25);

  const sScore = sentimentScore(news.map(n=>`${n.title}. ${n.summary}`));
  const closes = prices.map(p=>p.close);
  const prediction = predictNextClose(closes, 10);
  const back = backtestSMA(prices.map(p=>({date:p.date, close:p.close})), 10, 20);
  const momentum = closes.length>2 ? (closes[closes.length-1]-closes[0])/closes[0] : 0;
  const sc = scoreStrategy(sScore, momentum);

  const created_at = new Date().toISOString();
  saveAnalysis({symbol, created_at, sentiment_score: sScore, predicted_close: prediction, strategy: back, score: sc.score, recommendation: sc.recommendation});

  res.json({ ok:true, data: {
    symbol, sentiment: sScore, predictedClose: prediction, backtest: back, score: sc.score, recommendation: sc.recommendation
  }});
}));

router.get('/rag/:symbol/search', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const q = String(req.query.q || '');
  const results = retrieve(symbol, q, 5);
  res.json({ ok:true, data: results });
}));

router.get('/agent', asyncHandler(async (req, res) => {
  const prompt = String(req.query.q || '');
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  const result = await agentAnswer(prompt, symbol);
  res.json(result);
}));

router.post('/agent/stream', asyncHandler(async (req, res) => {
  const { q, symbol } = req.body || {};
  if (!q) return res.status(400).json({ ok:false, error: 'q required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (ev: string, data: any) => { res.write(`event: ${ev}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
  await agentAnswerStream(String(q), symbol ? String(symbol) : undefined, ({type, data})=> send(type, data));
  res.end();
}));

// List available ticker providers and their resolution config
router.get('/resolve/providers', asyncHandler((_req, res) => {
  const providers = listTickerProvidersFromEnv();
  const data = providers.map(p => {
    const cfg = getProviderResolutionConfig(p);
    return { provider: p, key: cfg.key, suffix: cfg.suffix };
  });
  res.json({ ok: true, data });
}));

// Compute Top Picks across symbols using sentiment, momentum, and MC tech
router.get('/top-picks', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 60;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const lookback = Math.max(5, Number.isFinite(days) ? days : 60);
  const cutoff = new Date(Date.now() - lookback*24*60*60*1000).toISOString();

  // Collect candidate symbols from prices in window
  const rows = db.prepare(`SELECT DISTINCT symbol FROM prices WHERE date>=? ORDER BY symbol`).all(cutoff) as Array<{symbol:string}>;
  const symbols = rows.map(r => String(r.symbol || '').toUpperCase());
  if (!symbols.length) return res.json({ ok:true, data: [] });

  function safeNumber(v: any, def=0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

  const results: Array<any> = [];
  for (const s of symbols) {
    try {
      // Momentum: price change over lookback window
      const pr = db.prepare(`SELECT date, close FROM prices WHERE symbol=? AND date>=? ORDER BY date ASC`).all(s, cutoff) as Array<{date:string, close:number}>;
      if (!pr.length) continue;
      const mom = pr.length > 1 ? (safeNumber(pr[pr.length-1].close) - safeNumber(pr[0].close)) / Math.max(1e-9, safeNumber(pr[0].close)) : 0;

      // Sentiment: average over recent news
      const nsr = db.prepare(`SELECT AVG(sentiment) as avg FROM news WHERE symbol=? AND date>=?`).get(s, cutoff) as {avg:number}|undefined;
      const sent = safeNumber(nsr?.avg, 0);

      // MC Tech (D): optional features
      const techD = getMcTech(s, 'D') as any;
      let rsi = NaN, piv = NaN, mcs = NaN;
      try { rsi = safeNumber(techD?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value, NaN); } catch {}
      try { const pv = techD?.pivot_level?.pivot ?? techD?.pivots?.pivot ?? techD?.pivot ?? null; piv = safeNumber(pv, NaN); } catch {}
      try { mcs = safeNumber(techD?.score ?? techD?.stockScore, NaN); } catch {}

  // Normalize features to [-1,1]
  const momN = Math.max(-1, Math.min(1, mom));
  const sentN = Math.max(-1, Math.min(1, sent));
  const scoreN = Number.isFinite(mcs) ? Math.max(-1, Math.min(1, (mcs-50)/50)) : 0;
  // Options bias (latest)
  const ob = getLatestOptionsBias(s);
  const optBias = Number.isFinite(Number(ob)) ? Math.max(-1, Math.min(1, Number(ob))) : 0;

  // Composite score weights: momentum 0.35, sentiment 0.30, tech 0.20, options 0.15
  const composite = 0.35*momN + 0.30*sentN + 0.20*scoreN + 0.15*optBias;

      // Recommendation heuristic
      let reco = 'HOLD';
      if (composite >= 0.25) reco = 'BUY';
      else if (composite <= -0.25) reco = 'SELL';

  results.push({ symbol: s,
    momentum: mom, sentiment: sent, mcScore: Number.isFinite(mcs) ? mcs : null, rsi: Number.isFinite(rsi) ? rsi : null, pivot: Number.isFinite(piv) ? piv : null,
    optionsBias: Number.isFinite(optBias) ? optBias : null,
    score: Number(composite.toFixed(3)), recommendation: reco,
    contrib: {
      momentum: Number((0.35*momN).toFixed(3)),
      sentiment: Number((0.30*sentN).toFixed(3)),
      tech: Number((0.20*scoreN).toFixed(3)),
      options: Number((0.15*optBias).toFixed(3)),
    }
  });
    } catch {}
  }

  const top = results.sort((a,b)=> b.score - a.score).slice(0, Math.max(1, Math.min(100, Number.isFinite(limit)? limit : 10)));
  res.json({ ok:true, data: top, meta: { days: lookback, total: results.length } });
}));

// Resolve debug: show provider-specific identifiers for any input
router.get('/resolve/:input', asyncHandler((req, res) => {
  const input = String(req.params.input || '');
  const entry = findStockEntry(input);
  // Resolve across all discovered providers (from env TICKER_* and defaults)
  const providers = listTickerProvidersFromEnv();
  const resolved: Record<string, string> = {};
  for (const p of providers) {
    try {
      resolved[p] = resolveTicker(input, p);
    } catch {
      // ignore resolution errors for individual providers
    }
  }
  const yahoo = resolved['yahoo'];
  const news = resolved['news'];
  const alpha = resolved['alpha'];
  const mc = resolved['mc'];
  const trendlyne = resolved['trendlyne'];
  res.json({ ok: true, data: {
    input,
    entry: entry ? { name: entry.name, symbol: entry.symbol, mcsymbol: entry.mcsymbol, isin: entry.isin, tlid: entry.tlid } : null,
    providers,
    resolved,
    // Back-compat well-known keys
    yahoo, news, alpha, mc, trendlyne
  }});
}));

 

// Moneycontrol Insight for a symbol (prefers DB, else fetches live)
router.get('/stocks/:symbol/mc-insight', asyncHandler(async (req, res) => {
  const yahooSymbol = String(req.params.symbol || '').toUpperCase();
  // Try DB cached insight first
  try {
    const row = db.prepare("SELECT id, date, title, summary, url, sentiment FROM news WHERE symbol=? AND id LIKE 'mc:insights:%' ORDER BY date DESC LIMIT 1").get(yahooSymbol);
    if (row) {
      // Attempt to parse fields
      const id: string = String(row.id || '');
      const scId = id.includes(':') ? id.split(':').pop() : undefined;
      const title: string = String(row.title || '');
      const shortDesc = title.startsWith('MC Insights: ') ? title.slice('MC Insights: '.length) : title;
      const summary: string = String(row.summary || '');
      const scoreMatch = summary.match(/Score:\s*(\d+)/i);
      const stockScore = scoreMatch ? Number(scoreMatch[1]) : undefined;
      res.json({ ok: true, data: { scId, type: 'c', shortDesc, longDesc: summary, stockScore } });
      return;
    }
  } catch (e) {
    logger.warn({ err: e, symbol: yahooSymbol }, 'mc_insight_db_lookup_failed');
  }

  // Fallback to live fetch using mcsymbol from stocklist
  const base = yahooSymbol.includes('.') ? yahooSymbol.split('.')[0] : yahooSymbol;
  const mcid = resolveTicker(base, 'mc');
  if (!mcid) return res.status(404).json({ ok: false, error: 'mcsymbol not found for stock' });
  const mc = await fetchMcInsights(mcid, 'c');
  if (!mc) return res.status(502).json({ ok: false, error: 'Moneycontrol fetch failed' });
  res.json({ ok: true, data: mc });
}));

// Moneycontrol Technical Indicators for a symbol and frequency (D/W/M)
router.get('/stocks/:symbol/mc-tech', asyncHandler(async (req, res) => {
  const yahooSymbol = String(req.params.symbol || '').toUpperCase();
  const freq = String(req.query.freq || 'D').toUpperCase() as 'D'|'W'|'M';
  // DB cache first
  try {
    const cached = getMcTech(yahooSymbol, (freq === 'W' || freq === 'M') ? freq : 'D');
    if (cached) return res.json({ ok: true, data: cached });
  } catch {}
  const base = yahooSymbol.includes('.') ? yahooSymbol.split('.')[0] : yahooSymbol;
  const mcid = resolveTicker(base, 'mc');
  if (!mcid) return res.status(404).json({ ok: false, error: 'mcsymbol not found for stock' });
  const tech = await fetchMcTech(mcid, (freq === 'W' || freq === 'M') ? freq : 'D');
  if (!tech) return res.status(502).json({ ok: false, error: 'Moneycontrol tech fetch failed' });
  // Cache
  try { upsertMcTech(yahooSymbol, tech.freq, tech); } catch {}
  res.json({ ok: true, data: tech });
}));

// DB stats for a symbol: counts and date ranges
router.get('/stocks/:symbol/db', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const priceCount = db.prepare('SELECT COUNT(*) AS c FROM prices WHERE symbol=?').get(symbol)?.c || 0;
  const priceRange = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM prices WHERE symbol=?').get(symbol) || { min: null, max: null };
  const newsCount = db.prepare('SELECT COUNT(*) AS c FROM news WHERE symbol=?').get(symbol)?.c || 0;
  const newsRange = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM news WHERE symbol=?').get(symbol) || { min: null, max: null };
  const docsCount = db.prepare('SELECT COUNT(*) AS c FROM docs WHERE symbol=?').get(symbol)?.c || 0;
  const analysesCount = db.prepare('SELECT COUNT(*) AS c FROM analyses WHERE symbol=?').get(symbol)?.c || 0;

  res.json({ ok: true, data: {
    symbol,
    prices: { count: Number(priceCount), firstDate: priceRange.min, lastDate: priceRange.max },
    news: { count: Number(newsCount), firstDate: newsRange.min, lastDate: newsRange.max },
    docs: { count: Number(docsCount) },
    analyses: { count: Number(analysesCount) }
  }});
}));

// Expose stocklist names + symbols from server/stocklist.ts
router.get('/stocks/list', asyncHandler((_req, res) => {
  const list = loadStocklist();
  const data = list.map(e => ({ name: e.name, symbol: e.symbol, yahoo: `${e.symbol.toUpperCase()}.NS` }));
  res.json({ ok: true, data });
}));

// Persist a daily snapshot of Top Picks (idempotent per date+symbol)
router.post('/top-picks/snapshot', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : (req.body?.days ? Number(req.body.days) : 60);
  const limit = req.query.limit ? Number(req.query.limit) : (req.body?.limit ? Number(req.body.limit) : 10);
  const now = new Date();
  const date = now.toISOString().slice(0,10);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const r = await fetch(`${baseUrl}/api/top-picks?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`).then(r=>r.json()).catch(()=>({ ok:false }));
  const arr: Array<any> = r?.data || [];
  const stmt = db.prepare(`INSERT OR REPLACE INTO top_picks_history(snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation, created_at)
                           VALUES(?,?,?,?,?,?,?,?)`);
  const createdAt = now.toISOString();
  db.transaction(() => {
    for (const p of arr) {
      stmt.run(date, p.symbol, p.score, p.momentum, p.sentiment, (p.mcScore ?? null), p.recommendation, createdAt);
    }
  })();
  res.json({ ok:true, saved: arr.length, date });
}));

// History API: list snapshots for last N days, optionally filter symbol
router.get('/top-picks/history', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 7;
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : '';
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 7) * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const rows = symbol
    ? db.prepare(`SELECT snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation FROM top_picks_history WHERE symbol=? AND snapshot_date>=? ORDER BY snapshot_date DESC`).all(symbol, cutoff)
    : db.prepare(`SELECT snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation FROM top_picks_history WHERE snapshot_date>=? ORDER BY snapshot_date DESC`).all(cutoff);
  res.json({ ok:true, data: rows });
}));
// Yahoo ingest (historical daily via chart API)
router.post('/yahoo/ingest/:symbol', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  const symbol = resolveTicker(input, 'yahoo');
  const range = String(req.query.range || '1y');
  const intervalRaw = String(req.query.interval || '1d');
  const allowedIntervals: YahooInterval[] = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'];
  const interval: YahooInterval = allowedIntervals.includes(intervalRaw as YahooInterval) ? intervalRaw as YahooInterval : '1d';
  const chart = await fetchYahooDaily(symbol, range, interval);
  const rows = parseYahooDaily(symbol, chart);
  if (!rows.length) {
    const err: any = new Error('No price data from Yahoo');
    err.status = 502;
    throw err;
  }
  rows.forEach(r => insertPriceRow(r));
  upsertStock(symbol, symbol);
  res.json({ ok:true, insertedPrices: rows.length, source: 'yahoo' });
}));

// Yahoo: fetch quote, chart, and quoteSummary modules in one call
router.get('/stocks/:symbol/yahoo-full', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  const symbol = resolveTicker(input, 'yahoo');
  const range = String(req.query.range || '1y');
  const intervalRaw = String(req.query.interval || '1d');
  const allowedIntervals: YahooInterval[] = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'];
  const interval: YahooInterval = allowedIntervals.includes(intervalRaw as YahooInterval) ? intervalRaw as YahooInterval : '1d';
  const modules = String(req.query.modules || 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics,earnings,recommendationTrend,balanceSheetHistory,cashflowStatementHistory,secFilings')
                    .split(',').map(s=>s.trim()).filter(Boolean);
  const [quote, chart, summary] = await Promise.all([
    fetchYahooQuote(symbol).catch(()=>null),
    fetchYahooDaily(symbol, range, interval).catch(()=>null),
    fetchYahooQuoteSummary(symbol, modules).catch(()=>null)
  ]);
  try { upsertYahooCache({ symbol, range, interval, quote, summary, chart }); } catch {}
  res.json({ ok: true, data: { symbol, quote, chart, summary } });
}));

// Yahoo via python yahoo_fin aggregator (best-effort). Requires python + yahoo_fin installed.
router.get('/stocks/:symbol/yahoo-fin', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  const symbol = resolveTicker(input, 'yahoo');
  const period = String(req.query.period || '1y');
  const interval = String(req.query.interval || '1d');

  // Pick python executable (windows-friendly)
  const candidates = ['python', 'python3', 'py'];
  const args = ['server/scripts/yahoo_fin_fetch.py', symbol, '--period', period, '--interval', interval];

  function runOnce(bin: string): Promise<{ code: number, stdout: string, stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += String(d); });
      child.stderr.on('data', (d) => { stderr += String(d); });
      child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  }

  // Try each candidate
  let last: any = null;
  for (const bin of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runOnce(bin);
    if (r && r.stdout) {
      try {
        const json = JSON.parse(r.stdout);
        if (json && typeof json === 'object') {
          return res.json(json);
        }
      } catch (e) {
        last = { bin, error: String(e), stderr: r.stderr?.slice(0, 500) };
        continue;
      }
    }
    last = { bin, code: r.code, stderr: r.stderr?.slice(0, 500) };
  }
  return res.status(501).json({ ok: false, error: 'python_yahoo_fin_unavailable', detail: last });
}));

// Yahoo: read cached quote/summary/chart from DB (if available)
router.get('/stocks/:symbol/yahoo-cache', asyncHandler(async (req, res) => {
  const input = String(req.params.symbol || '').toUpperCase();
  const symbol = resolveTicker(input, 'yahoo');
  const range = req.query.range ? String(req.query.range) : '';
  const interval = req.query.interval ? String(req.query.interval) : '';
  const withData = String(req.query.withData ?? 'true').toLowerCase() !== 'false';
  if (range && interval) {
    const row = db.prepare(`SELECT symbol,range,interval,quote,summary,chart,fetched_at FROM yahoo_cache WHERE symbol=? AND range=? AND interval=?`).get(symbol, range, interval) as any;
    if (!row) return res.status(404).json({ ok:false, error:'cache_not_found' });
    if (withData) {
      try {
        row.quote = row.quote ? JSON.parse(String(row.quote)) : null;
        row.summary = row.summary ? JSON.parse(String(row.summary)) : null;
        row.chart = row.chart ? JSON.parse(String(row.chart)) : null;
      } catch {}
    } else {
      delete row.quote; delete row.summary; delete row.chart;
    }
    return res.json({ ok:true, data: row });
  }
  const rows = db.prepare(`SELECT range,interval,fetched_at FROM yahoo_cache WHERE symbol=? ORDER BY fetched_at DESC`).all(symbol) as Array<any>;
  return res.json({ ok:true, data: rows });
}));
