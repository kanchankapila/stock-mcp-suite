import db, { listNews, listPrices, insertPriceRow, insertNewsRow, upsertStock } from '../db.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';
import { backtestSMA, scoreStrategy } from '../analytics/backtest.js';
import { retrieve as legacyRetrieve } from '../rag/retriever.js';
import { fetchStooqDaily } from '../providers/stooq.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights } from '../providers/moneycontrol.js';
import { resolveTicker } from '../utils/ticker.js';
import { indexNamespace as lcIndex, answer as lcAnswer, retrieve as lcRetrieve } from '../rag/langchain.js';
import { ingestionManager } from '../providers/IngestionManager.js';

function parseIntent(prompt: string) {
  const p = prompt.toLowerCase();
  const intent = {
    wantSentiment: /sentiment|news/.test(p),
    wantPrediction: /predict|forecast/.test(p),
    wantBacktest: /backtest|strategy/.test(p),
    wantRag: /why|explain|details|context|news|filing|report|rag|sources/.test(p),
    wantIngest: /\bingest\b|\bfetch\b|\bload\b|pull|update data/.test(p),
    wantOverview: /overview|summary|last close|change/.test(p),
    wantHistory: /history|prices|chart/.test(p),
    wantDbStats: /\bdb\b|database|counts|rows/.test(p),
    wantResolve: /resolve|map|identifiers|ids/.test(p),
    wantMc: /moneycontrol|mc insight|\binsight\b/.test(p),
    wantRagIndex: /rag index|index urls|add urls|add documents/.test(p),
    wantRagAnswer: /rag answer|\bqa\b|question|\bask\b/.test(p)
  };
  // crude symbol detection: uppercase word 1-5 chars or after "for "
  const m = prompt.match(/\b([A-Z]{1,5})\b/) || prompt.match(/for\s+([A-Za-z.]{1,10})/i);
  const symbol = (m?.[1] || '').toUpperCase();
  return { symbol, ...intent };
}

export async function agentAnswer(prompt: string, explicitSymbol?: string) {
  const intents = parseIntent(prompt);
  const { symbol: symFromPrompt, wantSentiment, wantPrediction, wantBacktest, wantRag, wantIngest, wantOverview, wantHistory, wantDbStats, wantResolve, wantMc, wantRagIndex, wantRagAnswer } = intents;
  const symbol = (explicitSymbol || symFromPrompt || '').toUpperCase();
  if (!symbol) {
    return { ok:false, answer: 'Please specify a stock symbol (e.g., AAPL).', data:{} };
  }

  const messages: string[] = [];
  // On-demand ingest pipeline
  if (wantIngest) {
    const sym = symbol;
    // Use new ingestion pipeline (alphavantage + newsapi) instead of manual fetch
    try {
      const alphaRes = await ingestionManager.run({ providerId: 'alphavantage', symbols: [sym] });
      const newsRes = await ingestionManager.run({ providerId: 'newsapi', symbols: [sym], rag: true });
      const pc = alphaRes.prices?.length || 0;
      const nc = newsRes.news?.length || 0;
      messages.push(`Ingest pipeline: prices=${pc}, news=${nc}`);
    } catch (err:any) {
      messages.push(`Ingest error: ${String(err?.message||err)}`);
    }
  }

  const prices = (await listPrices(symbol, 500)) as any[];
  if (!prices.length) {
    return { ok:false, answer: `No data for ${symbol}. Ingest first (try: "Ingest ${symbol}").`, data:{} };
  }
  const news = (await listNews(symbol, 25)) as any[];
  const closes = prices.map(p=>p.close);
  const momReturn = closes.length>2 ? (closes[closes.length-1]-closes[0])/closes[0] : 0;

  let sScore = 0, prediction = 0, ragSnippets: any[] = [], bt:any = null, score=50, recommendation='HOLD';
  let overview:any = null, history:any[] = [], dbstats:any = null, resolved:any = null, mc:any = null, ragAnswer:string|null = null;

  if (wantSentiment || news.length) {
    sScore = sentimentScore(news.map(n=>`${n.title}. ${n.summary}`));
  }
  if (wantPrediction) {
    prediction = predictNextClose(closes, 10);
  }
  if (wantBacktest) {
    const pts = prices.map(p=>({date:p.date, close:p.close}));
    bt = backtestSMA(pts, 10, 20);
  }
  const sc = scoreStrategy(sScore, momReturn);
  score = sc.score; recommendation = sc.recommendation;

  if (wantRag) {
    try {
      if (wantRagIndex) {
        // Extract URLs from prompt and index into namespace
        const urlRe = /https?:\/\/\S+/g; const urls = (prompt.match(urlRe) || []);
        if (urls.length) {
          await lcIndex(symbol, { urls });
          messages.push(`Indexed ${urls.length} URL(s) to ${symbol}`);
        }
      }
      if (wantRagAnswer && process.env.OPENAI_API_KEY) {
        const out = await lcAnswer(symbol, prompt, 5);
        ragAnswer = out.answer as any;
        ragSnippets = (out.sources || []) as any[];
      } else {
        const docs = await lcRetrieve(symbol, prompt, 5);
        ragSnippets = docs.map(d=>({ text: d.pageContent, metadata: d.metadata }));
      }
    } catch {
      // fallback to legacy retriever
      try { ragSnippets = legacyRetrieve(symbol, prompt, 5) as any; } catch {}
    }
  }

  if (wantOverview) {
    const last = prices[prices.length-1];
    const first = prices[0];
    const change = last.close - first.close;
    const changePct = (change/first.close)*100;
    overview = { symbol, lastClose: last.close, periodChangePct: changePct, nPrices: prices.length };
  }
  if (wantHistory) {
    history = prices;
  }
  if (wantDbStats) {
    const priceCount = db.prepare('SELECT COUNT(*) AS c FROM prices WHERE symbol=?').get(symbol)?.c || 0;
    const priceRange = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM prices WHERE symbol=?').get(symbol) || { min: null, max: null };
    const newsCount = db.prepare('SELECT COUNT(*) AS c FROM news WHERE symbol=?').get(symbol)?.c || 0;
    const newsRange = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM news WHERE symbol=?').get(symbol) || { min: null, max: null };
    const docsCount = db.prepare('SELECT COUNT(*) AS c FROM docs WHERE symbol=?').get(symbol)?.c || 0;
    const analysesCount = db.prepare('SELECT COUNT(*) AS c FROM analyses WHERE symbol=?').get(symbol)?.c || 0;
    dbstats = { prices: { count: Number(priceCount), firstDate: priceRange.min, lastDate: priceRange.max }, news: { count: Number(newsCount), firstDate: newsRange.min, lastDate: newsRange.max }, docs: { count: Number(docsCount) }, analyses: { count: Number(analysesCount) } };
  }
  if (wantResolve) {
    resolved = {
      news: resolveTicker(symbol, 'news'),
      alpha: resolveTicker(symbol, 'alpha'),
      mc: resolveTicker(symbol, 'mc')
    };
  }
  if (wantMc) {
    const mcid = resolveTicker(symbol.includes('.') ? symbol.split('.')[0] : symbol, 'mc');
    if (mcid) {
      try { mc = await fetchMcInsights(mcid, 'c'); } catch {}
    }
  }

  const answer = [
    `Symbol: ${symbol}`,
    messages.length ? `Messages: ${messages.join(' | ')}` : null,
    wantOverview && overview ? `Overview: lastClose=${overview.lastClose.toFixed(2)}, change=${overview.periodChangePct.toFixed(2)}%, nPrices=${overview.nPrices}` : null,
    `Sentiment: ${sScore.toFixed(3)}`,
    `Momentum (from first to last): ${(momReturn*100).toFixed(2)}%`,
    wantPrediction ? `Predicted next close: ${prediction.toFixed(2)}` : null,
    `Strategy score: ${score} - ${recommendation}`,
    wantBacktest && bt ? `Backtest total return: ${(bt.totalReturn*100).toFixed(2)}% (fast=${bt.fast}, slow=${bt.slow})` : null,
    ragAnswer ? `RAG Answer: ${ragAnswer}` : null,
    ragSnippets.length ? `Top context: ${ragSnippets.map(r=>`- ${String((r as any).text || '').slice(0,160)}`).join(' | ')}` : null,
    wantResolve && resolved ? `IDs: news=${resolved.news}, alpha=${resolved.alpha}, mc=${resolved.mc}` : null,
    wantMc && mc ? `MC Insight: ${mc.shortDesc || ''} (Score: ${mc.stockScore ?? '-'}). ${mc.longDesc || ''}` : null,
    wantDbStats && dbstats ? `DB: prices=${dbstats.prices.count} (${dbstats.prices.firstDate}..${dbstats.prices.lastDate}), news=${dbstats.news.count}, docs=${dbstats.docs.count}` : null
  ].filter(Boolean).join('\n');

  return { ok:true, answer, data: { symbol, messages, overview, sentiment: sScore, momentum: momReturn, prediction, backtest: bt, rag: ragSnippets, ragAnswer, score, recommendation, dbstats, resolved, mc } };
}

export async function agentAnswerStream(prompt: string, explicitSymbol: string | undefined, onChunk: (ev:{type:string, data:any})=>void) {
  onChunk({ type: 'status', data: 'processing' });
  try {
    const res = await agentAnswer(prompt, explicitSymbol);
    onChunk({ type: 'meta', data: { ok: res.ok, data: res.data } });
    const text = String(res.answer || '');
    // stream by lines to simulate token streaming
    const lines = text.split(/\n/);
    for (const ln of lines) {
      onChunk({ type: 'chunk', data: ln + "\n" });
    }
    onChunk({ type: 'done', data: null });
  } catch (err:any) {
    onChunk({ type: 'error', data: String(err?.message || err) });
  }
}
