import { Router } from 'express';
import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews, saveAnalysis, getMcTech, upsertMcTech, getLatestOptionsBias, listOptionsMetrics } from '../db.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../providers/alphaVantage.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
// Yahoo providers removed
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
import { ResponseUtils } from '../shared/utils/response.utils.js';
import { computeTopPicks, parseWeights } from '../services/topPicks.js';

export const router = Router();

// Resolve provider-specific identifiers for a given input
router.get('/resolve/:input', asyncHandler(async (req, res) => {
  const raw = String(req.params.input || '').toUpperCase();
  const base = raw.includes('.') ? raw.split('.')[0] : raw;
  const entry = findStockEntry(base) || null;
  const providers = listTickerProvidersFromEnv().map(p => ({
    provider: p,
    key: getProviderResolutionConfig(p as any).key,
    value: resolveTicker(base, p as any)
  }));
  res.json(ResponseUtils.success({ input: raw, entry, providers }));
}));

router.post('/ingest/:symbol', asyncHandler(async (req, res) => {
  try {
    const input = String(req.params.symbol || '').toUpperCase();
    const { name } = req.body || {};
    const NA = process.env.NEWS_API_KEY;

    // Provider-specific identifiers (Yahoo removed)
    const symbol = input; // use raw symbol for storage/lookup
    const newsQuery = resolveTicker(input, 'news');

    logger.info({ input, symbol, newsQuery }, 'ingest_start');
    const messages: string[] = [];
    if (!NA) messages.push('NewsAPI: using sample data (no API key set).');
    // Fetch prices from Stooq (Yahoo removed)
    let rows = await fetchStooqDaily(symbol);
    if (!rows.length) {
      const err: any = new Error('No price data returned.');
      err.status = 502;
      throw err;
    }
    rows.forEach(r => insertPriceRow(r));

    let news: Array<{id:string,date:string,title:string,summary:string,url:string}> = [];
    try {
      const newsJson = await fetchNews(newsQuery, NA);
      news = parseNews(symbol, newsJson);
    } catch (e:any) {
      const msg = String(e?.message || e);
      if (/429/.test(msg)) {
        logger.warn({ symbol, err: msg }, 'news_rate_limited_ingest');
        const FALLBACK_ON_429 = String(process.env.NEWS_FALLBACK_TO_SAMPLE_ON_429 ?? 'true').toLowerCase() === 'true';
        if (FALLBACK_ON_429) {
          messages.push('NewsAPI: rate limited (429). Using sample data.');
          try {
            const sampleJson = await fetchNews(newsQuery, undefined);
            news = parseNews(symbol, sampleJson);
          } catch (e2:any) {
            logger.warn({ symbol, err: e2?.message || e2 }, 'news_sample_fallback_failed');
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
      logger.warn({ symbol }, 'news_zero_articles');
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
        insertNewsRow({ id, symbol, date, title, summary, url: 'https://www.moneycontrol.com/', sentiment: sent });
        messages.push('Moneycontrol insights ingested.');
      }
    }

    // Yahoo_fin KPIs and options removed

    // compute per-article sentiment and store
    for (const n of news) {
      const s = sentimentScore([`${n.title}. ${n.summary}`]);
      insertNewsRow({ id: n.id, symbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
    }

    upsertStock(symbol, name || input);

    // Index for RAG (both legacy TF-IDF and vector store)
    try { indexDocs(symbol, news); } catch {}
    try {
      const texts: Array<{ text: string; metadata: Record<string, unknown> }> = [];
      for (const n of news) {
        const text = `${(n as any).title?.trim() || ''}. ${(n as any).summary?.trim() || ''}`.trim();
        if (!text) continue;
        texts.push({ text, metadata: { date: String((n as any).date || '').slice(0,10), source: 'news', url: (n as any).url || '' } });
      }
      try {
        const row = db.prepare("SELECT id, date, title, summary FROM news WHERE symbol=? AND id LIKE 'mc:insights:%' ORDER BY date DESC LIMIT 1").get(symbol) as {id:string,date:string,title:string,summary:string}|undefined;
        if (row) {
          const t = `${row.title?.trim() || ''}. ${row.summary?.trim() || ''}`.trim();
          if (t) texts.push({ text: t, metadata: { date: String(row.date || '').slice(0,10), source: 'mc', url: '' } });
        }
      } catch {}
      if (texts.length) { await indexNamespace(symbol, { texts }); }
    } catch {}

    logger.info({ symbol, insertedPrices: rows.length, insertedNews: news.length }, 'ingest_complete');
    res.json(ResponseUtils.success({ insertedPrices: rows.length, insertedNews: news.length, priceSource: 'stooq', newsSource: NA ? 'live' : 'sample', symbol, messages }));
  } catch (err: any) {
    const msg = String(err?.message || err || 'ingest_failed');
    const status = Number(err?.status || 500);
    return res.status(status === 500 ? 400 : status).json(ResponseUtils.error(msg));
  }
}));

router.get('/stocks/:symbol/overview', asyncHandler(async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 2000);
  if (!prices.length) return res.status(404).json(ResponseUtils.notFound('data'));
  const last = prices[prices.length-1];
  const first = prices[0];
  const change = last.close - first.close;
  const changePct = (change/first.close)*100;
  res.json(ResponseUtils.success({
    symbol,
    lastClose: last.close,
    periodChangePct: changePct,
    nPrices: prices.length
  }));
}));

router.get('/stocks/:symbol/history', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 2000);
  res.json(ResponseUtils.success(prices));
}));

router.get('/stocks/:symbol/news', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const news = listNews(symbol, 50);
  res.json(ResponseUtils.success(news));
}));

// Options metrics (PCR, PVR, bias) for a symbol
router.get('/stocks/:symbol/options-metrics', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = req.query.days ? Number(req.query.days) : 60;
  const limit = req.query.limit ? Number(req.query.limit) : 90;
  const rows = listOptionsMetrics(symbol, { days, limit });
  const latest = rows.length ? rows[rows.length - 1] : null;
  res.json(ResponseUtils.success({ latest, history: rows }));
}));

router.post('/stocks/:symbol/analyze', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const prices = listPrices(symbol, 500);
  if (!prices.length) return res.status(404).json(ResponseUtils.notFound('data'));
  const news = listNews(symbol, 25);

  const sScore = sentimentScore(news.map(n=>`${n.title}. ${n.summary}`));
  const closes = prices.map(p=>p.close);
  const prediction = predictNextClose(closes, 10);
  const back = backtestSMA(prices.map(p=>({date:p.date, close:p.close})), 10, 20);
  const momentum = closes.length>2 ? (closes[closes.length-1]-closes[0])/closes[0] : 0;
  const sc = scoreStrategy(sScore, momentum);

  const created_at = new Date().toISOString();
  saveAnalysis({symbol, created_at, sentiment_score: sScore, predicted_close: prediction, strategy: back, score: sc.score, recommendation: sc.recommendation});

  res.json(ResponseUtils.success({
    symbol, sentiment: sScore, predictedClose: prediction, backtest: back, score: sc.score, recommendation: sc.recommendation
  }));
}));

router.get('/rag/:symbol/search', asyncHandler((req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const q = String(req.query.q || '');
  const results = retrieve(symbol, q, 5);
  res.json(ResponseUtils.success(results));
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
  res.json(ResponseUtils.success(data));
}));

// Compute Top Picks across symbols using sentiment, momentum, and MC tech
router.get('/top-picks', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const includeOptionsBias = ['1','true','yes'].includes(String(req.query.options || '').toLowerCase());
  const weightsOverride = parseWeights(String(req.query.weights || ''));
  const { data, meta, weights } = computeTopPicks({ days, limit, includeOptionsBias, weights: weightsOverride });
  res.json(ResponseUtils.success(data, undefined, { ...meta, weights }));
}));

router.post('/top-picks/snapshot', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : (req.body?.days ? Number(req.body.days) : undefined);
  const limit = req.query.limit ? Number(req.query.limit) : (req.body?.limit ? Number(req.body.limit) : undefined);
  const includeOptionsBias = ['1','true','yes'].includes(String(req.query.options || req.body?.options || '').toLowerCase());
  const weightsOverride = parseWeights(String(req.query.weights || req.body?.weights || ''));
  const { data } = computeTopPicks({ days, limit, includeOptionsBias, weights: weightsOverride });
  const now = new Date();
  const date = now.toISOString().slice(0,10);
  const stmt = db.prepare(`INSERT OR REPLACE INTO top_picks_history(snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation, created_at)
                           VALUES(?,?,?,?,?,?,?,?)`);
  const createdAt = now.toISOString();
  db.transaction(() => { for (const p of data) { stmt.run(date, p.symbol, p.score, p.momentum, p.sentiment, (p.mcScore ?? null), p.recommendation, createdAt); } })();
  res.json(ResponseUtils.success({ saved: data.length, date }));
}));

// History API: list snapshots for last N days, optionally filter symbol
router.get('/top-picks/history', asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 7;
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : '';
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 7) * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const rows = symbol
    ? db.prepare(`SELECT snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation FROM top_picks_history WHERE symbol=? AND snapshot_date>=? ORDER BY snapshot_date DESC`).all(symbol, cutoff)
    : db.prepare(`SELECT snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation FROM top_picks_history WHERE snapshot_date>=? ORDER BY snapshot_date DESC`).all(cutoff);
  res.json(ResponseUtils.success(rows));
}));
// Yahoo-specific endpoints removed
