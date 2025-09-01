import db, { listNews, listPrices } from '../db.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { predictNextClose } from '../analytics/predict.js';
import { backtestSMA, scoreStrategy } from '../analytics/backtest.js';
import { retrieve } from '../rag/retriever.js';

function parseIntent(prompt: string) {
  const p = prompt.toLowerCase();
  const intent = {
    wantSentiment: /sentiment|news/.test(p),
    wantPrediction: /predict|forecast/.test(p),
    wantBacktest: /backtest|strategy/.test(p),
    wantRag: /why|explain|details|context|news|filing|report/.test(p)
  };
  // crude symbol detection: uppercase word 1-5 chars or after "for "
  const m = prompt.match(/\b([A-Z]{1,5})\b/) || prompt.match(/for\s+([A-Za-z.]{1,10})/i);
  const symbol = (m?.[1] || '').toUpperCase();
  return { symbol, ...intent };
}

export async function agentAnswer(prompt: string, explicitSymbol?: string) {
  const { symbol: symFromPrompt, wantSentiment, wantPrediction, wantBacktest, wantRag } = parseIntent(prompt);
  const symbol = (explicitSymbol || symFromPrompt || '').toUpperCase();
  if (!symbol) {
    return { ok:false, answer: 'Please specify a stock symbol (e.g., AAPL).', data:{} };
  }

  const prices = (await listPrices(symbol, 500)) as any[];
  if (!prices.length) {
    return { ok:false, answer: `No data for ${symbol}. Ingest first.`, data:{} };
  }
  const news = (await listNews(symbol, 25)) as any[];
  const closes = prices.map(p=>p.close);
  const momReturn = closes.length>2 ? (closes[closes.length-1]-closes[0])/closes[0] : 0;

  let sScore = 0, prediction = 0, ragSnippets: any[] = [], bt:any = null, score=50, recommendation='HOLD';

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
    ragSnippets = retrieve(symbol, prompt, 5);
  }

  const answer = [
    `Symbol: ${symbol}`,
    `Sentiment: ${sScore.toFixed(3)}`,
    `Momentum (from first to last): ${(momReturn*100).toFixed(2)}%`,
    wantPrediction ? `Predicted next close: ${prediction.toFixed(2)}` : null,
    `Strategy score: ${score} → **${recommendation}**`,
    wantBacktest && bt ? `Backtest total return: ${(bt.totalReturn*100).toFixed(2)}% (fast=${bt.fast}, slow=${bt.slow})` : null,
    ragSnippets.length ? `Top context: ${ragSnippets.map(r=>`“${r.text.slice(0,120)}”`).join(' | ')}` : null
  ].filter(Boolean).join('\n');

  return { ok:true, answer, data: { symbol, sentiment: sScore, momentum: momReturn, prediction, backtest: bt, rag: ragSnippets, score, recommendation } };
}
