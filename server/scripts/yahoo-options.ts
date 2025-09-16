#!/usr/bin/env ts-node-esm
/**
 * Fetch and analyze options chain data (calls, puts, greeks) via yahoo-finance2.
 *
 * Usage examples:
 *   npx tsx server/scripts/yahoo-options.ts AAPL
 *   npx tsx server/scripts/yahoo-options.ts NVDA --limitExp=2 --top=5
 *   npx tsx server/scripts/yahoo-options.ts TSLA --date=2025-12-19
 *   npx tsx server/scripts/yahoo-options.ts SPY --json > spy-options.json
 *
 * Flags:
 *   --date=YYYY-MM-DD   Fetch a specific expiration only
 *   --limitExp=N        Show only first N expirations in summary (default 3; ignored if --date given)
 *   --top=N             Show top N by volume / OI (default 10 volume, 5 OI)
 *   --json              Output full raw JSON only (no summaries)
 *   --region=US         Region (default US)
 */
import yahooFinance from 'yahoo-finance2';
const yf: any = yahooFinance as any;

interface Args { symbol: string; date?: string; limitExp: number; top: number; json: boolean; region: string; }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { symbol: 'AAPL', date: undefined, limitExp: 3, top: 10, json: false, region: 'US' };
  for (const p of a) {
    if (!p.startsWith('--') && out.symbol === 'AAPL') out.symbol = p.toUpperCase();
    else if (p.startsWith('--date=')) out.date = p.split('=')[1];
    else if (p.startsWith('--limitExp=')) out.limitExp = Math.max(1, Number(p.split('=')[1])||3);
    else if (p.startsWith('--top=')) out.top = Math.max(1, Number(p.split('=')[1])||10);
    else if (p === '--json') out.json = true;
    else if (p.startsWith('--region=')) out.region = p.split('=')[1]||'US';
  }
  return out;
}

function nearest<T>(arr: T[], getVal: (x:T)=>number, target: number): T | undefined {
  let best: T | undefined; let bestDiff = Infinity;
  for (const v of arr) { const diff = Math.abs(getVal(v) - target); if (diff < bestDiff) { bestDiff = diff; best = v; } }
  return best;
}

async function fetchOptions(sym: string, opts: any) {
  if (typeof yf.options === 'function') return yf.options(sym, opts);
  if (typeof yf.optionChain === 'function') return yf.optionChain(sym, opts); // fallback older API name
  throw new Error('Installed yahoo-finance2 version does not expose options/optionChain');
}

async function main() {
  const args = parseArgs();
  const sym = args.symbol.toUpperCase();
  let opts: any = {};
  if (args.date) opts.date = new Date(args.date + 'T00:00:00Z');
  opts.region = args.region;
  const data = await fetchOptions(sym, opts);

  if (args.json) { console.log(JSON.stringify(data, null, 2)); return; }

  const expirationDates: number[] = data.expirationDates || [];
  const underlying = data.quote || {};
  const underlyingPrice = underlying.regularMarketPrice ?? underlying.postMarketPrice ?? underlying.preMarketPrice;
  console.log(`Symbol: ${sym}`);
  console.log(`Underlying Price: ${underlyingPrice}`);
  console.log(`Expirations: ${expirationDates.length}`);
  if (expirationDates.length) {
    const first = new Date(expirationDates[0]*1000).toISOString().slice(0,10);
    const last = new Date(expirationDates[expirationDates.length-1]*1000).toISOString().slice(0,10);
    console.log(`Range: ${first} -> ${last}`);
  }

  const optionSets = data.options || [];
  const showSets = args.date ? optionSets : optionSets.slice(0, args.limitExp);

  for (const set of showSets) {
    const expDateIso = new Date(set.expirationDate*1000).toISOString().slice(0,10);
    const calls: { strike: number; [key: string]: any }[] = set.calls || [];
    const puts: { strike: number; [key: string]: any }[] = set.puts || [];
    console.log(`\nExpiration ${expDateIso} calls=${calls.length} puts=${puts.length}`);
    if (Number.isFinite(underlyingPrice)) {
      const atmCall = nearest(calls, c=>Number(c.strike), underlyingPrice);
      const atmPut = nearest(puts, p=>Number(p.strike), underlyingPrice);
      if (atmCall) console.log(`  ATM Call strike=${atmCall.strike} last=${atmCall.lastPrice} IV=${(atmCall.impliedVolatility*100).toFixed(2)}% OI=${atmCall.openInterest} Vol=${atmCall.volume} Δ=${atmCall.delta}`);
      if (atmPut) console.log(`  ATM Put  strike=${atmPut.strike} last=${atmPut.lastPrice} IV=${(atmPut.impliedVolatility*100).toFixed(2)}% OI=${atmPut.openInterest} Vol=${atmPut.volume} Δ=${atmPut.delta}`);
    }
  }

  // Aggregate all options for ranking
  const allOptions = optionSets.flatMap((s:any)=> [ ...(s.calls||[]), ...(s.puts||[]) ]);
  const volRank = [...allOptions].sort((a,b)=> (b.volume||0) - (a.volume||0)).slice(0, args.top);
  const oiRank = [...allOptions].sort((a,b)=> (b.openInterest||0) - (a.openInterest||0)).slice(0, Math.min(5, args.top));

  console.log(`\nTop ${volRank.length} by Volume:`);
  volRank.forEach((o,i)=> console.log(`${i+1}. ${o.contractSymbol} exp=${new Date(o.expiration*1000).toISOString().slice(0,10)} strike=${o.strike} vol=${o.volume} oi=${o.openInterest} IV=${o.impliedVolatility? (o.impliedVolatility*100).toFixed(2)+'%':''}`));

  console.log(`\nTop ${oiRank.length} by Open Interest:`);
  oiRank.forEach((o,i)=> console.log(`${i+1}. ${o.contractSymbol} exp=${new Date(o.expiration*1000).toISOString().slice(0,10)} strike=${o.strike} oi=${o.openInterest} vol=${o.volume} IV=${o.impliedVolatility? (o.impliedVolatility*100).toFixed(2)+'%':''}`));

  // Basic Greeks summary (averages) for ATM neighborhood (within $2 of underlying) of first displayed expiration
  const firstDisplayed = showSets[0];
  if (firstDisplayed && Number.isFinite(underlyingPrice)) {
    const nearCalls = (firstDisplayed.calls||[]).filter((c:any)=> Math.abs(c.strike - underlyingPrice) <= 2);
    const nearPuts = (firstDisplayed.puts||[]).filter((p:any)=> Math.abs(p.strike - underlyingPrice) <= 2);
    function avg(list:any[], field:string) { if (!list.length) return null; const vals = list.map(v=> Number(v[field])).filter(n=> Number.isFinite(n)); return vals.length? (vals.reduce((a,b)=>a+b,0)/vals.length): null; }
    const avgDeltaC = avg(nearCalls, 'delta'); const avgGammaC = avg(nearCalls,'gamma');
    const avgDeltaP = avg(nearPuts, 'delta'); const avgGammaP = avg(nearPuts,'gamma');
    console.log(`\nATM±$2 Greeks (first expiration)`);
    console.log(`  Calls avg Δ=${avgDeltaC?.toFixed(3)} Γ=${avgGammaC?.toFixed(3)}`);
    console.log(`  Puts  avg Δ=${avgDeltaP?.toFixed(3)} Γ=${avgGammaP?.toFixed(3)}`);
  }
}

main().catch(e=> { console.error('Error', e); process.exit(1); });
