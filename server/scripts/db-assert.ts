import { listPrices, listNews } from '../src/db.js';

type Opts = { symbol: string; minPrices: number; minNews: number };

function parseArgs(argv: string[]): Opts | null {
  const get = (name: string, short?: string) => {
    const prefLong = `--${name}=`;
    const prefShort = short ? `-${short}=` : null;
    for (const a of argv) {
      if (a.startsWith(prefLong)) return a.slice(prefLong.length);
      if (prefShort && a.startsWith(prefShort)) return a.slice(prefShort.length);
    }
    return null;
  };
  const symbol = (get('symbol', 's') || process.env.SYMBOL || '').toUpperCase();
  const minPrices = Number(get('min-prices') || process.env.MIN_PRICES || 1);
  const minNews = Number(get('min-news') || process.env.MIN_NEWS || 1);
  if (!symbol) return null;
  return { symbol, minPrices, minNews };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    console.error('Usage: node scripts/db-assert.ts --symbol=SYMB [--min-prices=1] [--min-news=1]');
    process.exitCode = 1;
    return;
  }

  const { symbol, minPrices, minNews } = opts;
  console.log(`[db-assert] Checking symbol=${symbol} minPrices=${minPrices} minNews=${minNews}`);

  const prices = listPrices(symbol, 10000);
  const news = listNews(symbol, 10000);

  console.log(`[db-assert] Found prices=${prices.length}, news=${news.length}`);

  if (prices.length < minPrices) {
    console.error(`[db-assert] FAIL: prices < ${minPrices}`);
    process.exitCode = 1;
    return;
  }
  if (news.length < minNews) {
    console.error(`[db-assert] FAIL: news < ${minNews}`);
    process.exitCode = 1;
    return;
  }

  // Optional: verify price dates sorted asc
  const dates = prices.map((p: any) => p.date);
  const isSorted = dates.every((d, i) => i === 0 || d >= dates[i - 1]);
  if (!isSorted) {
    console.error('[db-assert] FAIL: prices are not sorted by date ASC');
    process.exitCode = 1;
    return;
  }

  console.log('[db-assert] OK');
}

main();

