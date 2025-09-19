export interface Provider {
  name: string;
  getData(endpoint: string, params?: Record<string, any>): Promise<any>;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export interface StockData {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  timestamp: string;
}

export interface IndicesData {
  name: string;
  value?: number;
  change?: number;
  changePercent?: number;
  timestamp: string;
}
