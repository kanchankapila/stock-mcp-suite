export interface Stock {
  name: string;
  symbol: string;
  mcsymbol: string;
  isin: string;
  tlid?: string;
  tlname?: string;
  stockid?: string;
  companyid?: string;
}

export interface StockDropdownOptions {
  placeholder?: string;
  searchable?: boolean;
  maxHeight?: string;
  showMcSymbol?: boolean;
  defaultValue?: string;
  maxResults?: number;
}

export type StockChangeCallback = (stock: Stock) => void;

export interface StockData {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  timestamp: string;
}

export interface StockApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  symbol?: string;
  endpoint?: string;
  timestamp: string;
}

export interface MoneyControlConfig {
  baseUrl: string;
  currentSymbol: string;
  timeout: number;
}
