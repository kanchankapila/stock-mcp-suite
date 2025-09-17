/**
 * Centralized API service with intelligent caching, error handling, and performance optimization
 */

export interface CacheEntry {
  data: any;
  expiry: number;
  etag?: string;
}

export interface ApiConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  cacheEnabled?: boolean;
}

export class ApiService {
  private cache = new Map<string, CacheEntry>();
  private requestQueue = new Map<string, Promise<any>>();
  private config: Required<ApiConfig>;
  private abortControllers = new Map<string, AbortController>();

  constructor(config: ApiConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || '/api',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      cacheEnabled: config.cacheEnabled ?? true
    };
  }

  /**
   * Fetch data with intelligent caching
   */
  async fetch<T>(endpoint: string, options: RequestInit & { 
    ttl?: number; 
    skipCache?: boolean;
    retries?: number;
    abortKey?: string;
  } = {}): Promise<T> {
    const {
      ttl = 300000, // 5 minutes default
      skipCache = false,
      retries = this.config.retries,
      abortKey,
      ...fetchOptions
    } = options;

    const url = `${this.config.baseUrl}${endpoint}`;
    const cacheKey = this.getCacheKey(url, fetchOptions);

    // Handle request deduplication
    if (this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey)!;
    }

    // Check cache first
    if (this.config.cacheEnabled && !skipCache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Create abort controller for request cancellation
    const abortController = new AbortController();
    if (abortKey) {
      // Cancel previous request with same key
      this.abortControllers.get(abortKey)?.abort();
      this.abortControllers.set(abortKey, abortController);
    }

    const requestPromise = this.executeRequest<T>(url, {
      ...fetchOptions,
      signal: abortController.signal,
      timeout: this.config.timeout
    }, retries);

    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful results
      if (this.config.cacheEnabled && !skipCache) {
        this.setCache(cacheKey, result, ttl);
      }

      return result;
    } finally {
      this.requestQueue.delete(cacheKey);
      if (abortKey) {
        this.abortControllers.delete(abortKey);
      }
    }
  }

  /**
   * Execute HTTP request with retry logic
   */
  private async executeRequest<T>(url: string, options: RequestInit & { timeout: number }, retries: number): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const timeoutId = setTimeout(() => {
          (options.signal as AbortSignal)?.dispatchEvent?.(new Event('abort'));
        }, options.timeout);

        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on abort or client errors
        if (error.name === 'AbortError' || (error.status && error.status < 500)) {
          throw error;
        }

        // Exponential backoff for retries
        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Stock-specific API methods
   */
  async getStockOverview(symbol: string, options?: { ttl?: number }) {
    return this.fetch(`/stocks/${symbol}/overview`, { ttl: options?.ttl || 60000 });
  }

  async getStockHistory(symbol: string, days: number = 30, options?: { ttl?: number }) {
    return this.fetch(`/stocks/${symbol}/history?days=${days}`, { ttl: options?.ttl || 300000 });
  }

  async getStockNews(symbol: string, limit: number = 10, options?: { ttl?: number }) {
    return this.fetch(`/stocks/${symbol}/news?limit=${limit}`, { ttl: options?.ttl || 600000 });
  }

  async analyzeStock(symbol: string, options?: { ttl?: number }) {
    return this.fetch(`/stocks/${symbol}/analyze`, { ttl: options?.ttl || 300000 });
  }

  async getMarketData(options?: { ttl?: number }) {
    return this.fetch('/market/overview', { ttl: options?.ttl || 300000 });
  }

  async ragQuery(namespace: string, query: string, options?: { k?: number; withAnswer?: boolean }) {
    return this.fetch('/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace,
        query,
        k: options?.k || 5,
        with_answer: options?.withAnswer ?? true
      }),
      ttl: 0 // Don't cache RAG queries
    });
  }

  async runBacktest(symbol: string, strategy: string, options?: any) {
    return this.fetch('/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        strategy,
        ...options
      }),
      ttl: 600000 // Cache for 10 minutes
    });
  }

  /**
   * Cache management
   */
  private getCacheKey(url: string, options: RequestInit): string {
    const key = `${url}:${JSON.stringify(options.body || '')}`;
    return btoa(key).replace(/[+/=]/g, '');
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || entry.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });

    // Clean up expired entries periodically
    if (this.cache.size % 100 === 0) {
      this.cleanExpiredCache();
    }
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Utility methods
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.requestQueue.clear();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: this.calculateHitRate(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private calculateHitRate(): number {
    // This would require hit/miss tracking in a real implementation
    return 0;
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of cache memory usage
    let size = 0;
    for (const entry of this.cache.values()) {
      size += JSON.stringify(entry).length * 2; // Rough UTF-16 estimation
    }
    return size;
  }
}

// Export singleton instance
export const apiService = new ApiService();
