import { Provider, ProviderConfig } from '../provider.interface.js';

export class StocksProvider implements Provider {
  name = 'MoneyControl-Stocks';
  private config: ProviderConfig;
  private priceApiUrl: string;
  private widgetUrl: string;
  private stockSymbols: string[];

  constructor(config?: Partial<ProviderConfig>) {
    this.config = {
      baseUrl: process.env.MONEYCONTROL_BASE_URL || 'https://api.moneycontrol.com',
      timeout: parseInt(process.env.API_TIMEOUT || '10000'),
      retries: parseInt(process.env.API_RETRIES || '3'),
      ...config
    };
    
    this.priceApiUrl = process.env.MONEYCONTROL_PRICE_API_URL || 'https://priceapi.moneycontrol.com';
    this.widgetUrl = process.env.MONEYCONTROL_WIDGET_URL || 'https://www.moneycontrol.com';
    
    this.stockSymbols = [
      process.env.STOCK_SYMBOL_1 || 'BE03',
      process.env.STOCK_SYMBOL_2 || 'TCS',
      process.env.STOCK_SYMBOL_3 || 'INFY',
      process.env.STOCK_SYMBOL_4 || 'RELIANCE',
      process.env.STOCK_SYMBOL_5 || 'HDFCBANK'
    ];
  }

  async getData(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    // Determine which base URL to use based on endpoint
    let baseUrl = this.config.baseUrl;
    if (endpoint.includes('pricefeed')) {
      baseUrl = this.priceApiUrl;
    } else if (endpoint.includes('widget') || endpoint.includes('mc/widget') || endpoint.includes('company_info')) {
      baseUrl = this.widgetUrl;
    }

    const url = new URL(endpoint, baseUrl);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    console.log(`🔄 ${this.name} - Fetching: ${url.toString()}`);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.moneycontrol.com/',
          'Origin': 'https://www.moneycontrol.com'
        },
        signal: AbortSignal.timeout(this.config.timeout || 10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ ${this.name} - Success: ${endpoint} for symbol ${params.scId || params.symbol || 'default'}`);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-stocks',
        endpoint,
        symbol: params.scId || params.symbol || 'default'
      };
    } catch (error) {
      console.error(`❌ ${this.name} - Error fetching ${endpoint}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-stocks',
        endpoint,
        symbol: params.scId || params.symbol || 'default'
      };
    }
  }

  // 💰 Live Stock Price
  async getStockPrice(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData(`/pricefeed/nse/equitycash/${mcsymbol}`);
  }

  // 📊 Price & Volume Analysis
  async getStockPriceVolume(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/price-volume', {
      scId: mcsymbol,
      ex: '',
      appVersion: process.env.DEFAULT_APP_VERSION || '175'
    });
  }

  // 📈 VWAP Chart Data
  async getStockVWAP(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/stocks/company_info/get_vwap_chart_data.php', {
      classic: 'true',
      sc_did: mcsymbol
    });
  }

  // Legacy method name for backward compatibility
  async getVWAPChart(mcSymbol?: string): Promise<any> {
    return this.getStockVWAP(mcSymbol);
  }

  // 🏢 Financial Overview
  async getFinancialOverview(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/financial-historical/overview', {
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N'
    });
  }

  // 🔮 Price Forecast
  async getPriceForecast(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/price-forecast', {
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N',
      deviceType: 'W'
    });
  }

  // 👥 Analyst Consensus
  async getConsensus(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/consensus', {
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N',
      deviceType: 'W'
    });
  }

  // ⭐ Analyst Rating
  async getAnalystRating(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/analyst-rating', {
      deviceType: 'W',
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N'
    });
  }

  // 📊 Earning Forecast
  async getEarningForecast(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/earning-forecast', {
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N',
      deviceType: 'W',
      frequency: '12',
      financialType: 'C'
    });
  }

  // 💎 Stock Valuation
  async getValuation(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/valuation', {
      deviceType: 'W',
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N',
      financialType: 'C'
    });
  }

  // 🎯 Earnings Hits & Misses
  async getHitsMisses(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    return this.getData('/mcapi/v1/stock/estimates/hits-misses', {
      deviceType: 'W',
      scId: mcsymbol,
      ex: process.env.DEFAULT_EXCHANGE || 'N',
      type: 'eps',
      financialType: 'C'
    });
  }

  // 📈 Multiple Stocks Price Data
  async getAllStocksPrice(): Promise<Record<string, any>> {
    const results: Record<string, any> = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalStocks: this.stockSymbols.length,
        successful: 0,
        failed: []
      }
    };
    
    console.log(`🔄 Fetching prices for ${this.stockSymbols.length} stocks: ${this.stockSymbols.join(', ')}`);
    
    for (const symbol of this.stockSymbols) {
      try {
        const result = await this.getStockPrice(symbol);
        results[symbol] = result;
        if (result.success) {
          results.metadata.successful++;
        } else {
          results.metadata.failed.push(symbol);
        }
      } catch (error) {
        console.error(`❌ Error fetching price for ${symbol}:`, error);
        results[symbol] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString(),
          symbol
        };
        results.metadata.failed.push(symbol);
      }
    }
    
    return results;
  }

  // 📈 Multiple Stocks Price Volume Data
  async getAllStocksPriceVolume(): Promise<Record<string, any>> {
    const results: Record<string, any> = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalStocks: this.stockSymbols.length,
        successful: 0,
        failed: []
      }
    };
    
    for (const symbol of this.stockSymbols) {
      try {
        const result = await this.getStockPriceVolume(symbol);
        results[symbol] = result;
        if (result.success) {
          results.metadata.successful++;
        } else {
          results.metadata.failed.push(symbol);
        }
      } catch (error) {
        console.error(`❌ Error fetching price-volume for ${symbol}:`, error);
        results[symbol] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString(),
          symbol
        };
        results.metadata.failed.push(symbol);
      }
    }
    
    return results;
  }

  // 🎯 Complete Stock Analysis
  async getCompleteStockData(mcsymbol: string = process.env.DEFAULT_MC_SYMBOL || 'BE03'): Promise<any> {
    console.log(`🔄 Fetching complete data for ${mcsymbol}`);
    
    const results: any = {
      symbol: mcsymbol,
      metadata: {
        timestamp: new Date().toISOString(),
        totalEndpoints: 10,
        successful: 0,
        failed: []
      }
    };

    const endpoints = [
      { name: 'price', method: () => this.getStockPrice(mcsymbol) },
      { name: 'volume', method: () => this.getStockPriceVolume(mcsymbol) },
      { name: 'vwap', method: () => this.getStockVWAP(mcsymbol) },
      { name: 'financial', method: () => this.getFinancialOverview(mcsymbol) },
      { name: 'forecast', method: () => this.getPriceForecast(mcsymbol) },
      { name: 'consensus', method: () => this.getConsensus(mcsymbol) },
      { name: 'rating', method: () => this.getAnalystRating(mcsymbol) },
      { name: 'earnings', method: () => this.getEarningForecast(mcsymbol) },
      { name: 'valuation', method: () => this.getValuation(mcsymbol) },
      { name: 'hitsMisses', method: () => this.getHitsMisses(mcsymbol) }
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await endpoint.method();
        results[endpoint.name] = result;
        if (result.success) {
          results.metadata.successful++;
        } else {
          results.metadata.failed.push(endpoint.name);
        }
      } catch (error) {
        console.error(`❌ Error fetching ${endpoint.name} for ${mcsymbol}:`, error);
        results[endpoint.name] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString()
        };
        results.metadata.failed.push(endpoint.name);
      }
    }

    console.log(`📊 ${mcsymbol} Data Summary: ${results.metadata.successful}/${results.metadata.totalEndpoints} successful`);
    return results;
  }

  // Get stock symbols list
  getStockSymbols(): string[] {
    return this.stockSymbols;
  }

  // Get configuration
  getConfig(): ProviderConfig & { stockSymbols: string[] } {
    return {
      ...this.config,
      stockSymbols: this.stockSymbols
    };
  }
}
