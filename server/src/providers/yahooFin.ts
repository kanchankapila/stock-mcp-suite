// Yahoo Finance extended fundamentals fetch using yahoo-finance2
// Provides a backward-compatible shape consumed by prefetch.ts (YFIN scheduler):
// {
//   info: { sector, industry, website, longBusinessSummary, ... },
//   quote_table: { 'Market Cap': string, 'PE Ratio (TTM)': string, 'EPS (TTM)': string },
//   income_statement: { totalRevenue: { YYYY-MM-DD: number } },
//   cash_flow: { totalCashFromOperatingActivities: { YYYY-MM-DD: number } },
//   stats: [ { Attribute: 'Profit Margin', Value: '12.34%' }, ... ],
//   earnings_history: [ { epsactual: number }, ... ],
//   options: { calls: [...], puts: [...] }
// }
// Only the fields actually referenced in makeFinancialSummary() and related
// summary builders are populated (others omitted for brevity).

import yahooFinance from 'yahoo-finance2';
import { logger } from '../utils/logger.js';

interface YFinCompat {
  info: Record<string, any>;
  quote_table: Record<string, any>;
  income_statement: { totalRevenue: Record<string, number> };
  cash_flow: { totalCashFromOperatingActivities: Record<string, number> };
  stats: Array<{ Attribute: string; Value: string }>;
  earnings_history: Array<{ epsactual?: number; eps_estimate?: number }>; // lenient
  options?: { calls: Array<any>; puts: Array<any> };
}

function fmtPercent(num: number | undefined | null): string | undefined {
  if (num == null || !Number.isFinite(Number(num))) return undefined;
  return (Number(num) * 100).toFixed(2) + '%';
}

function statementToMap(items: any[] | undefined, field: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(items)) return out;
  for (const row of items) {
    try {
      const vRaw = row?.[field];
      const v = vRaw?.raw ?? vRaw; // yahoo-finance2 uses { raw, fmt }
      const endDate = row?.endDate?.raw ? new Date(row.endDate.raw * 1000) : (row?.endDate ? new Date(row.endDate) : null);
      if (!endDate || !Number.isFinite(v)) continue;
      const key = endDate.toISOString().slice(0, 10);
      out[key] = Number(v);
    } catch {}
  }
  return out;
}

export async function fetchYahooFin(symbol: string, range: string, interval: string): Promise<YFinCompat | { ok: false }> {
  const sym = symbol.toUpperCase();
  try {
    // Parallel fetch core modules
    const modules = [
      'assetProfile',
      'financialData',
      'incomeStatementHistory',
      'cashflowStatementHistory',
      'balanceSheetHistory',
      'defaultKeyStatistics',
      'earningsHistory',
      'price'
    ] as const;
    const [quoteSummary, optChain] = await Promise.all([
      yahooFinance.quoteSummary(sym, { modules: modules as any }).catch(e => { throw e; }),
      // Option chain is optional; catch & continue on failure (some equities may not have options)
      yahooFinance.options(sym, { contracts: undefined }).catch(() => null)
    ]);

    // Extract profile & basic fields
    const assetProfile: any = quoteSummary?.assetProfile || {};
    const financialData: any = quoteSummary?.financialData || {};
    const priceData: any = quoteSummary?.price || {};
    const keyStats: any = quoteSummary?.defaultKeyStatistics || {};

    const info: Record<string, any> = {
      sector: assetProfile?.sector,
      industry: assetProfile?.industry,
      website: assetProfile?.website,
      longBusinessSummary: assetProfile?.longBusinessSummary,
      // Fallback names
      Sector: assetProfile?.sector,
      Industry: assetProfile?.industry,
      Website: assetProfile?.website
    };

    const quote_table: Record<string, any> = {};
    // Market Cap (prefer price.marketCap then keyStats.marketCap)
    try {
      const mc = priceData?.marketCap?.fmt || keyStats?.marketCap?.fmt || keyStats?.enterpriseValue?.fmt;
      if (mc) quote_table['Market Cap'] = mc;
    } catch {}
    try {
      const pe = keyStats?.trailingPE?.fmt || financialData?.trailingPE?.fmt;
      if (pe) quote_table['PE Ratio (TTM)'] = pe;
    } catch {}
    try {
      const eps = keyStats?.trailingEps?.fmt || financialData?.epsTrailingTwelveMonths || financialData?.epsTrailingTwelveMonths?.fmt;
      if (eps) quote_table['EPS (TTM)'] = typeof eps === 'object' ? eps.fmt : eps;
    } catch {}

    // Income Statement & Cash Flow history maps
    const incomeHist: any[] = quoteSummary?.incomeStatementHistory?.incomeStatementHistory || [];
    const cashHist: any[] = quoteSummary?.cashflowStatementHistory?.cashflowStatements || [];

    const income_statement = { totalRevenue: statementToMap(incomeHist, 'totalRevenue') };
    const cash_flow = { totalCashFromOperatingActivities: statementToMap(cashHist, 'totalCashFromOperatingActivities') };

    // Stats array for margin extraction (prefetch looks for /Profit Margin|Operating Margin/i)
    const stats: Array<{ Attribute: string; Value: string }> = [];
    try {
      const pm = fmtPercent(financialData?.profitMargins?.raw ?? keyStats?.profitMargins?.raw);
      if (pm) stats.push({ Attribute: 'Profit Margin', Value: pm });
      const om = fmtPercent(financialData?.operatingMargins?.raw ?? keyStats?.operatingMargins?.raw);
      if (om) stats.push({ Attribute: 'Operating Margin', Value: om });
    } catch {}

    // Earnings history (EPS actual values)
    const earningsHistArr: any[] = quoteSummary?.earningsHistory?.history || [];
    const earnings_history = earningsHistArr.map(r => ({
      epsactual: r?.epsActual?.raw ?? r?.epsActual,
      eps_estimate: r?.epsEstimate?.raw ?? r?.epsEstimate
    })).filter(r => Number.isFinite(r.epsactual));

    // Simplified options (aggregate by strike to retain open interest & volume)
    let options: { calls: Array<any>; puts: Array<any> } | undefined = undefined;
    try {
      if (optChain && Array.isArray((optChain as any)?.options)) {
        const chain = (optChain as any).options[0];
        if (chain) {
          options = {
            calls: Array.isArray(chain.calls) ? chain.calls.map((c: any) => ({
              strike: c.strike?.raw ?? c.strike,
              openInterest: c.openInterest?.raw ?? c.openInterest,
              volume: c.volume?.raw ?? c.volume
            })) : [],
            puts: Array.isArray(chain.puts) ? chain.puts.map((p: any) => ({
              strike: p.strike?.raw ?? p.strike,
              openInterest: p.openInterest?.raw ?? p.openInterest,
              volume: p.volume?.raw ?? p.volume
            })) : []
          };
        }
      }
    } catch {}

    const compat: YFinCompat = {
      info,
      quote_table,
      income_statement,
      cash_flow,
      stats,
      earnings_history,
      options
    };

    return compat;
  } catch (err: any) {
    logger.warn({ err, symbol: sym }, 'fetch_yahoo_fin_failed');
    return { ok: false };
  }
}


