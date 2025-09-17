// Simple SMA crossover backtest: fast SMA vs slow SMA
// Buy when fast crosses above slow, sell when crosses below.
// Returns equity curve & summary stats.

import { scoreStrategy } from './scoring.js';

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
