import { logger } from './logger.js';

/**
 * High-performance in-memory cache with TTL support
 * Implements LRU eviction and automatic cleanup
 */
export class PerformanceCache {
  private cache = new Map<string, { data: any; expires: number; accessCount: number; lastAccessed: number }>();
  private maxSize: number;
  private defaultTtl: number;
  private cleanupInterval: NodeJS.Timer;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    cleanups: 0
  };

  constructor(maxSize: number = 1000, defaultTtlMs: number = 300000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtlMs;
    
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access stats for LRU
    item.accessCount++;
    item.lastAccessed = Date.now();
    this.stats.hits++;
    
    return item.data;
  }

  set(key: string, data: any, ttlMs?: number): void {
    const expires = Date.now() + (ttlMs || this.defaultTtl);
    
    // Check if we need to evict items
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      expires,
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, cleanups: 0 };
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    return item !== undefined && Date.now() <= item.expires;
  }

  size(): number {
    return this.cache.size;
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;
    
    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + '%',
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    let lowestCount = Infinity;
    
    for (const [key, item] of this.cache) {
      // Prefer items with lower access count and older last access time
      if (item.accessCount < lowestCount || 
          (item.accessCount === lowestCount && item.lastAccessed < oldestTime)) {
        oldestKey = key;
        oldestTime = item.lastAccessed;
        lowestCount = item.accessCount;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache) {
      if (now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    this.stats.cleanups += cleaned;
    
    if (cleaned > 0) {
      logger.debug({ cleaned, remaining: this.cache.size }, 'cache_cleanup_completed');
    }
  }

  private estimateMemoryUsage(): string {
    let size = 0;
    
    for (const [key, item] of this.cache) {
      size += key.length * 2; // String chars are 2 bytes
      size += JSON.stringify(item.data).length * 2;
      size += 32; // Overhead for object structure
    }
    
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// Global cache instances
export const priceCache = new PerformanceCache(500, 60000);     // 1 minute for prices
export const newsCache = new PerformanceCache(200, 300000);     // 5 minutes for news
export const analyticsCache = new PerformanceCache(100, 600000); // 10 minutes for analytics
export const overviewCache = new PerformanceCache(300, 120000);  // 2 minutes for overviews

// Utility functions for common cache patterns
export function getCachedOrCompute<T>(
  cache: PerformanceCache,
  key: string,
  computeFn: () => Promise<T> | T,
  ttlMs?: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }
  
  const result = computeFn();
  
  if (result instanceof Promise) {
    return result.then(data => {
      cache.set(key, data, ttlMs);
      return data;
    });
  } else {
    cache.set(key, result, ttlMs);
    return Promise.resolve(result);
  }
}

// Export cache stats for monitoring
export function getAllCacheStats() {
  return {
    price: priceCache.getStats(),
    news: newsCache.getStats(),
    analytics: analyticsCache.getStats(),
    overview: overviewCache.getStats()
  };
}
