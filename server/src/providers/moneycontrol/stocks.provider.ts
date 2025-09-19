import axios from 'axios';
import { Provider } from '../provider.interface';

export interface StocksConfig {
  defaultMcSymbol: string;
  defaultExchange: string;
  stockSymbols: string[];
  defaultAppVersion: string;
  defaultDeviceType: string;
}

export class StocksProvider implements Provider {
  name = 'moneycontrol-stocks';
  description = 'MoneyControl Stock Data Provider';
  
  private baseUrl = 'https://api.moneycontrol.com';
  private priceApiUrl = 'https://priceapi.moneycontrol.com';
  private widgetUrl = 'https://www.moneycontrol.com';
  private config: StocksConfig;

  constructor() {
    this.config = {
      defaultMcSymbol: process.env.DEFAULT_MC_SYMBOL || 'BE03',
      defaultExchange: process.env.DEFAULT_EXCHANGE || 'N',
      stockSymbols: [
        process.env.STOCK_SYMBOL_1 || 'BE03',
        process.env.STOCK_SYMBOL_2 || 'TCS',
        process.env.STOCK_SYMBOL_3 || 'INFY',
        process.env.STOCK_SYMBOL_4 || 'RELIANCE',
        process.env.STOCK_SYMBOL_5 || 'HDFCBANK'
      ],
      defaultAppVersion: process.env.DEFAULT_APP_VERSION || '175',
      defaultDeviceType: process.env.DEFAULT_DEVICE_TYPE || 'W'
    };
  }

  // Stock Price APIs
  async getStockPrice(mcSymbol?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const url = `${this.priceApiUrl}/pricefeed/nse/equitycash/${symbol}`;
    return this.makeRequest(url, `stock-price-${symbol}`);
  }

  async getStockPriceVolume(mcSymbol?: string, exchange?: string, appVersion?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const version = appVersion || this.config.defaultAppVersion;
    const url = `${this.baseUrl}/mcapi/v1/stock/price-volume?scId=${symbol}&ex=${ex}&appVersion=${version}`;
    return this.makeRequest(url, `price-volume-${symbol}`);
  }

  async getVWAPChart(mcSymbol?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const url = `${this.widgetUrl}/stocks/company_info/get_vwap_chart_data.php?classic=true&sc_did=${symbol}`;
    return this.makeRequest(url, `vwap-chart-${symbol}`);
  }

  async getFinancialOverview(mcSymbol?: string, exchange?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const url = `${this.baseUrl}/mcapi/v1/stock/financial-historical/overview?scId=${symbol}&ex=${ex}`;
    return this.makeRequest(url, `financial-overview-${symbol}`);
  }

  async getPriceForecast(mcSymbol?: string, exchange?: string, deviceType?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/price-forecast?scId=${symbol}&ex=${ex}&deviceType=${device}`;
    return this.makeRequest(url, `price-forecast-${symbol}`);
  }

  async getConsensus(mcSymbol?: string, exchange?: string, deviceType?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/consensus?scId=${symbol}&ex=${ex}&deviceType=${device}`;
    return this.makeRequest(url, `consensus-${symbol}`);
  }

  async getAnalystRating(mcSymbol?: string, exchange?: string, deviceType?: string) {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/analyst-rating?deviceType=${device}&scId=${symbol}&ex=${ex}`;
    return this.makeRequest(url, `analyst-rating-${symbol}`);
  }

  async getEarningForecast(mcSymbol?: string, exchange?: string, deviceType?: string, frequency = '12', financialType = 'C') {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/earning-forecast?scId=${symbol}&ex=${ex}&deviceType=${device}&frequency=${frequency}&financialType=${financialType}`;
    return this.makeRequest(url, `earning-forecast-${symbol}`);
  }

  async getValuation(mcSymbol?: string, exchange?: string, deviceType?: string, financialType = 'C') {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/valuation?deviceType=${device}&scId=${symbol}&ex=${ex}&financialType=${financialType}`;
    return this.makeRequest(url, `valuation-${symbol}`);
  }

  async getHitsMisses(mcSymbol?: string, exchange?: string, deviceType?: string, type = 'eps', financialType = 'C') {
    const symbol = mcSymbol || this.config.defaultMcSymbol;
    const ex = exchange || this.config.defaultExchange;
    const device = deviceType || this.config.defaultDeviceType;
    const url = `${this.baseUrl}/mcapi/v1/stock/estimates/hits-misses?deviceType=${device}&scId=${symbol}&ex=${ex}&type=${type}&financialType=${financialType}`;
    return this.makeRequest(url, `hits-misses-${symbol}`);
  }

  // Multi-symbol data fetching
  async getAllStocksPrice() {
    const results = await Promise.allSettled(
      this.config.stockSymbols.map(symbol => this.getStockPrice(symbol))
    );
    return this.formatMultiResults(results, 'all-stocks-price');
  }

  async getAllStocksPriceVolume() {
    const results = await Promise.allSettled(
      this.config.stockSymbols.map(symbol => this.getStockPriceVolume(symbol))
    );
    return this.formatMultiResults(results, 'all-stocks-price-volume');
  }

  private formatMultiResults(results: PromiseSettledResult<any>[], cacheKey: string) {
    const successful = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);
      
    const failed = results
      .filter(result => result.status === 'rejected')
      .map(result => (result as PromiseRejectedResult).reason);

    return {
      success: failed.length === 0,
      data: successful,
      errors: failed,
      timestamp: new Date().toISOString(),
      source: 'moneycontrol-stocks',
      cacheKey,
      total: results.length,
      successful: successful.length,
      failed: failed.length
    };
  }

  private async makeRequest(url: string, cacheKey: string) {
    try {
      console.log(`[StocksProvider] Fetching: ${url}`);
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.moneycontrol.com/',
          'Origin': 'https://www.moneycontrol.com'
        }
      });
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-stocks',
        cacheKey,
        url
      };
    } catch (error: any) {
      console.error(`[StocksProvider] Error fetching ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-stocks',
        cacheKey,
        url
      };
    }
  }

  getStockSymbols(): string[] {
    return this.config.stockSymbols;
  }

  getConfig() {
    return this.config;
  }
}