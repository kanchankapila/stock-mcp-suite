// Performance Optimization Suite for Stock MCP Server
import { logger } from './logger.js';
import LRUCache from 'lru-cache';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response, NextFunction } from 'express';

// Advanced caching system with TTL and memory management
export class AdvancedCacheManager {
  private caches: Map<string, LRUCache<string, any>>;
  private defaultOptions: any;

  constructor() {
    this.caches = new Map();
    this.defaultOptions = {
      maxSize: 500,
      ttl: 1000 * 60 * 5, // 5 minutes
      updateAgeOnGet: true,
      allowStale: true
    };
  }

  // Create or get cache instance
  getCache(name: string, options?: any): LRUCache<string, any> {
    if (!this.caches.has(name)) {
      const cacheOptions = { ...this.defaultOptions, ...options };
      const cache = new LRUCache<string, any>(cacheOptions);
      this.caches.set(name, cache);
      logger.info({ cacheName: name, options: cacheOptions }, 'cache_created');
    }
    return this.caches.get(name)!;
  }

  // Intelligent cache key generation
  generateCacheKey(prefix: string, params: any): string {
    const normalizedParams = this.normalizeParams(params);
    const paramString = JSON.stringify(normalizedParams);
    return `${prefix}:${Buffer.from(paramString).toString('base64').slice(0, 32)}`;
  }

  private normalizeParams(params: any): any {
    if (typeof params !== 'object' || params === null) {
      return params;
    }
    
    const normalized: any = {};
    const keys = Object.keys(params).sort();
    
    for (const key of keys) {
      if (params[key] !== undefined && params[key] !== null) {
        normalized[key] = this.normalizeParams(params[key]);
      }
    }
    
    return normalized;
  }

  // Cache statistics
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, cache] of this.caches) {
      stats[name] = {
        size: cache.size,
        maxSize: cache.maxSize,
        calculatedSize: cache.calculatedSize,
        ttl: cache.ttl
      };
    }
    
    return stats;
  }

  // Cleanup and maintenance
  cleanup(): void {
    for (const [name, cache] of this.caches) {
      const sizeBefore = cache.size;
      cache.purgeStale();
      const sizeAfter = cache.size;
      
      if (sizeBefore !== sizeAfter) {
        logger.debug({ 
          cache: name, 
          sizeBefore, 
          sizeAfter, 
          removed: sizeBefore - sizeAfter 
        }, 'cache_cleanup');
      }
    }
  }
}

// Database query optimization
export class QueryOptimizer {
  private queryCache: LRUCache<string, any>;
  private slowQueries: Map<string, { count: number; totalTime: number; avgTime: number }>;

  constructor() {
    this.queryCache = new LRUCache({
      maxSize: 1000,
      ttl: 1000 * 60 * 10, // 10 minutes for query results
    });
    this.slowQueries = new Map();
  }

  // Analyze and optimize SQL queries
  analyzeQuery(sql: string): { optimized: string; suggestions: string[] } {
    const suggestions: string[] = [];
    let optimized = sql;

    // Basic optimization suggestions
    if (sql.includes('SELECT *')) {
      suggestions.push('Use specific column names instead of SELECT *');
    }

    if (!sql.toLowerCase().includes('limit') && sql.toLowerCase().includes('select')) {
      suggestions.push('Consider adding LIMIT clause for large result sets');
    }

    if (!sql.toLowerCase().includes('index') && sql.toLowerCase().includes('where')) {
      suggestions.push('Ensure proper indexes exist for WHERE clauses');
    }

    // Add EXPLAIN QUERY PLAN for analysis
    if (sql.toLowerCase().startsWith('select')) {
      optimized = `EXPLAIN QUERY PLAN ${sql}`;
    }

    return { optimized, suggestions };
  }

  // Track query performance
  trackQuery(sql: string, executionTime: number): void {
    const queryKey = sql.substring(0, 100); // Truncate for key
    const existing = this.slowQueries.get(queryKey);

    if (existing) {
      existing.count += 1;
      existing.totalTime += executionTime;
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      this.slowQueries.set(queryKey, {
        count: 1,
        totalTime: executionTime,
        avgTime: executionTime
      });
    }

    // Log slow queries
    if (executionTime > 1000) { // More than 1 second
      logger.warn({ sql: queryKey, executionTime }, 'slow_query_detected');
    }
  }

  // Get slow query report
  getSlowQueryReport(): Array<any> {
    return Array.from(this.slowQueries.entries())
      .map(([query, stats]) => ({ query, ...stats }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);
  }
}

// Memory monitoring and optimization
export class MemoryOptimizer {
  private memoryStats: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
  private maxSamples = 100;

  constructor() {
    // Monitor memory every 30 seconds
    setInterval(() => this.collectMemoryStats(), 30000);
  }

  private collectMemoryStats(): void {
    const usage = process.memoryUsage();
    this.memoryStats.push({ timestamp: Date.now(), usage });
    
    // Keep only recent samples
    if (this.memoryStats.length > this.maxSamples) {
      this.memoryStats.shift();
    }

    // Log memory alerts
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 500) { // More than 500MB
      logger.warn({ heapUsedMB, heapTotalMB: usage.heapTotal / 1024 / 1024 }, 'high_memory_usage');
    }
  }

  // Get memory analysis
  getMemoryAnalysis(): any {
    if (this.memoryStats.length === 0) return null;

    const latest = this.memoryStats[this.memoryStats.length - 1];
    const oldest = this.memoryStats[0];
    
    const trend = {
      heapUsed: latest.usage.heapUsed - oldest.usage.heapUsed,
      heapTotal: latest.usage.heapTotal - oldest.usage.heapTotal,
      external: latest.usage.external - oldest.usage.external
    };

    return {
      current: {
        heapUsedMB: latest.usage.heapUsed / 1024 / 1024,
        heapTotalMB: latest.usage.heapTotal / 1024 / 1024,
        externalMB: latest.usage.external / 1024 / 1024,
        arrayBuffersMB: latest.usage.arrayBuffers / 1024 / 1024
      },
      trend: {
        heapUsedMB: trend.heapUsed / 1024 / 1024,
        heapTotalMB: trend.heapTotal / 1024 / 1024,
        externalMB: trend.external / 1024 / 1024
      },
      samples: this.memoryStats.length
    };
  }

  // Force garbage collection if available
  forceGC(): void {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      
      logger.info({
        before: before.heapUsed / 1024 / 1024,
        after: after.heapUsed / 1024 / 1024,
        freed: (before.heapUsed - after.heapUsed) / 1024 / 1024
      }, 'manual_gc_performed');
    }
  }
}

// Response compression and optimization
export function createCompressionMiddleware() {
  return compression({
    filter: (req: Request, res: Response) => {
      // Don't compress if client doesn't support it
      if (!req.headers['accept-encoding']) {
        return false;
      }
      
      // Compress JSON responses
      if (res.getHeader('Content-Type')?.toString().includes('application/json')) {
        return true;
      }
      
      // Use default compression filter
      return compression.filter(req, res);
    },
    level: 6, // Good balance between speed and compression ratio
    threshold: 1024, // Only compress responses > 1KB
  });
}

// Advanced rate limiting
export function createRateLimiters() {
  // General API rate limiter
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn({ ip: req.ip, url: req.url }, 'rate_limit_exceeded');
      const resetTime = (req as any).rateLimit?.resetTime;
      let retryAfterSeconds: number | null = null;
      if (typeof resetTime === 'number') {
        retryAfterSeconds = Math.max(0, Math.ceil(resetTime / 1000));
      } else if (resetTime instanceof Date) {
        retryAfterSeconds = Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
      }
      res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded',
        retryAfter: retryAfterSeconds
      });
    }
  });

  // Strict rate limiter for expensive operations
  const strictLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 requests per 5 minutes for expensive operations
    message: {
      error: 'Too many expensive requests, please slow down.'
    }
  });

  // Slow down middleware for progressive delays
  const slowDownMiddleware = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 500, // Allow 500 requests per 15 minutes at full speed
    delayMs: 100, // Add 100ms delay per request after delayAfter
    maxDelayMs: 2000, // Max delay of 2 seconds
  });

  return { generalLimiter, strictLimiter, slowDown: slowDownMiddleware };
}

// Request optimization middleware
export function createRequestOptimizer() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add request timing
    const startTime = Date.now();
    
    // Override res.json to add performance headers
    const originalJson = res.json;
    res.json = function(obj: any) {
      const duration = Date.now() - startTime;
      
      // Add performance headers
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.setHeader('X-Powered-By', 'Stock-MCP-Suite');
      
      // Add cache headers for static-like responses
      if (req.method === 'GET' && duration < 100) {
        res.setHeader('Cache-Control', 'public, max-age=60'); // 1 minute cache
      }
      
      // Log slow responses
      if (duration > 2000) {
        logger.warn({ 
          method: req.method, 
          url: req.url, 
          duration,
          userAgent: req.get('User-Agent')
        }, 'slow_response');
      }
      
      return originalJson.call(this, obj);
    };
    
    next();
  };
}

// Connection pooling optimization
export class ConnectionPoolOptimizer {
  private activeConnections = 0;
  private maxConnections = 100;
  private connectionQueue: Array<() => void> = [];

  acquireConnection(): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        resolve();
      } else {
        this.connectionQueue.push(resolve);
      }
    });
  }

  releaseConnection(): void {
    this.activeConnections--;
    
    if (this.connectionQueue.length > 0) {
      const next = this.connectionQueue.shift();
      if (next) {
        this.activeConnections++;
        next();
      }
    }
  }

  getStatus(): { active: number; queued: number; max: number } {
    return {
      active: this.activeConnections,
      queued: this.connectionQueue.length,
      max: this.maxConnections
    };
  }
}

// Global optimization manager
export class PerformanceOptimizer {
  public cacheManager: AdvancedCacheManager;
  public queryOptimizer: QueryOptimizer;
  public memoryOptimizer: MemoryOptimizer;
  public connectionPool: ConnectionPoolOptimizer;

  constructor() {
    this.cacheManager = new AdvancedCacheManager();
    this.queryOptimizer = new QueryOptimizer();
    this.memoryOptimizer = new MemoryOptimizer();
    this.connectionPool = new ConnectionPoolOptimizer();

    // Start maintenance routines
    this.startMaintenanceRoutines();
  }

  private startMaintenanceRoutines(): void {
    // Cache cleanup every 5 minutes
    setInterval(() => {
      this.cacheManager.cleanup();
    }, 5 * 60 * 1000);

    // Memory cleanup every 10 minutes
    setInterval(() => {
      this.memoryOptimizer.forceGC();
    }, 10 * 60 * 1000);

    // Log performance stats every 15 minutes
    setInterval(() => {
      this.logPerformanceStats();
    }, 15 * 60 * 1000);
  }

  private logPerformanceStats(): void {
    const cacheStats = this.cacheManager.getStats();
    const memoryStats = this.memoryOptimizer.getMemoryAnalysis();
    const connectionStats = this.connectionPool.getStatus();
    const slowQueries = this.queryOptimizer.getSlowQueryReport();

    logger.info({
      cacheStats,
      memoryStats,
      connectionStats,
      slowQueryCount: slowQueries.length
    }, 'performance_stats');
  }

  // Get comprehensive performance report
  getPerformanceReport(): any {
    return {
      timestamp: new Date().toISOString(),
      caches: this.cacheManager.getStats(),
      memory: this.memoryOptimizer.getMemoryAnalysis(),
      connections: this.connectionPool.getStatus(),
      slowQueries: this.queryOptimizer.getSlowQueryReport(),
      uptime: process.uptime()
    };
  }
}

// Export global instance
export const globalPerformanceOptimizer = new PerformanceOptimizer();

// Express middleware setup helper
export function setupPerformanceMiddleware(app: any) {
  // Compression
  app.use(createCompressionMiddleware());
  
  // Rate limiting
  const { generalLimiter, strictLimiter, slowDown: slowDownMiddleware } = createRateLimiters();
  app.use('/api', generalLimiter);
  app.use('/api/ingest', strictLimiter);
  app.use('/api/backtest', strictLimiter);
  app.use(slowDownMiddleware);
  
  // Request optimization
  app.use(createRequestOptimizer());
  
  // Performance monitoring endpoint
  app.get('/api/performance', (req: Request, res: Response) => {
    res.json({
      ok: true,
      data: globalPerformanceOptimizer.getPerformanceReport()
    });
  });
  
  logger.info('performance_middleware_configured');
}




