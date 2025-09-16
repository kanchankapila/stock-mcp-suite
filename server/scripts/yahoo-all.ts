#!/usr/bin/env ts-node-esm
/**
 * Fetch and display multiple yahoo-finance2 endpoints for a symbol.
 *
 * Usage:
 *   # Default (symbol AAPL)
 *   npx tsx server/scripts/yahoo-all.ts AAPL
 *
 *   # Specify modules for quoteSummary and fundamentals time series keys
 *   npx tsx server/scripts/yahoo-all.ts MSFT --qs=price,summaryDetail,financialData --fts=quarterlyTotalRevenue,annualTotalRevenue
 *
 *   # Change region for screener / trending / search
 *   npx tsx server/scripts/yahoo-all.ts NVDA --region=US --query=tesla
 */
import yahooFinance from 'yahoo-finance2';
const yf: any = yahooFinance as any; // alias to avoid TS this/context issues
import { insertProviderData } from '../src/db.js';

interface Args {
  symbol: string;
  region: string;
  qsModules: string[];
  ftsKeys: string[];
  screenerId: string;
  screenerCount: number;
  searchQuery: string;
  historicalFrom?: string; // YYYY-MM-DD
  historicalInterval: string;
  save?: boolean;
  saveAll?: boolean;
  providerId: string;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = {
    symbol: 'AAPL',
    region: 'US',
    qsModules: ['price','summaryDetail','financialData','calendarEvents'],
    ftsKeys: ['quarterlyTotalRevenue','annualTotalRevenue'],
    screenerId: 'most_actives',
    screenerCount: 5,
    searchQuery: '',
    historicalFrom: undefined,
    historicalInterval: '1d',
    save: false,
    saveAll: false,
    providerId: 'yahoo_all'
  } as any;
  for (const part of a) {
    if (!part) continue;
    if (!part.startsWith('--') && !out.symbol) out.symbol = part.toUpperCase();
    else if (!part.startsWith('--') && out.symbol === 'AAPL') out.symbol = part.toUpperCase();
    else if (part.startsWith('--qs=')) out.qsModules = part.split('=')[1].split(',').filter(Boolean);
    else if (part.startsWith('--fts=')) out.ftsKeys = part.split('=')[1].split(',').filter(Boolean);
    else if (part.startsWith('--region=')) out.region = part.split('=')[1] || out.region;
    else if (part.startsWith('--screener=')) out.screenerId = part.split('=')[1] || out.screenerId;
    else if (part.startsWith('--screenerCount=')) out.screenerCount = Number(part.split('=')[1]) || out.screenerCount;
    else if (part.startsWith('--query=')) out.searchQuery = part.split('=')[1] || '';
    else if (part.startsWith('--from=')) out.historicalFrom = part.split('=')[1];
    else if (part.startsWith('--interval=')) out.historicalInterval = part.split('=')[1] || out.historicalInterval;
    else if (part === '--save') out.save = true;
    else if (part === '--save-all') { out.saveAll = true; out.save = true; }
    else if (part.startsWith('--provider-id=')) out.providerId = part.split('=')[1] || out.providerId;
  }
  if (!out.symbol) out.symbol = 'AAPL';
  return out;
}

function trim<T>(arr: T[], max = 5): T[] { return arr.length > max ? arr.slice(0, max) : arr; }
function safeJSON(obj: any, maxLen = 20000) {
  try {
    const s = JSON.stringify(obj, null, 2);
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + `\n... truncated (${s.length - maxLen} more chars)`;
  } catch (e) { return String(e); }
}

async function main() {
  const args = parseArgs();
  const sym = args.symbol.toUpperCase();
  console.log(`Fetching yahoo-finance2 data for ${sym} (region=${args.region}) ...`);

  // Kick off independent calls (some depend on earlier results)
  const tasks: Record<string, Promise<any>> = {
    quote: yf.quote(sym),
    chart: yf.chart(sym, { range: '1mo', interval: '1d' }),
    insights: yf.insights(sym).catch(e=>({ error: String(e) })),
    options: yf.options(sym).catch(e=>({ error: String(e) })),
    recommendationsBySymbol: yf.recommendationsBySymbol([sym]).catch(e=>({ error: String(e) })),
    search: args.searchQuery ? yf.search(args.searchQuery, { region: args.region }) : Promise.resolve(null),
    trendingSymbols: yf.trendingSymbols(args.region).catch(e=>({ error: String(e) })),
    screener: yf.screener(args.screenerId, { count: args.screenerCount, region: args.region, lang: 'en-US' }).catch(e=>({ error: String(e) })),
  };

  // quoteSummary (needs modules)
  tasks.quoteSummary = yf.quoteSummary(sym, { modules: args.qsModules as any }).catch(e=>({ error: String(e) }));

  // fundamentals time series: collect multiple keys in parallel
  const ftsPromises = args.ftsKeys.map(k => yf.fundamentalsTimeSeries(sym, k as any).then(r=>({ key: k, data: r })).catch(e=>({ key: k, error: String(e) })));
  const fundamentalsAggP = Promise.all(ftsPromises).then(list => list);
  tasks.fundamentalsTimeSeries = fundamentalsAggP;

  // historical requires period1 (from) or period; use provided from date else 30d back
  let period1: Date | undefined;
  if (args.historicalFrom) period1 = new Date(args.historicalFrom);
  else period1 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  tasks.historical = yf.historical(sym, { period1, interval: args.historicalInterval as any }).catch(e=>({ error: String(e) }));

  const results = await Promise.all(Object.entries(tasks).map(async ([k, p]) => [k, await p] as const));
  const out: Record<string, any> = {};
  for (const [k, v] of results) out[k] = v;

  // Reduce very large arrays for display
  if (Array.isArray(out.historical)) out.historical_preview = trim(out.historical, 5);
  if (out.chart?.timestamp && Array.isArray(out.chart.timestamp)) out.chart_preview = { timestamps: trim(out.chart.timestamp, 5), indicatorsSample: out.chart.indicators?.quote?.[0] ? Object.fromEntries(Object.entries(out.chart.indicators.quote[0]).map(([k, arr]: any) => [k, Array.isArray(arr) ? trim(arr, 5) : arr])) : null };
  if (Array.isArray(out.options?.calls)) out.options_preview = { expirations: trim(out.options.expirationDates || [], 5), calls: trim(out.options.calls, 2), puts: trim(out.options.puts || [], 2) };
  if (Array.isArray(out.recommendationsBySymbol)) out.recommendations_preview = trim(out.recommendationsBySymbol, 3);
  if (out.trendingSymbols?.quotes) out.trending_preview = trim(out.trendingSymbols.quotes, 5);
  if (out.screener?.quotes) out.screener_preview = trim(out.screener.quotes, 5);
  if (out.search?.quotes) out.search_preview = trim(out.search.quotes, 5);
  if (Array.isArray(out.fundamentalsTimeSeries)) out.fundamentals_preview = out.fundamentalsTimeSeries.map((r: any) => ({ key: r.key, sample: Array.isArray(r.data) ? trim(r.data, 3) : r.data }));

  console.log('\n=== RAW KEYS AVAILABLE ===');
  console.log(Object.keys(out).sort().join(', '));

  console.log('\n=== SUMMARY PREVIEWS ===');
  const preview = {
    quote: out.quote,
    quoteSummaryModules: Object.keys(out.quoteSummary || {}),
    chart_preview: out.chart_preview,
    historical_preview: out.historical_preview,
    fundamentals_preview: out.fundamentals_preview,
    insights: out.insights,
    options_preview: out.options_preview,
    recommendations_preview: out.recommendations_preview,
    screener_preview: out.screener_preview,
    search_preview: out.search_preview,
    trending_preview: out.trending_preview,
  };
  console.log(safeJSON(preview));

  console.log('\n=== FULL JSON (may be truncated) ===');
  console.log(safeJSON(out));

  // Optional DB persistence
  if (args.save) {
    const nowIso = new Date().toISOString();
    if (args.saveAll) {
      for (const [k,v] of Object.entries(out)) {
        try { insertProviderData({ provider_id: `yahoo_${k}`, symbol: sym, captured_at: nowIso, payload: v }); } catch {}
      }
      console.log(`Saved provider_data rows for each section (prefix yahoo_*) symbol=${sym}`);
    } else {
      try { insertProviderData({ provider_id: args.providerId, symbol: sym, captured_at: nowIso, payload: out }); console.log(`Saved provider_data row provider_id=${args.providerId} symbol=${sym}`); } catch (e) { console.error('DB save failed', e); }
    }
  }
}

main().catch(e => { console.error('Fatal error', e); process.exit(1); });
