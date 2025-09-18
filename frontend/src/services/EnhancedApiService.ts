/**
 * Enhanced API Service with advanced caching, performance optimization, and error handling
 */

import { Api } from '../app/services/api.service';

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum cache entries
  staleWhileRevalidate: boolean; // Serve stale data while fetching fresh
}

export interface ApiMetrics {
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  averageLatency: number;
  cacheHitRate: number;
}

export interface StockOverview {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  sector: string;
  industry: string;
}

export interface MarketData {
  indices: Array<{
    name: string;
    value: number;
    change: number;
    changePercent: number;
  }>;
  sectors: Array<{
    name: string;
    performance: number;
    volume: number;
    marketCap: number;
  }>;
  topGainers: StockOverview[];
  topLosers: StockOverview[];
  mostActive: StockOverview[];
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
}

class EnhancedApiService extends Api {
  private static instance: EnhancedApiService;
  private cache = new Map<string, CacheEntry>();
  private pendingRequests = new Map<string, Promise<any>>();
  private batchQueue = new Map<string, any[]>();
  private batchTimer: NodeJS.Timeout | null = null;
  
  // Performance metrics
  private metrics: ApiMetrics = {
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    averageLatency: 0,
    cacheHitRate: 0
  };
  
  private latencyHistory: number[] = [];
  private maxLatencyHistory = 100;
  
  // Default cache configurations
  private defaultCacheConfig: Record<string, CacheConfig> = {
    stockList: { ttl: 30 * 60 * 1000, maxSize: 1, staleWhileRevalidate: true }, // 30 min
    stockOverview: { ttl: 60 * 1000, maxSize: 50, staleWhileRevalidate: true }, // 1 min
    stockHistory: { ttl: 5 * 60 * 1000, maxSize: 20, staleWhileRevalidate: true }, // 5 min
    marketData: { ttl: 30 * 1000, maxSize: 5, staleWhileRevalidate: true }, // 30 sec
    news: { ttl: 5 * 60 * 1000, maxSize: 10, staleWhileRevalidate: true }, // 5 min
    analysis: { ttl: 10 * 60 * 1000, maxSize: 20, staleWhileRevalidate: true } // 10 min
  };
  
  private constructor() {
    super();
    this.initializeCacheCleanup();
  }
  
  static getInstance(): EnhancedApiService {
    if (!EnhancedApiService.instance) {
      EnhancedApiService.instance = new EnhancedApiService();
    }
    return EnhancedApiService.instance;
  }
  
  /**
   * Enhanced stock data fetching with caching
   */
  async getStockOverview(symbol: string, options?: { signal?: AbortSignal }): Promise<StockOverview> {
    const cacheKey = `overview:${symbol}`;
    
    return this.cachedRequest(
      cacheKey,
      () => super.overview(symbol, options),
      this.defaultCacheConfig.stockOverview
    );
  }
  
  /**
   * Batch stock data fetching for multiple symbols
   */
  async getBatchStockData(symbols: string[]): Promise<Map<string, StockOverview>> {
    const results = new Map<string, StockOverview>();
    const uncachedSymbols: string[] = [];
    
    // Check cache first
    for (const symbol of symbols) {
      const cacheKey = `overview:${symbol}`;
      const cached = this.getFromCache(cacheKey);
      
      if (cached && !this.isStale(cached)) {
        results.set(symbol, cached.data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }
    
    // Fetch uncached symbols in batches
    if (uncachedSymbols.length > 0) {
      const batchSize = 10;
      const batches = this.chunkArray(uncachedSymbols, batchSize);
      
      const promises = batches.map(async (batch) => {
        const batchPromises = batch.map(symbol => 
          this.getStockOverview(symbol).catch(error => ({ symbol, error }))
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && !result.value.error) {
            results.set(batch[index], result.value);
          }
        });
      });
      
      await Promise.allSettled(promises);
    }
    
    return results;
  }
  
  /**
   * Enhanced market data with aggregation
   */
  async getMarketData(): Promise<MarketData> {
    const cacheKey = 'marketData';
    
    return this.cachedRequest(
      cacheKey,
      async () => {
        const [indices, sectors, topPicks] = await Promise.allSettled([
          this.etIndices(),
          this.etSectorPerformance(),
          this.topPicks(60, 20)
        ]);
        
        // Process indices data
        const processedIndices = indices.status === 'fulfilled' ? 
          this.processIndicesData(indices.value) : [];
          
        // Process sector data
        const processedSectors = sectors.status === 'fulfilled' ? 
          this.processSectorData(sectors.value) : [];
          
        // Process top picks
        const { topGainers, topLosers, mostActive } = topPicks.status === 'fulfilled' ? 
          this.processTopPicks(topPicks.value) : { topGainers: [], topLosers: [], mostActive: [] };
        
        return {
          indices: processedIndices,
          sectors: processedSectors,
          topGainers,
          topLosers,
          mostActive
        };
      },
      this.defaultCacheConfig.marketData
    );
  }
  
  /**
   * Real-time data streaming with WebSocket fallback
   */
  subscribeToRealTimeData(symbols: string[], callback: (data: any) => void): () => void {
    let ws: WebSocket | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;
    
    // Try WebSocket first
    try {
      const wsUrl = this.getWebSocketUrl();
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected for real-time data');
        ws?.send(JSON.stringify({ type: 'subscribe', symbols }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          callback(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onerror = () => {
        console.warn('WebSocket error, falling back to polling');
        this.startPollingFallback(symbols, callback);
      };
      
    } catch (error) {
      console.warn('WebSocket not supported, using polling fallback');
      this.startPollingFallback(symbols, callback);
    }
    
    // Return cleanup function
    return () => {
      if (ws) {
        ws.close();
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }
  
  /**
   * Intelligent cache invalidation
   */
  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Get API performance metrics
   */
  getMetrics(): ApiMetrics {
    const totalCacheEntries = this.cache.size;
    const cacheHits = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.hits, 0);
    
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0 ? 
        (cacheHits / this.metrics.totalRequests) * 100 : 0
    };
  }
  
  /**
   * Prefetch critical data
   */
  async prefetchCriticalData(symbols: string[]): Promise<void> {
    const prefetchPromises = [
      this.getMarketData(),
      ...symbols.slice(0, 5).map(symbol => this.getStockOverview(symbol))
    ];
    
    try {
      await Promise.allSettled(prefetchPromises);
      console.log('Critical data prefetch completed');
    } catch (error) {
      console.error('Failed to prefetch critical data:', error);
    }
  }
  
  // Private methods
  
  private async cachedRequest<T>(
    key: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    this.metrics.totalRequests++;
    
    // Check cache first
    const cached = this.getFromCache(key);
    if (cached && !this.isStale(cached)) {
      cached.hits++;
      return cached.data;
    }
    
    // Serve stale data while revalidating
    if (config.staleWhileRevalidate && cached) {
      this.revalidateInBackground(key, fetchFn, config);
      cached.hits++;
      return cached.data;
    }
    
    // Deduplicate concurrent requests
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }
    
    const startTime = performance.now();
    const promise = fetchFn()
      .then((data) => {
        const latency = performance.now() - startTime;
        this.updateMetrics(latency, true);
        this.setCache(key, data, config);
        return data;
      })
      .catch((error) => {
        const latency = performance.now() - startTime;
        this.updateMetrics(latency, false);
        throw error;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });
    
    this.pendingRequests.set(key, promise);
    return promise;
  }
  
  private getFromCache(key: string): CacheEntry | null {
    return this.cache.get(key) || null;
  }
  
  private isStale(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
  
  private setCache(key: string, data: any, config: CacheConfig): void {
    // Check cache size limits
    if (this.cache.size >= config.maxSize) {
      this.evictLeastUsed();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
      hits: 0
    });
  }
  
  private evictLeastUsed(): void {
    let leastUsedKey = '';
    let leastHits = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < leastHits) {
        leastHits = entry.hits;
        leastUsedKey = key;
      }
    }
    
    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }
  
  private async revalidateInBackground<T>(
    key: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<void> {
    try {
      const data = await fetchFn();
      this.setCache(key, data, config);
    } catch (error) {
      console.error(`Background revalidation failed for ${key}:`, error);
    }
  }
  
  private updateMetrics(latency: number, success: boolean): void {
    if (success) {
      this.metrics.successRequests++;
    } else {
      this.metrics.errorRequests++;
    }
    
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }
    
    this.metrics.averageLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
  }
  
  private startPollingFallback(symbols: string[], callback: (data: any) => void): void {
    const pollInterval = setInterval(async () => {
      try {
        const data = await this.getBatchStockData(symbols);
        callback(Array.from(data.entries()).map(([symbol, overview]) => ({
          symbol,
          ...overview
        })));
      } catch (error) {
        console.error('Polling fallback error:', error);
      }
    }, 10000); // Poll every 10 seconds
  }
  
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    return `${protocol}//${host}:4010/ws`;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private processIndicesData(data: any): any[] {
    // Process indices data from ET API
    if (!data?.data) return [];
    
    return data.data.map((index: any) => ({
      name: index.name || index.symbol,
      value: parseFloat(index.price || index.value || 0),
      change: parseFloat(index.change || 0),
      changePercent: parseFloat(index.changePercent || index.pChange || 0)
    })).slice(0, 10); // Limit to top 10
  }
  
  private processSectorData(data: any): any[] {
    // Process sector performance data
    if (!data?.data) return [];
    
    return data.data.map((sector: any) => ({
      name: sector.name || sector.sector,
      performance: parseFloat(sector.performance || sector.change || 0),
      volume: parseInt(sector.volume || 0),
      marketCap: parseFloat(sector.marketCap || sector.mcap || 0)
    })).slice(0, 15); // Limit to top 15 sectors
  }
  
  private processTopPicks(data: any): { topGainers: StockOverview[], topLosers: StockOverview[], mostActive: StockOverview[] } {
    if (!data?.data) {
      return { topGainers: [], topLosers: [], mostActive: [] };
    }
    
    const stocks = Array.isArray(data.data) ? data.data : [];
    
    // Sort by performance
    const sorted = stocks.sort((a: any, b: any) => 
      parseFloat(b.changePercent || b.pChange || 0) - parseFloat(a.changePercent || a.pChange || 0)
    );
    
    return {
      topGainers: sorted.slice(0, 5),
      topLosers: sorted.slice(-5).reverse(),
      mostActive: stocks.sort((a: any, b: any) => 
        parseInt(b.volume || 0) - parseInt(a.volume || 0)
      ).slice(0, 5)
    };
  }
  
  private initializeCacheCleanup(): void {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl * 2) { // Double TTL for cleanup
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const enhancedApiService = EnhancedApiService.getInstance();
export default enhancedApiService;