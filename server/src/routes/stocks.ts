import { Router } from 'express';
import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews, saveAnalysis, getMcTech, upsertMcTech } from '../db.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../providers/alphaVantage.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { fetchYahooDaily, parseYahooDaily, fetchYahooQuoteSummary, fetchYahooQuote } from '../providers/yahoo.js';
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

      // Composite score weights: momentum 0.4, sentiment 0.35, tech score 0.25
      const composite = 0.4*momN + 0.35*sentN + 0.25*scoreN;

      // Recommendation heuristic
      let reco = 'HOLD';
      if (composite >= 0.25) reco = 'BUY';
      else if (composite <= -0.25) reco = 'SELL';

      results.push({ symbol: s, momentum: mom, sentiment: sent, mcScore: Number.isFinite(mcs) ? mcs : null, rsi: Number.isFinite(rsi) ? rsi : null, pivot: Number.isFinite(piv) ? piv : null, score: Number(composite.toFixed(3)), recommendation: reco });
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

// Compute Top Picks across symbols using sentiment, momentum, and MC tech
router.get('/top-picks', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 60;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const lookback = Math.max(5, Number.isFinite(days) ? days : 60);
  const cutoff = new Date(Date.now() - lookback*24*60*60*1000).toISOString();

  const rows = db.prepare(`SELECT DISTINCT symbol FROM prices WHERE date>=? ORDER BY symbol`).all(cutoff) as Array<{symbol:string}>;
  const symbols = rows.map(r => String(r.symbol || '').toUpperCase());
  if (!symbols.length) return res.json({ ok:true, data: [] });

  function safeNumber(v: any, def=0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

  const results: Array<any> = [];
  for (const s of symbols) {
    try {
      const pr = db.prepare(`SELECT date, close FROM prices WHERE symbol=? AND date>=? ORDER BY date ASC`).all(s, cutoff) as Array<{date:string, close:number}>;
      if (!pr.length) continue;
      const mom = pr.length > 1 ? (safeNumber(pr[pr.length-1].close) - safeNumber(pr[0].close)) / Math.max(1e-9, safeNumber(pr[0].close)) : 0;

      const nsr = db.prepare(`SELECT AVG(sentiment) as avg FROM news WHERE symbol=? AND date>=?`).get(s, cutoff) as {avg:number}|undefined;
      const sent = safeNumber(nsr?.avg, 0);

      const techD = getMcTech(s, 'D') as any;
      let rsi = NaN, piv = NaN, mcs = NaN;
      try { rsi = safeNumber(techD?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value, NaN); } catch {}
      try { const pv = techD?.pivot_level?.pivot ?? techD?.pivots?.pivot ?? techD?.pivot ?? null; piv = safeNumber(pv, NaN); } catch {}
      try { mcs = safeNumber(techD?.score ?? techD?.stockScore, NaN); } catch {}

      const momN = Math.max(-1, Math.min(1, mom));
      const sentN = Math.max(-1, Math.min(1, sent));
      const scoreN = Number.isFinite(mcs) ? Math.max(-1, Math.min(1, (mcs-50)/50)) : 0;
      const composite = 0.4*momN + 0.35*sentN + 0.25*scoreN;
      let reco = 'HOLD';
      if (composite >= 0.25) reco = 'BUY';
      else if (composite <= -0.25) reco = 'SELL';

      results.push({ symbol: s, momentum: mom, sentiment: sent, mcScore: Number.isFinite(mcs) ? mcs : null, rsi: Number.isFinite(rsi) ? rsi : null, pivot: Number.isFinite(piv) ? piv : null, score: Number(composite.toFixed(3)), recommendation: reco });
    } catch {}
  }

  const top = results.sort((a,b)=> b.score - a.score).slice(0, Math.max(1, Math.min(100, Number.isFinite(limit)? limit : 10)));
  res.json({ ok:true, data: top, meta: { days: lookback, total: results.length } });
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
  const interval = String(req.query.interval || '1d');
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
  const interval = String(req.query.interval || '1d');
  const modules = String(req.query.modules || 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics,earnings,recommendationTrend,balanceSheetHistory,cashflowStatementHistory,secFilings')
                    .split(',').map(s=>s.trim()).filter(Boolean);
  const [quote, chart, summary] = await Promise.all([
    fetchYahooQuote(symbol).catch(()=>null),
    fetchYahooDaily(symbol, range, interval).catch(()=>null),
    fetchYahooQuoteSummary(symbol, modules).catch(()=>null)
  ]);
  res.json({ ok: true, data: { symbol, quote, chart, summary } });
}));
