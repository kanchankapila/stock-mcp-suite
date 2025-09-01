import { Router } from 'express';
import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews, saveAnalysis } from '../db.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../providers/alphaVantage.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights } from '../providers/moneycontrol.js';
import { fetchYahooDaily, parseYahooDaily } from '../providers/yahoo.js';
import { fetchStooqDaily } from '../providers/stooq.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';
import { backtestSMA, scoreStrategy } from '../analytics/backtest.js';
import { indexDocs } from '../rag/indexer.js';
import { retrieve } from '../rag/retriever.js';
import { agentAnswer } from '../agent/agent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker, findStockEntry } from '../utils/ticker.js';

export const router = Router();

router.post('/ingest/:symbol', asyncHandler(async (req, res) => {
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
        throw err; // bubble original
      }
    } else {
      throw err;
    }
  }
  if (!rows.length) {
    const err: any = new Error('No price data returned from Yahoo.');
    err.status = 502;
    throw err;
  }
  rows.forEach(r => insertPriceRow(r));

  const newsJson = await fetchNews(newsQuery, NA);
  const news = parseNews(yahooSymbol, newsJson);
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

  // Index for RAG
  indexDocs(yahooSymbol, news);

  logger.info({ symbol: yahooSymbol, insertedPrices: rows.length, insertedNews: news.length }, 'ingest_complete');
  // Keep backwards field name alphaSource for UI, but value is 'yahoo'
  res.json({ ok:true, insertedPrices: rows.length, insertedNews: news.length, alphaSource: 'yahoo', priceSource: 'yahoo', newsSource: NA ? 'live' : 'sample', symbol: yahooSymbol, messages });
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

// Resolve debug: show provider-specific identifiers for any input
router.get('/resolve/:input', asyncHandler((req, res) => {
  const input = String(req.params.input || '');
  const entry = findStockEntry(input);
  const yahoo = resolveTicker(input, 'yahoo');
  const news = resolveTicker(input, 'news');
  const alpha = resolveTicker(input, 'alpha');
  const mc = resolveTicker(input, 'mc');
  res.json({ ok: true, data: {
    input,
    entry: entry ? { name: entry.name, symbol: entry.symbol, mcsymbol: entry.mcsymbol, isin: entry.isin, tlid: entry.tlid } : null,
    yahoo, news, alpha, mc
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
