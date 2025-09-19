import axios from 'axios';
import { Provider } from '../provider.interface';

export interface IndicesConfig {
  defaultIndexId: string;
  defaultExchange: string;
  defaultAppVersion: string;
}

export class IndicesProvider implements Provider {
  name = 'moneycontrol-indices';
  description = 'MoneyControl Indices Data Provider';
  
  private baseUrl = 'https://api.moneycontrol.com';
  private config: IndicesConfig;

  constructor() {
    this.config = {
      defaultIndexId: process.env.DEFAULT_INDEX_ID || '4',
      defaultExchange: process.env.DEFAULT_EXCHANGE || 'N',
      defaultAppVersion: process.env.DEFAULT_APP_VERSION || '175'
    };
  }

  async getIndianIndices() {
    const url = `${this.baseUrl}/mcapi/v1/indices/get-indian-indices`;
    return this.makeRequest(url, 'indian-indices');
  }

  async getIndicesDetails(indexId?: string) {
    const id = indexId || this.config.defaultIndexId;
    const url = `${this.baseUrl}/mcapi/v1/indices/get-indices-details?indexId=${id}`;
    return this.makeRequest(url, `indices-details-${id}`);
  }

  async getIndicesList(appVersion?: string) {
    const version = appVersion || this.config.defaultAppVersion;
    const url = `${this.baseUrl}/mcapi/v1/indices/get-indices-list?appVersion=${version}`;
    return this.makeRequest(url, `indices-list-v${version}`);
  }

  async getIndicesListBasic() {
    const url = `${this.baseUrl}/mcapi/v1/indices/get-indices-list`;
    return this.makeRequest(url, 'indices-list-basic');
  }

  async getExchangeAdvDec(exchange?: string) {
    const ex = exchange || this.config.defaultExchange;
    const url = `${this.baseUrl}/mcapi/v1/indices/chart/exchange-advdec?ex=${ex}`;
    return this.makeRequest(url, `exchange-advdec-${ex}`);
  }

  private async makeRequest(url: string, cacheKey: string) {
    try {
      console.log(`[IndicesProvider] Fetching: ${url}`);
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
        source: 'moneycontrol-indices',
        cacheKey,
        url
      };
    } catch (error: any) {
      console.error(`[IndicesProvider] Error fetching ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-indices',
        cacheKey,
        url
      };
    }
  }

  getConfig() {
    return this.config;
  }
}