import { Router } from 'express';
import db, { upsertStock, insertPriceRow, insertNewsRow, listPrices, listNews, saveAnalysis, getMcTech, upsertMcTech, getLatestOptionsBias, listOptionsMetrics, insertProviderData, upsertProvider } from '../db.js';
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
// REMOVE legacy agent imports
// import { agentAnswer, agentAnswerStream } from '../agent/agent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker, findStockEntry, listTickerProvidersFromEnv, getProviderResolutionConfig } from '../utils/ticker.js';
import { spawn } from 'child_process';
import { ResponseUtils } from '../shared/utils/response.utils.js';
import { computeTopPicks, parseWeights } from '../services/topPicks.js';
import yahooFinance from 'yahoo-finance2';

export const router = Router();

// List stocks (for selector). Must be declared before /stocks/:symbol routes so 'list' is not treated as a symbol.
router.get('/stocks/list', asyncHandler(async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 1000;
    const entries = loadStocklist();
    const out: Array<{ name: string; symbol: string; yahoo: string }> = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const sym = (e.symbol || '').toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      out.push({ name: e.name || sym, symbol: sym, yahoo: sym });
      if (out.length >= limit) break;
    }
    if (!out.length) return res.json(ResponseUtils.success([], 'empty'));
    res.json(ResponseUtils.success(out));
  } catch (err:any) {
    res.status(500).json(ResponseUtils.error(String(err?.message || err)));
  }
}));

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

// Removed deprecated /agent and /agent/stream routes (handled in routes/agent.ts)

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

// Yahoo full data endpoint (reintroduced using yahoo-finance2)
const yf: any = yahooFinance as any; // dynamic alias
router.get('/stocks/:symbol/yahoo-full', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json(ResponseUtils.error('symbol_required'));
  const range = String(req.query.range || '1y');
  const interval = String(req.query.interval || '1d');
  const modulesRaw = String(req.query.modules || 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics');
  const modules = modulesRaw.split(',').map(m => m.trim()).filter(Boolean) as any;
  try {
    const [quoteData, chartRaw, summary, optionsChain, fundamentalsTs, historical, insights] = await Promise.all([
      yf.quote(symbol).catch(() => null),
      yf.chart(symbol, { range: range as any, interval: interval as any }).catch(() => null),
      yf.quoteSummary(symbol, { modules }).catch(() => null),
      yf.options(symbol, { contracts: undefined }).catch(() => null),
      // Optional modules (guard if function not present in lib version)
      (yf.fundamentalsTimeSeries ? yf.fundamentalsTimeSeries(symbol).catch(() => null) : Promise.resolve(null)),
      (yf.historical ? yf.historical(symbol, { period1: '2000-01-01' }).catch(() => null) : Promise.resolve(null)),
      (yf.insights ? yf.insights(symbol).catch(() => null) : Promise.resolve(null))
    ]);
    // Persist snapshot
    try {
      upsertProvider({ id: 'yahoo_full', name: 'Yahoo Finance Full', kind: 'market_data', enabled: true });
      insertProviderData({
        provider_id: 'yahoo_full',
        symbol,
        captured_at: new Date().toISOString(),
        payload: { symbol, range, interval, modules, quote: quoteData, chart: chartRaw, summary, options: optionsChain, fundamentalsTimeSeries: fundamentalsTs, historical, insights }
      });
    } catch {}

    // RAG indexing (structured to aid QA). Build concise text slices.
    try {
      const texts: Array<{ text: string; metadata?: Record<string, unknown> }> = [];
      const nowDate = new Date().toISOString().slice(0,10);
      if (quoteData) {
        const q = quoteData as any;
        const parts: string[] = [];
        const add = (k:string, v:any) => { if (v===0 || (v && v!==null && v!==undefined)) parts.push(`${k}: ${v}`); };
        add('regularMarketPrice', q.regularMarketPrice); add('regularMarketChange', q.regularMarketChange); add('regularMarketChangePercent', q.regularMarketChangePercent);
        add('marketCap', q.marketCap); add('volume', q.regularMarketVolume || q.volume); add('fiftyTwoWeekHigh', q.fiftyTwoWeekHigh); add('fiftyTwoWeekLow', q.fiftyTwoWeekLow);
        texts.push({ text: `QUOTE SNAPSHOT ${symbol}: ${parts.join(', ')}`, metadata: { source: 'yahoo', kind: 'quote', date: nowDate } });
      }
      if (summary) {
        const flat: string[] = [];
        try {
          const modulesObj = summary as any;
            for (const [k,v] of Object.entries(modulesObj)) {
              if (!v || typeof v !== 'object') continue;
              const kv: string[] = [];
              for (const [ik, iv] of Object.entries(v as any).slice(0,50)) { // limit
                const raw = (iv as any)?.fmt ?? (iv as any)?.longFmt ?? (iv as any)?.raw ?? iv;
                if (raw===null || raw===undefined || typeof raw === 'object') continue;
                kv.push(`${ik}=${raw}`);
              }
              if (kv.length) flat.push(`${k}: ${kv.join('; ')}`);
            }
        } catch {}
        if (flat.length) texts.push({ text: `QUOTE SUMMARY ${symbol}: ${flat.join(' | ')}`, metadata: { source: 'yahoo', kind: 'quoteSummary', date: nowDate } });
      }
      if (optionsChain && (optionsChain as any).options) {
        try {
          const chain = (optionsChain as any).options[0] || {};
          const calls = Array.isArray(chain.calls)? chain.calls.slice(0,20):[];
          const puts = Array.isArray(chain.puts)? chain.puts.slice(0,20):[];
          const agg = (arr:any[]) => arr.reduce((a,c)=>{ const oi = c.openInterest?.raw ?? c.openInterest; const vol = c.volume?.raw ?? c.volume; a.oi += Number(oi)||0; a.vol += Number(vol)||0; return a; }, {oi:0, vol:0});
          const cAgg = agg(calls), pAgg = agg(puts);
          texts.push({ text: `OPTIONS SNAPSHOT ${symbol}: Calls OI=${cAgg.oi} Vol=${cAgg.vol}; Puts OI=${pAgg.oi} Vol=${pAgg.vol}; Sample Calls: ` + calls.slice(0,5).map(c=>`K${c.strike?.raw ?? c.strike} OI${c.openInterest?.raw ?? c.openInterest}`).join(', ') + '; Sample Puts: ' + puts.slice(0,5).map(p=>`K${p.strike?.raw ?? p.strike} OI${p.openInterest?.raw ?? p.openInterest}`).join(', '), metadata: { source: 'yahoo', kind: 'options', date: nowDate } });
        } catch {}
      }
      if (chartRaw && Array.isArray((chartRaw as any).timestamp)) {
        try {
          const ts = (chartRaw as any).timestamp as number[];
          const q = (chartRaw as any).indicators?.quote?.[0] || {};
          const closes: any[] = q.close || [];
          if (ts.length && closes.length) {
            const lastIdx = closes.length - 1;
            const lastClose = closes[lastIdx];
            const firstClose = closes.find((v:any)=>Number.isFinite(v));
            if (Number.isFinite(lastClose) && Number.isFinite(firstClose)) {
              const perf = ((lastClose - firstClose)/firstClose)*100;
              texts.push({ text: `CHART PERF ${symbol} Range ${range} Interval ${interval}: Start=${firstClose} End=${lastClose} ChangePct=${perf.toFixed(2)}% Points=${ts.length}`, metadata: { source: 'yahoo', kind: 'chart', date: nowDate } });
            }
          }
        } catch {}
      }
      if (historical && Array.isArray(historical)) {
        try {
          const hist = (historical as any[]).slice(-30); // recent 30
          const lines = hist.map(r=> `${r.date || r.dateStr || ''} O=${r.open} H=${r.high} L=${r.low} C=${r.close} V=${r.volume}`).join(' | ');
          texts.push({ text: `HISTORICAL RECENT ${symbol}: ${lines}`, metadata: { source: 'yahoo', kind: 'historical', date: nowDate } });
        } catch {}
      }
      if (fundamentalsTs && typeof fundamentalsTs === 'object') {
        try {
          // Flatten only a subset to avoid huge payload
          const lines: string[] = [];
          for (const [k,v] of Object.entries(fundamentalsTs as any).slice(0,10)) {
            if (Array.isArray(v)) {
              const recent = v.slice(-3).map((row:any)=> `${row.asOfDate || row.date}: ${(row.value?.raw ?? row.value)}`);
              lines.push(`${k} => ${recent.join(', ')}`);
            }
          }
          if (lines.length) texts.push({ text: `FUNDAMENTALS TIMESERIES ${symbol}: ${lines.join(' | ')}`, metadata: { source: 'yahoo', kind: 'fundamentalsTimeSeries', date: nowDate } });
        } catch {}
      }
      if (insights && typeof insights === 'object') {
        try {
          const ins: any = insights;
          const parts: string[] = [];
          if (ins.instrumentInfo?.valuation?.description) parts.push(`Valuation: ${ins.instrumentInfo.valuation.description}`);
          if (ins.reports?.length) parts.push(`Reports: ${ins.reports.length}`);
          if (ins.sigDevs?.length) parts.push(`SignificantDevs: ${ins.sigDevs.length}`);
          if (parts.length) texts.push({ text: `INSIGHTS ${symbol}: ${parts.join('; ')}`, metadata: { source: 'yahoo', kind: 'insights', date: nowDate } });
        } catch {}
      }
      if (texts.length) {
        await indexNamespace(symbol, { texts });
      }
    } catch (e) { logger.warn({ symbol, err: (e as any)?.message || e }, 'yahoo_full_rag_index_failed'); }

    const price = (() => {
      if (!quoteData) return null;
      const p = [quoteData.regularMarketPrice, quoteData.postMarketPrice, quoteData.preMarketPrice, quoteData.previousClose]
        .map((v: any) => Number(v)).find(v => Number.isFinite(v));
      return Number.isFinite(p) ? p : null;
    })();
    const timeEpoch = Number(quoteData?.regularMarketTime || quoteData?.postMarketTime || quoteData?.preMarketTime || 0);
    const time = timeEpoch > 1_000_000_000 ? new Date(timeEpoch * 1000).toISOString() : new Date().toISOString();
    return res.json({ ok: true, data: { symbol, quote: { symbol, price, time }, chart: chartRaw, summary: { quoteSummary: summary }, options: optionsChain, fundamentalsTimeSeries: fundamentalsTs, historical, insights } });
  } catch (err: any) {
    return res.status(500).json(ResponseUtils.error(String(err?.message || 'yahoo_full_failed')));
  }
}));

export function getOverview(symbol: string) {
  try {
    const prices = listPrices(symbol.toUpperCase(), 2000);
    if (!prices.length) return null;
    const last = prices[prices.length - 1];
    const first = prices[0];
    const change = last.close - first.close;
    const changePct = (change / first.close) * 100;
    return { symbol: symbol.toUpperCase(), lastClose: last.close, periodChangePct: changePct, nPrices: prices.length };
  } catch {
    return null;
  }
}
