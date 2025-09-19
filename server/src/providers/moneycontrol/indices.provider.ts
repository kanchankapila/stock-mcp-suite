import { Provider, ProviderConfig } from '../provider.interface.js';

export class IndicesProvider implements Provider {
  name = 'MoneyControl-Indices';
  private config: ProviderConfig;

  constructor(config?: Partial<ProviderConfig>) {
    this.config = {
      baseUrl: process.env.MONEYCONTROL_BASE_URL || 'https://api.moneycontrol.com',
      timeout: parseInt(process.env.API_TIMEOUT || '10000'),
      retries: parseInt(process.env.API_RETRIES || '3'),
      ...config
    };
  }

  async getData(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(endpoint, this.config.baseUrl);
    
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
      console.log(`✅ ${this.name} - Success: ${endpoint}`);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-indices',
        endpoint
      };
    } catch (error) {
      console.error(`❌ ${this.name} - Error fetching ${endpoint}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        source: 'moneycontrol-indices',
        endpoint
      };
    }
  }

  // 📊 Indian Indices Overview
  async getIndianIndices(): Promise<any> {
    return this.getData('/mcapi/v1/indices/get-indian-indices');
  }

  // 📈 Index Details by ID
  async getIndicesDetails(indexId: string = process.env.DEFAULT_INDEX_ID || '4'): Promise<any> {
    return this.getData('/mcapi/v1/indices/get-indices-details', { indexId });
  }

  // 📋 Complete Indices List
  async getIndicesList(appVersion?: string): Promise<any> {
    const params = appVersion ? { appVersion } : {};
    return this.getData('/mcapi/v1/indices/get-indices-list', params);
  }

  // 📊 Indices List Basic (no version)
  async getIndicesListBasic(): Promise<any> {
    return this.getData('/mcapi/v1/indices/get-indices-list');
  }

  // 📈 Advance Decline Ratio
  async getAdvanceDecline(exchange: string = process.env.DEFAULT_EXCHANGE || 'N'): Promise<any> {
    return this.getData('/mcapi/v1/indices/chart/exchange-advdec', { ex: exchange });
  }

  // Legacy method name for backward compatibility
  async getExchangeAdvDec(exchange?: string): Promise<any> {
    return this.getAdvanceDecline(exchange);
  }

  // 🎯 Get All Indices Data (Comprehensive)
  async getAllIndicesData(): Promise<{
    indianIndices: any;
    indicesDetails: any;
    indicesList: any;
    indicesListBasic: any;
    advanceDecline: any;
    metadata: {
      timestamp: string;
      totalEndpoints: number;
      successful: number;
      failed: string[];
    };
  }> {
    const results: any = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalEndpoints: 5,
        successful: 0,
        failed: []
      }
    };

    const endpoints = [
      { name: 'indianIndices', method: () => this.getIndianIndices() },
      { name: 'indicesDetails', method: () => this.getIndicesDetails() },
      { name: 'indicesList', method: () => this.getIndicesList('175') },
      { name: 'indicesListBasic', method: () => this.getIndicesListBasic() },
      { name: 'advanceDecline', method: () => this.getAdvanceDecline() }
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
        console.error(`Error fetching ${endpoint.name}:`, error);
        results[endpoint.name] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString()
        };
        results.metadata.failed.push(endpoint.name);
      }
    }

    console.log(`📊 Indices Data Summary: ${results.metadata.successful}/${results.metadata.totalEndpoints} successful`);
    return results;
  }

  // Get configuration
  getConfig(): ProviderConfig {
    return this.config;
  }
}
