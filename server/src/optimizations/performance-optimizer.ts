/**
 * Performance Optimizer for Stock MCP Suite Server
 * Comprehensive optimizations for database, caching, and API performance
 */

import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import NodeCache from 'node-cache';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';

export class PerformanceOptimizer {
  private db: Database.Database;
  private memoryCache: LRUCache<string, any>;
  private apiCache: NodeCache;
  private queryCache: Map<string, { data: any; timestamp: number }> = new Map();
  
  constructor(database: Database.Database) {
    this.db = database;
    this.initializeCaching();
    this.optimizeDatabase();
  }

  /**
   * Initialize multi-level caching system
   */
  private initializeCaching(): void {
    // Memory cache for frequently accessed data
    this.memoryCache = new LRUCache<string, any>({
      max: 1000, // Maximum 1000 items
      ttl: 1000 * 60 * 15, // 15 minutes TTL
      allowStale: true,
      updateAgeOnGet: true,
      fetchMethod: async (key: string) => {
        // Auto-fetch from database if not in cache
        return this.fetchFromDatabase(key);
      }
    });

    // API response cache
    this.apiCache = new NodeCache({
      stdTTL: 600, // 10 minutes default TTL
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Better performance, but be careful with object mutations
      maxKeys: 5000
    });

    // Setup cache event listeners
    this.apiCache.on('expired', (key, value) => {
      console.debug(`Cache expired for key: ${key}`);
    });

    this.apiCache.on('set', (key, value) => {
      console.debug(`Cache set for key: ${key}`);
    });
  }

  /**
   * Optimize database with indexes and pragmas
   */
  private optimizeDatabase(): void {
    try {
      // SQLite performance pragmas
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
      this.db.pragma('synchronous = NORMAL'); // Balance safety and performance
      this.db.pragma('cache_size = 10000'); // 10MB cache
      this.db.pragma('temp_store = MEMORY'); // Store temp data in memory
      this.db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O
      this.db.pragma('page_size = 4096'); // Optimize page size
      this.db.pragma('auto_vacuum = INCREMENTAL'); // Efficient space reclamation

      // Create performance indexes if they don't exist
      this.createPerformanceIndexes();

      console.log('✅ Database performance optimizations applied');
    } catch (error) {
      console.error('❌ Failed to apply database optimizations:', error);
    }
  }

  /**
   * Create indexes for better query performance
   */
  private createPerformanceIndexes(): void {
    const indexes = [
      // Price data indexes
      'CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices(symbol, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_prices_volume ON prices(volume DESC)',
      
      // News data indexes
      'CREATE INDEX IF NOT EXISTS idx_news_symbol_date ON news(symbol, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_news_sentiment ON news(sentiment)',
      'CREATE INDEX IF NOT EXISTS idx_news_source ON news(source)',
      
      // Features data indexes
      'CREATE INDEX IF NOT EXISTS idx_features_symbol_date ON features(symbol, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_features_rsi ON features(rsi)',
      'CREATE INDEX IF NOT EXISTS idx_features_sma20 ON features(sma20)',
      
      // RAG embeddings indexes
      'CREATE INDEX IF NOT EXISTS idx_rag_embeddings_ns ON rag_embeddings(ns)',
      'CREATE INDEX IF NOT EXISTS idx_rag_embeddings_created ON rag_embeddings(created_at DESC)',
      
      // Provider runs indexes
      'CREATE INDEX IF NOT EXISTS idx_provider_runs_provider_date ON provider_runs(provider_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_provider_runs_status ON provider_runs(status)',
      
      // Composite indexes for common queries
      'CREATE INDEX IF NOT EXISTS idx_prices_composite ON prices(symbol, date DESC, close)',
      'CREATE INDEX IF NOT EXISTS idx_news_composite ON news(symbol, date DESC, sentiment)',
      'CREATE INDEX IF NOT EXISTS idx_features_composite ON features(symbol, date DESC, rsi, sma20)',
    ];

    const stmt = this.db.prepare('SELECT name FROM sqlite_master WHERE type="index" AND name = ?');
    
    indexes.forEach((indexSQL) => {
      try {
        this.db.exec(indexSQL);
      } catch (error) {
        console.warn(`Index creation warning: ${error.message}`);
      }
    });

    console.log('✅ Performance indexes created/verified');
  }

  /**
   * Intelligent query caching with automatic invalidation
   */
  public async getCachedQuery<T>(key: string, queryFn: () => T, ttl: number = 300000): Promise<T> {
    const cached = this.queryCache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < ttl) {
      return cached.data;
    }

    const result = await queryFn();
    this.queryCache.set(key, { data: result, timestamp: Date.now() });
    
    // Cleanup old entries periodically
    if (this.queryCache.size > 1000) {
      this.cleanupQueryCache(ttl);
    }
    
    return result;
  }

  /**
   * Cache stock overview data with intelligent TTL
   */
  public async getCachedStockOverview(symbol: string): Promise<any> {
    const cacheKey = `stock_overview_${symbol}`;
    
    // Check memory cache first
    let data = this.memoryCache.get(cacheKey);
    if (data) return data;
    
    // Check API cache
    data = this.apiCache.get(cacheKey);
    if (data) {
      this.memoryCache.set(cacheKey, data); // Promote to memory cache
      return data;
    }
    
    // Fetch from database with optimized query
    data = await this.fetchStockOverviewFromDB(symbol);
    
    if (data) {
      // Cache with market hours-aware TTL
      const ttl = this.getMarketAwareTTL();
      this.memoryCache.set(cacheKey, data, { ttl });
      this.apiCache.set(cacheKey, data, ttl / 1000);
    }
    
    return data;
  }

  /**
   * Optimized stock overview query
   */
  private async fetchStockOverviewFromDB(symbol: string): Promise<any> {
    const query = `
      SELECT 
        p.symbol,
        p.close as currentPrice,
        p.volume,
        p.high,
        p.low,
        p.open,
        LAG(p.close, 1) OVER (PARTITION BY p.symbol ORDER BY p.date) as prevClose,
        f.market_cap,
        f.pe_ratio,
        f.rsi,
        f.sma20,
        f.sma50
      FROM prices p
      LEFT JOIN features f ON p.symbol = f.symbol AND p.date = f.date
      WHERE p.symbol = ? 
      ORDER BY p.date DESC 
      LIMIT 1
    `;
    
    const stmt = this.db.prepare(query);
    const result = stmt.get(symbol);
    
    if (result) {
      // Calculate derived metrics
      result.change = result.currentPrice - (result.prevClose || result.currentPrice);
      result.changePercent = result.prevClose ? (result.change / result.prevClose) * 100 : 0;
    }
    
    return result;
  }

  /**
   * Batch data fetching for multiple symbols
   */
  public async batchFetchStockData(symbols: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const uncachedSymbols: string[] = [];
    
    // Check cache for each symbol first
    symbols.forEach(symbol => {
      const cached = this.memoryCache.get(`stock_overview_${symbol}`);
      if (cached) {
        results.set(symbol, cached);
      } else {
        uncachedSymbols.push(symbol);
      }
    });
    
    // Batch fetch uncached symbols
    if (uncachedSymbols.length > 0) {
      const placeholders = uncachedSymbols.map(() => '?').join(',');
      const query = `
        SELECT DISTINCT
          p.symbol,
          p.close as currentPrice,
          p.volume,
          p.change,
          p.change_percent as changePercent,
          f.market_cap,
          f.pe_ratio,
          f.rsi
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
          FROM prices 
          WHERE symbol IN (${placeholders})
        ) p
        LEFT JOIN features f ON p.symbol = f.symbol AND p.date = f.date
        WHERE p.rn = 1
      `;
      
      const stmt = this.db.prepare(query);
      const batchResults = stmt.all(...uncachedSymbols);
      
      // Cache and store results
      batchResults.forEach((row: any) => {
        const cacheKey = `stock_overview_${row.symbol}`;
        this.memoryCache.set(cacheKey, row);
        results.set(row.symbol, row);
      });
    }
    
    return results;
  }

  /**
   * Market-aware TTL calculation
   */
  private getMarketAwareTTL(): number {
    const now = new Date();
    const hour = now.getHours();
    
    // Shorter TTL during market hours (9 AM - 4 PM IST)
    if (hour >= 9 && hour <= 16) {
      return 60000; // 1 minute during market hours
    } else {
      return 300000; // 5 minutes outside market hours
    }
  }

  /**
   * Cleanup old cache entries
   */
  private cleanupQueryCache(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    const keysToDelete: string[] = [];
    
    for (const [key, value] of this.queryCache.entries()) {
      if (value.timestamp < cutoff) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.queryCache.delete(key));
    console.debug(`Cleaned up ${keysToDelete.length} expired cache entries`);
  }

  /**
   * Precompute and cache common aggregations
   */
  public async precomputeAggregations(): Promise<void> {
    const aggregations = [
      {
        key: 'market_overview',
        query: `
          SELECT 
            COUNT(DISTINCT symbol) as total_stocks,
            AVG(change_percent) as avg_change,
            SUM(CASE WHEN change_percent > 0 THEN 1 ELSE 0 END) as gainers,
            SUM(CASE WHEN change_percent < 0 THEN 1 ELSE 0 END) as losers
          FROM (
            SELECT symbol, change_percent,
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
            FROM prices WHERE date >= date('now', '-1 day')
          ) WHERE rn = 1
        `
      },
      {
        key: 'sector_performance',
        query: `
          SELECT 
            'Technology' as sector,
            AVG(change_percent) as avg_change,
            COUNT(*) as count
          FROM prices p
          WHERE date >= date('now', '-1 day')
          AND symbol IN ('AAPL', 'GOOGL', 'MSFT', 'NVDA')
        `
      }
    ];
    
    for (const agg of aggregations) {
      try {
        const stmt = this.db.prepare(agg.query);
        const result = stmt.all();
        this.apiCache.set(agg.key, result, 3600); // Cache for 1 hour
      } catch (error) {
        console.error(`Failed to precompute ${agg.key}:`, error);
      }
    }
    
    console.log('✅ Precomputed aggregations cached');
  }

  /**
   * Database maintenance and optimization
   */
  public async performMaintenance(): Promise<void> {
    try {
      console.log('🔧 Starting database maintenance...');
      
      // Analyze query patterns for optimization
      this.db.exec('ANALYZE');
      
      // Incremental vacuum to reclaim space
      this.db.exec('PRAGMA incremental_vacuum(1000)');
      
      // Update table statistics
      this.db.exec('PRAGMA optimize');
      
      // Clear old temporary data
      const deleteOldData = `
        DELETE FROM provider_runs 
        WHERE created_at < datetime('now', '-30 days') 
        AND status = 'completed'
      `;
      this.db.exec(deleteOldData);
      
      console.log('✅ Database maintenance completed');
    } catch (error) {
      console.error('❌ Database maintenance failed:', error);
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): any {
    return {
      memoryCache: {
        size: this.memoryCache.size,
        max: this.memoryCache.max,
        calculatedSize: this.memoryCache.calculatedSize,
        remainingTTL: this.memoryCache.remainingTTL
      },
      apiCache: {
        keys: this.apiCache.keys().length,
        stats: this.apiCache.getStats()
      },
      queryCache: {
        size: this.queryCache.size,
        keys: Array.from(this.queryCache.keys())
      }
    };
  }

  /**
   * Express middleware for caching API responses
   */
  public createCacheMiddleware(ttl: number = 300) {
    return (req: any, res: any, next: any) => {
      const key = `api_${req.method}_${req.originalUrl}`;
      const cached = this.apiCache.get(key);
      
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
      
      res.setHeader('X-Cache', 'MISS');
      
      // Store the original json function
      const originalJson = res.json;
      
      // Override json function to cache the response
      res.json = (data: any) => {
        if (res.statusCode === 200) {
          this.apiCache.set(key, data, ttl);
        }
        return originalJson.call(res, data);
      };
      
      next();
    };
  }

  /**
   * Async method to fetch data from database (used by LRU cache)
   */
  private async fetchFromDatabase(key: string): Promise<any> {
    // Parse the key to determine what to fetch
    if (key.startsWith('stock_overview_')) {
      const symbol = key.replace('stock_overview_', '');
      return this.fetchStockOverviewFromDB(symbol);
    }
    
    return null;
  }

  /**
   * Warmup cache with popular symbols
   */
  public async warmupCache(popularSymbols: string[] = ['BEL', 'AAPL', 'TSLA', 'GOOGL', 'MSFT']): Promise<void> {
    console.log('🔥 Warming up cache with popular symbols...');
    
    const batchData = await this.batchFetchStockData(popularSymbols);
    console.log(`✅ Warmed up cache for ${batchData.size} symbols`);
    
    // Precompute aggregations
    await this.precomputeAggregations();
  }

  /**
   * Create Express router with all optimizations
   */
  public createOptimizedRouter(): Router {
    const router = Router();
    
    // Security middleware
    router.use(helmet({
      contentSecurityPolicy: false, // Allow inline scripts for charts
      crossOriginEmbedderPolicy: false
    }));
    
    // Compression middleware
    router.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
      level: 6, // Balanced compression level
      threshold: 1024 // Only compress responses > 1KB
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    });
    router.use(limiter);
    
    // Cache middleware for GET requests
    router.use((req, res, next) => {
      if (req.method === 'GET') {
        return this.createCacheMiddleware(300)(req, res, next);
      }
      next();
    });
    
    // Health check endpoint
    router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cache: this.getCacheStats(),
        database: {
          pragma: {
            journal_mode: this.db.pragma('journal_mode', { simple: true }),
            cache_size: this.db.pragma('cache_size', { simple: true }),
            page_count: this.db.pragma('page_count', { simple: true })
          }
        }
      });
    });
    
    return router;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.memoryCache.clear();
    this.apiCache.flushAll();
    this.queryCache.clear();
    console.log('✅ Performance optimizer resources cleaned up');
  }
}

// Export singleton instance
export let performanceOptimizer: PerformanceOptimizer | null = null;

export function initializePerformanceOptimizer(database: Database.Database): PerformanceOptimizer {
  performanceOptimizer = new PerformanceOptimizer(database);
  return performanceOptimizer;
}

export function getPerformanceOptimizer(): PerformanceOptimizer {
  if (!performanceOptimizer) {
    throw new Error('Performance optimizer not initialized. Call initializePerformanceOptimizer first.');
  }
  return performanceOptimizer;
}
