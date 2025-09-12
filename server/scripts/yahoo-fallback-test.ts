import yahooFinance from 'yahoo-finance2';
import { fetchYahooDaily } from '../src/providers/yahoo.js';

(async () => {
  const symbol = process.argv[2] || 'RELIANCE.NS';
  // Force the primary library path to throw so we exercise fallback HTTP implementation
  const originalChart = (yahooFinance as any).chart;
  (yahooFinance as any).chart = async () => { throw new Error('forced_chart_failure_for_fallback_test'); };
  try {
    const chart = await fetchYahooDaily(symbol, '1mo', '1d');
    const points = Array.isArray(chart?.timestamp) ? chart.timestamp.length : 0;
    console.log(JSON.stringify({ ok: true, forcedFail: true, symbol, points, hasQuoteArray: !!chart?.indicators?.quote }));
  } catch (err:any) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    process.exit(1);
  } finally {
    (yahooFinance as any).chart = originalChart;
  }
})();