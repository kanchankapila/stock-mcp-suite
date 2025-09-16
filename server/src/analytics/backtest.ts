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
  let pnl = 0;
  const trades: any[] = [];
  const equity: number[] = [];
  let equityVal = 10000;

  for (let i=1;i<data.length;i++) {
    const prevCross = f[i-1] - s[i-1];
    const currCross = f[i] - s[i];
    // Cross up
    if (position===0 && prevCross<=0 && currCross>0) {
      position = 1;
      entry = closes[i];
      trades.push({type:'BUY', date: dates[i], price: entry});
    }
    // Cross down
    if (position===1 && prevCross>=0 && currCross<0) {
      const exit = closes[i];
      const ret = (exit - entry)/entry;
      pnl += ret;
      equityVal *= (1+ret);
      trades.push({type:'SELL', date: dates[i], price: exit, ret});
      position = 0;
    }
    equity.push(equityVal);
  }

  // Close open position at last price
  if (position===1) {
    const exit = closes[closes.length-1];
    const ret = (exit - entry)/entry;
    pnl += ret;
    equityVal *= (1+ret);
    trades.push({type:'SELL', date: dates[dates.length-1], price: exit, ret});
  }

  const totalReturn = (equityVal/10000)-1;
  return { trades, equity, totalReturn, fast, slow };
}

export { scoreStrategy };
