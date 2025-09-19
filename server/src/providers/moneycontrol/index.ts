export { IndicesProvider } from './indices.provider.js';
export { StocksProvider } from './stocks.provider.js';

// Create provider instances with environment configuration
export const indicesProvider = new IndicesProvider();
export const stocksProvider = new StocksProvider();

// Export all providers in a single object
export const moneycontrolProviders = {
  indices: indicesProvider,
  stocks: stocksProvider
};

// Export default symbols for easy access
export const defaultSymbols = {
  MC_SYMBOL: process.env.DEFAULT_MC_SYMBOL || 'BE03',
  INDEX_ID: process.env.DEFAULT_INDEX_ID || '4',
  EXCHANGE: process.env.DEFAULT_EXCHANGE || 'N',
  PORTFOLIO_SYMBOLS: [
    process.env.STOCK_SYMBOL_1 || 'BE03',
    process.env.STOCK_SYMBOL_2 || 'TCS',
    process.env.STOCK_SYMBOL_3 || 'INFY',
    process.env.STOCK_SYMBOL_4 || 'RELIANCE',
    process.env.STOCK_SYMBOL_5 || 'HDFCBANK'
  ]
};

// Export provider configuration
export const providerConfig = {
  baseUrl: process.env.MONEYCONTROL_BASE_URL || 'https://api.moneycontrol.com',
  priceApiUrl: process.env.MONEYCONTROL_PRICE_API_URL || 'https://priceapi.moneycontrol.com',
  widgetUrl: process.env.MONEYCONTROL_WIDGET_URL || 'https://www.moneycontrol.com',
  timeout: parseInt(process.env.API_TIMEOUT || '10000'),
  retries: parseInt(process.env.API_RETRIES || '3'),
  appVersion: process.env.DEFAULT_APP_VERSION || '175'
};
