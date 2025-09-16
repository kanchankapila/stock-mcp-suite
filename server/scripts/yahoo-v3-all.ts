#!/usr/bin/env ts-node-esm
/**
 * yahoo-v3-all: Fetch a comprehensive snapshot of Yahoo Finance data using
 * @gadicc/yahoo-finance2 v3 (class API).
 *
 * Usage examples:
 *   npx tsx server/scripts/yahoo-v3-all.ts AAPL
 *   npx tsx server/scripts/yahoo-v3-all.ts MSFT --qs=price,summaryDetail,financialData --fts=quarterlyTotalRevenue --region=US
 *   npx tsx server/scripts/yahoo-v3-all.ts NVDA --save            # save combined payload
 *   npx tsx server/scripts/yahoo-v3-all.ts NVDA --save-all        # save each section separately
 *   npx tsx server/scripts/yahoo-v3-all.ts TSLA --query=tesla --screener=most_actives
 *
 * Flags:
 *   --qs=module1,module2           quoteSummary modules
 *   --fts=key1,key2                fundamentalsTimeSeries keys
 *   --region=US                    Region (default US)
 *   --from=YYYY-MM-DD              Historical period1 start (default 30d back)
 *   --interval=1d|1wk|1mo|...      Historical interval (default 1d)
 *   --screener=most_actives        Screener id (default most_actives)
 *   --screenerCount=10             Screener count (default 5)
 *   --query=searchterm             Run search endpoint
 *   --save                         Persist combined snapshot to provider_data
 *   --save-all                     Persist each section separately (prefix yfv3_*)
 *   --provider-id=yfv3_all         Override provider_id for combined save
 *   --json                         Print only full JSON (omit previews)
 */
import YahooFinance from '@gadicc/yahoo-finance2';
import { insertProviderData } from '../src/db.js';

const yf: any = new (YahooFinance as any)();

interface Args {
  symbol: string;
  qsModules: string[];
  ftsKeys: string[];
  region: string;
  from?: string;
  interval: string;
  screenerId: string;
  screenerCount: number;
  searchQuery: string;
  save: boolean;
  saveAll: boolean;
  providerId: string;
  jsonOnly: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = {
    symbol: 'AAPL',
    qsModules: ['price','summaryDetail','financialData','calendarEvents'],
    ftsKeys: ['quarterlyTotalRevenue','annualTotalRevenue'],
    region: 'US',
    from: undefined,
    interval: '1d',
    screenerId: 'most_actives',
    screenerCount: 5,
    searchQuery: '',
    save: false,
    saveAll: false,
    providerId: 'yfv3_all',
    jsonOnly: false
  };
  for (const p of a) {
    if (!p.startsWith('--') && out.symbol === 'AAPL') out.symbol = p.toUpperCase();
    else if (p.startsWith('--qs=')) out.qsModules = p.split('=')[1].split(',').filter(Boolean);
    else if (p.startsWith('--fts=')) out.ftsKeys = p.split('=')[1].split(',').filter(Boolean);
    else if (p.startsWith('--region=')) out.region = p.split('=')[1] || out.region;
    else if (p.startsWith('--from=')) out.from = p.split('=')[1];
    else if (p.startsWith('--interval=')) out.interval = p.split('=')[1] || out.interval;
    else if (p.startsWith('--screener=')) out.screenerId = p.split('=')[1] || out.screenerId;
    else if (p.startsWith('--screenerCount=')) out.screenerCount = Number(p.split('=')[1]) || out.screenerCount;
    else if (p.startsWith('--query=')) out.searchQuery = p.split('=')[1] || '';
    else if (p === '--save') out.save = true;
    else if (p === '--save-all') { out.saveAll = true; out.save = true; }
    else if (p.startsWith('--provider-id=')) out.providerId = p.split('=')[1] || out.providerId;
    else if (p === '--json') out.jsonOnly = true;
  }
  return out;
}

function trim<T>(arr: T[], max = 5): T[] { return Array.isArray(arr) && arr.length > max ? arr.slice(0, max) : arr; }
function safeJSON(obj: any, max = 20000) {
  try { const s = JSON.stringify(obj, null, 2); return s.length <= max ? s : s.slice(0,max) + `\n... truncated (${s.length-max} more chars)`; } catch(e){ return String(e); }
}

async function main() {
  const args = parseArgs();
  const sym = args.symbol.toUpperCase();
  console.log(`v3 fetch for ${sym} region=${args.region}`);

  const period1 = args.from ? new Date(args.from) : new Date(Date.now() - 30*86400000);

  const tasks: Record<string, Promise<any>> = {
    quote: yf.quote(sym),
    chart: yf.chart(sym, { range: '1mo', interval: '1d' }),
    historical: yf.historical(sym, { period1, interval: args.interval }),
    options: yf.options(sym).catch((e:any)=> ({ error: String(e) })),
    quoteSummary: yf.quoteSummary(sym, { modules: args.qsModules }).catch((e:any)=> ({ error: String(e) })),
    insights: yf.insights(sym).catch((e:any)=> ({ error: String(e) })),
    recommendationsBySymbol: yf.recommendationsBySymbol([sym]).catch((e:any)=> ({ error: String(e) })),
    trendingSymbols: yf.trendingSymbols(args.region).catch((e:any)=> ({ error: String(e) })),
    screener: yf.screener(args.screenerId, { region: args.region, count: args.screenerCount }).catch((e:any)=> ({ error: String(e) })),
  };
  if (args.searchQuery) tasks.search = yf.search(args.searchQuery, { region: args.region }).catch((e:any)=> ({ error: String(e) }));

  // fundamentalsTimeSeries multiple keys
  tasks.fundamentalsTimeSeries = Promise.all(
    args.ftsKeys.map(k => yf.fundamentalsTimeSeries(sym, k).then((r:any)=> ({ key:k, data:r })).catch((e:any)=> ({ key:k, error:String(e) })))
  );

  const entries = await Promise.all(Object.entries(tasks).map(async ([k,p]) => [k, await p] as const));
  const full: Record<string, any> = Object.fromEntries(entries);

  // Add previews
  if (!args.jsonOnly) {
    if (Array.isArray(full.historical)) full.historical_preview = trim(full.historical, 5);
    if (full.chart?.timestamp) full.chart_preview = { timestamps: trim(full.chart.timestamp, 5), quoteSample: (()=>{ const q= full.chart.indicators?.quote?.[0]; if (!q) return null; const sample: any = {}; for (const [k,v] of Object.entries(q)) sample[k] = Array.isArray(v)? trim(v as any[],5) : v; return sample; })() };
    if (full.options?.options) full.options_preview = { expirations: trim(full.options.expirationDates||[],5), first: (()=> { const o = full.options.options[0]; if (!o) return null; return { calls: trim(o.calls||[],2), puts: trim(o.puts||[],2) }; })() };
    if (Array.isArray(full.fundamentalsTimeSeries)) full.fundamentals_preview = full.fundamentalsTimeSeries.map((r:any)=> ({ key:r.key, sample: Array.isArray(r.data)? trim(r.data,3): r.data }));
    if (full.trendingSymbols?.quotes) full.trending_preview = trim(full.trendingSymbols.quotes,5);
    if (full.screener?.quotes) full.screener_preview = trim(full.screener.quotes,5);
    if (full.search?.quotes) full.search_preview = trim(full.search.quotes,5);
  }

  if (args.jsonOnly) {
    console.log(safeJSON(full));
  } else {
    console.log('\n=== PREVIEW ===');
    console.log(safeJSON({
      quote: full.quote,
      quoteSummaryModules: Object.keys(full.quoteSummary||{}),
      chart_preview: full.chart_preview,
      historical_preview: full.historical_preview,
      options_preview: full.options_preview,
      fundamentals_preview: full.fundamentals_preview,
      insights: full.insights,
      recommendations_preview: Array.isArray(full.recommendationsBySymbol)? full.recommendationsBySymbol.slice(0,3): full.recommendationsBySymbol,
      screener_preview: full.screener_preview,
      trending_preview: full.trending_preview,
      search_preview: full.search_preview
    }));
    console.log('\n=== FULL (truncated) ===');
    console.log(safeJSON(full));
  }

  if (args.save) {
    const now = new Date().toISOString();
    if (args.saveAll) {
      for (const [k,v] of Object.entries(full)) {
        try { insertProviderData({ provider_id: `yfv3_${k}`, symbol: sym, captured_at: now, payload: v }); } catch {}
      }
      console.log('Saved per-section provider_data rows (prefix yfv3_*)');
    } else {
      try { insertProviderData({ provider_id: args.providerId, symbol: sym, captured_at: now, payload: full }); console.log(`Saved provider_data provider_id=${args.providerId}`); } catch (e) { console.error('Save failed', e); }
    }
  }
}

main().catch(e=> { console.error('Fatal', e); process.exit(1); });
