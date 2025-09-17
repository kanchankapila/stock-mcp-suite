// Simple SMA crossover backtest: fast SMA vs slow SMA
// Buy when fast crosses above slow, sell when crosses below.
// Returns equity curve & summary stats.

import { scoreStrategy } from './scoring.js';
import { listPrices } from '../db.js';

type Pt = { date: string, close: number };

function sma(values: number[], w: number) {
  const out: number[] = [];
  for (let i=0;i<values.length;i++) {
    const start = Math.max(0, i-w+1);
    const slice = values.slice(start, i+1);
    const avg = slice.reduce((a,b)=>a+b,0) / slice.length;
    out.push(avg);
  }
  return out;
}

export function backtestSMA(data: Pt[], fast=10, slow=20) {
  const closes = data.map(d=>d.close);
  const dates = data.map(d=>d.date);
  const f = sma(closes, fast);
  const s = sma(closes, slow);
  let position = 0; // 0 cash, 1 long
  let entry = 0;
  const trades: any[] = [];
  const equity: number[] = [];
  let equityVal = 10000;
  equity.push(equityVal);

  for (let i=1;i<data.length;i++) {
    const prevCross = f[i-1] - s[i-1];
    const currCross = f[i] - s[i];
    if (position===0 && prevCross<=0 && currCross>0) {
      position = 1;
      entry = closes[i];
      trades.push({type:'BUY', date: dates[i], price: entry});
    }
    if (position===1 && prevCross>=0 && currCross<0) {
      const exit = closes[i];
      const ret = (exit - entry)/entry;
      equityVal *= (1+ret);
      trades.push({type:'SELL', date: dates[i], price: exit, ret});
      position = 0;
    }
    equity.push(equityVal);
  }
  if (position===1) {
    const exit = closes[closes.length-1];
    const ret = (exit - entry)/entry;
    equityVal *= (1+ret);
    trades.push({type:'SELL', date: dates[dates.length-1], price: exit, ret});
  }
  const totalReturn = (equityVal/10000)-1;
  // Metrics
  // Daily returns
  const returns: number[] = [];
  for (let i=1;i<equity.length;i++) {
    const r = equity[i]/equity[i-1]-1;
    if (Number.isFinite(r)) returns.push(r);
  }
  const mean = returns.length ? returns.reduce((a,b)=>a+b,0)/returns.length : 0;
  const variance = returns.length>1 ? returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1) : 0;
  const std = Math.sqrt(variance);
  const sharpe = std>0 ? (mean/std)*Math.sqrt(252) : null;
  // Max drawdown
  let peak = equity[0];
  let maxDD = 0;
  for (const v of equity) {
    if (v>peak) peak=v;
    const dd = v/peak - 1;
    if (dd < maxDD) maxDD = dd;
  }
  // Win rate
  const closed = trades.filter(t=>t.type==='SELL');
  const wins = closed.filter(t=>Number.isFinite(t.ret) && t.ret>0).length;
  const winRate = closed.length ? wins/closed.length : null;

  return { trades, equity, totalReturn, fast, slow, sharpeRatio: sharpe, maxDrawdown: maxDD, winRate };
}

export { scoreStrategy };

function dailyReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (prev > 0) {
      out.push((curr - prev) / prev);
    }
  }
  return out;
}

function maxDrawdown(series: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDd = 0;
  for (const value of series) {
    if (value > peak) peak = value;
    const dd = peak > 0 ? (value - peak) / peak : 0;
    if (dd < maxDd) maxDd = dd;
  }
  return Math.abs(maxDd);
}

export function runBacktest(symbol: string, strategy = 'sma_cross', startDate?: string, initialCapital = 10000) {
  const normalized = (symbol || '').toUpperCase();
  if (!normalized) throw new Error('symbol required');
  const rawRows = listPrices(normalized, 2000) as Array<{ date: string; close: number }>;
  if (!rawRows.length) {
    throw new Error(`No price data for ${normalized}`);
  }
  const rows = startDate ? rawRows.filter(r => r.date >= startDate) : rawRows;
  if (rows.length < 10) {
    throw new Error('Not enough data to run backtest');
  }
  const points: Pt[] = rows.map(r => ({ date: r.date, close: r.close }));
  let result;
  switch (strategy) {
    case 'momentum':
      result = backtestSMA(points, 20, 50);
      break;
    case 'mean_reversion':
      result = backtestSMA(points, 5, 20);
      break;
    case 'sma_cross':
    default:
      result = backtestSMA(points, 10, 20);
      break;
  }

  const scale = initialCapital / 10000;
  const equityRaw = result.equity.length ? result.equity : [10000 * (1 + result.totalReturn)];
  const equity = equityRaw.map(v => v * scale);
  const finalCapital = equity[equity.length - 1];
  const totalReturn = initialCapital > 0 ? (finalCapital / initialCapital) - 1 : result.totalReturn;

  const returns = dailyReturns(equity);
  const avgReturn = returns.length ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  const dd = maxDrawdown(equity);
  const sellTrades = result.trades.filter(t => t.type === 'SELL');
  const wins = sellTrades.filter(t => Number(t.ret) > 0);
  const winRate = sellTrades.length ? wins.length / sellTrades.length : 0;
  const tradingDays = rows.length;
  const years = tradingDays / 252;
  const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : totalReturn;

  return {
    symbol: normalized,
    strategy,
    total_return: totalReturn,
    annualized_return: annualizedReturn,
    sharpe_ratio: sharpeRatio,
    max_drawdown: dd,
    win_rate: winRate,
    total_trades: sellTrades.length,
    final_capital: finalCapital,
    equity_curve: equity,
    trades: result.trades
  };
}
