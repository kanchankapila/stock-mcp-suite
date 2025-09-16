export type SourceConfig = {
  name: string;                 // unique key
  label: string;                // card title
  urlTemplate: string;          // full URL with {symbol} placeholder
  tickerProvider: 'yahoo'|'mc'|'trendlyne'|'news'|'alpha'|'yFin';
  page: 'overview'|'insight'|'ai'|'watchlist'|'portfolio'|'alerts'|'settings'|'health';
  cardId: string;               // DOM id for card container
};

// Whitelist sources here. Add new sources by appending items to this array.
// Example uses Yahoo quoteSummary "price" module.
export const SOURCES: SourceConfig[] = [
  {
    name: 'yahoo_price',
    label: 'Yahoo Price (Source)',
    urlTemplate: 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=price',
    tickerProvider: 'yahoo',
    page: 'insight',
    cardId: 'src_yahoo_price'
  }
];

export function allowedHost(u: URL) {
  const host = (u.host || '').toLowerCase();
  return host.endsWith('finance.yahoo.com');
}

