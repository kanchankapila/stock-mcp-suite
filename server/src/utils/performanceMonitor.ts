import { logger } from './logger.js';
import { getAllCacheStats } from './performanceCache.js';
import { globalRateLimiter } from './apiRateLimiter.js';

/**
 * Comprehensive performance monitoring system
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private monitoringInterval: NodeJS.Timer | null = null;
  private alertThresholds: AlertThresholds;

  constructor() {
    this.metrics = {
      apiCalls: new Map(),
      queryTimes: new Map(),
      memoryUsage: [],
      errorRates: new Map(),
      dbOperations: new Map(),
      cacheOperations: new Map(),
      jobMetrics: new Map(),
      systemMetrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        eventLoopDelay: 0
      }
    };

    this.alertThresholds = {
      maxMemoryMB: 1024,
      maxQueryTimeMs: 5000,
      maxErrorRate: 0.1, // 10%
      maxEventLoopDelayMs: 100,
      minCacheHitRate: 0.7 // 70%
    };
  }

  /**
   * Start monitoring with specified interval
   */
  start(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlerts();
      this.logPerformanceReport();
    }, intervalMs);

    logger.info({ intervalMs }, 'performance_monitoring_started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('performance_monitoring_stopped');
  }

  /**
   * Track API call performance
   */
  trackAPICall(endpoint: string, duration: number, success: boolean): void {
    const key = endpoint;
    
    if (!this.metrics.apiCalls.has(key)) {
      this.metrics.apiCalls.set(key, { total: 0, success: 0, avgDuration: 0 });
    }
    
    const stats = this.metrics.apiCalls.get(key)!;
    stats.total++;
    if (success) stats.success++;
    stats.avgDuration = (stats.avgDuration + duration) / 2;

    // Track error rate
    if (!success) {
      const errorKey = `${endpoint}_errors`;
      this.metrics.errorRates.set(errorKey, (this.metrics.errorRates.get(errorKey) || 0) + 1);
    }
  }

  /**
   * Track database query performance
   */
  trackQueryTime(query: string, duration: number): void {
    // Normalize query for grouping (remove specific values)
    const normalizedQuery = this.normalizeQuery(query);
    
    if (!this.metrics.queryTimes.has(normalizedQuery)) {
      this.metrics.queryTimes.set(normalizedQuery, []);
    }
    
    const times = this.metrics.queryTimes.get(normalizedQuery)!;
    times.push(duration);
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift();
    }
  }

  /**
   * Track database operations
   */
  trackDBOperation(operation: string, table: string, duration: number, success: boolean): void {
    const key = `${operation}_${table}`;
    
    if (!this.metrics.dbOperations.has(key)) {
      this.metrics.dbOperations.set(key, { count: 0, totalDuration: 0, errors: 0 });
    }
    
    const stats = this.metrics.dbOperations.get(key)!;
    stats.count++;
    stats.totalDuration += duration;
    if (!success) stats.errors++;
  }

  /**
   * Track cache operations
   */
  trackCacheOperation(operation: 'hit' | 'miss' | 'set' | 'evict', cacheType: string): void {
    const key = `${cacheType}_${operation}`;
    this.metrics.cacheOperations.set(key, (this.metrics.cacheOperations.get(key) || 0) + 1);
  }

  /**
   * Track background job performance
   */
  trackJobExecution(jobName: string, duration: number, success: boolean): void {
    if (!this.metrics.jobMetrics.has(jobName)) {
      this.metrics.jobMetrics.set(jobName, {
        executions: 0,
        totalDuration: 0,
        failures: 0,
        lastExecution: 0
      });
    }
    
    const stats = this.metrics.jobMetrics.get(jobName)!;
    stats.executions++;
    stats.totalDuration += duration;
    if (!success) stats.failures++;
    stats.lastExecution = Date.now();
  }

  /**
   * Get comprehensive performance report
   */
  getReport(): PerformanceReport {
    return {
      timestamp: new Date().toISOString(),
      systemMetrics: this.metrics.systemMetrics,
      apiPerformance: this.getAPIPerformanceReport(),
      databasePerformance: this.getDatabasePerformanceReport(),
      cachePerformance: this.getCachePerformanceReport(),
      jobPerformance: this.getJobPerformanceReport(),
      rateLimiterStats: globalRateLimiter.getAllStats(),
      alerts: this.getCurrentAlerts()
    };
  }

  /**
   * Get current alerts
   */
  getCurrentAlerts(): Alert[] {
    const alerts: Alert[] = [];
    
    // Memory usage alert
    if (this.metrics.systemMetrics.memoryUsage > this.alertThresholds.maxMemoryMB) {
      alerts.push({
        type: 'memory',
        severity: 'high',
        message: `Memory usage ${this.metrics.systemMetrics.memoryUsage}MB exceeds threshold ${this.alertThresholds.maxMemoryMB}MB`,
        timestamp: Date.now()
      });
    }
    
    // Slow query alert
    for (const [query, times] of this.metrics.queryTimes) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      if (avgTime > this.alertThresholds.maxQueryTimeMs) {
        alerts.push({
          type: 'slow_query',
          severity: 'medium',
          message: `Query '${query}' average time ${avgTime.toFixed(0)}ms exceeds threshold`,
          timestamp: Date.now()
        });
      }
    }
    
    // Error rate alert
    for (const [endpoint, errorCount] of this.metrics.errorRates) {
      const totalCalls = this.metrics.apiCalls.get(endpoint.replace('_errors', ''))?.total || 0;
      if (totalCalls > 0) {
        const errorRate = errorCount / totalCalls;
        if (errorRate > this.alertThresholds.maxErrorRate) {
          alerts.push({
            type: 'high_error_rate',
            severity: 'high',
            message: `${endpoint} error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`,
            timestamp: Date.now()
          });
        }
      }
    }
    
    return alerts;
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.metrics.systemMetrics.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    // Collect CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.metrics.systemMetrics.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    
    // Store memory history for trending
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });
    
    // Keep only last 100 measurements
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage.shift();
    }
  }

  private checkAlerts(): void {
    const alerts = this.getCurrentAlerts();
    
    for (const alert of alerts) {
      if (alert.severity === 'high') {
        logger.error(alert, 'performance_alert_high');
      } else if (alert.severity === 'medium') {
        logger.warn(alert, 'performance_alert_medium');
      } else {
        logger.info(alert, 'performance_alert_low');
      }
    }
  }

  private logPerformanceReport(): void {
    const report = this.getReport();
    
    logger.info({
      memoryMB: report.systemMetrics.memoryUsage,
      apiCalls: Array.from(this.metrics.apiCalls.entries()).slice(0, 5),
      slowQueries: this.getTopSlowQueries(3),
      cacheHitRates: this.getCacheHitRates(),
      jobFailures: this.getJobFailures()
    }, 'performance_report');
  }

  private getAPIPerformanceReport() {
    const result: any = {};
    
    for (const [endpoint, stats] of this.metrics.apiCalls) {
      const errorCount = this.metrics.errorRates.get(`${endpoint}_errors`) || 0;
      result[endpoint] = {
        totalCalls: stats.total,
        successRate: stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) + '%' : '0%',
        avgDuration: stats.avgDuration.toFixed(0) + 'ms',
        errorCount
      };
    }
    
    return result;
  }

  private getDatabasePerformanceReport() {
    const result: any = {};
    
    for (const [operation, stats] of this.metrics.dbOperations) {
      result[operation] = {
        count: stats.count,
        avgDuration: stats.count > 0 ? (stats.totalDuration / stats.count).toFixed(1) + 'ms' : '0ms',
        errorRate: stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(1) + '%' : '0%'
      };
    }
    
    return result;
  }

  private getCachePerformanceReport() {
    return getAllCacheStats();
  }

  private getJobPerformanceReport() {
    const result: any = {};
    
    for (const [jobName, stats] of this.metrics.jobMetrics) {
      result[jobName] = {
        executions: stats.executions,
        avgDuration: stats.executions > 0 ? (stats.totalDuration / stats.executions).toFixed(0) + 'ms' : '0ms',
        failureRate: stats.executions > 0 ? ((stats.failures / stats.executions) * 100).toFixed(1) + '%' : '0%',
        lastExecution: new Date(stats.lastExecution).toISOString()
      };
    }
    
    return result;
  }

  private getTopSlowQueries(limit: number = 5) {
    const slowQueries: Array<{ query: string; avgTime: number }> = [];
    
    for (const [query, times] of this.metrics.queryTimes) {
      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        slowQueries.push({ query: query.substring(0, 100) + '...', avgTime });
      }
    }
    
    return slowQueries
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  private getCacheHitRates() {
    const cacheStats = getAllCacheStats();
    const result: any = {};
    
    for (const [cacheType, stats] of Object.entries(cacheStats)) {
      result[cacheType] = stats.hitRate;
    }
    
    return result;
  }

  private getJobFailures() {
    const failures: Array<{ job: string; rate: string }> = [];
    
    for (const [jobName, stats] of this.metrics.jobMetrics) {
      if (stats.failures > 0) {
        const rate = ((stats.failures / stats.executions) * 100).toFixed(1) + '%';
        failures.push({ job: jobName, rate });
      }
    }
    
    return failures.sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\$\d+/g, '?')  // Replace parameter placeholders
      .replace(/\b\d+\b/g, '?')  // Replace numbers
      .replace(/('[^']*'|"[^"]*")/g, '?')  // Replace string literals
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim()
      .substring(0, 200);  // Limit length
  }
}

// Types
export interface PerformanceMetrics {
  apiCalls: Map<string, { total: number; success: number; avgDuration: number }>;
  queryTimes: Map<string, number[]>;
  memoryUsage: Array<{ timestamp: number; heapUsed: number; heapTotal: number; external: number }>;
  errorRates: Map<string, number>;
  dbOperations: Map<string, { count: number; totalDuration: number; errors: number }>;
  cacheOperations: Map<string, number>;
  jobMetrics: Map<string, { executions: number; totalDuration: number; failures: number; lastExecution: number }>;
  systemMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    eventLoopDelay: number;
  };
}

export interface PerformanceReport {
  timestamp: string;
  systemMetrics: any;
  apiPerformance: any;
  databasePerformance: any;
  cachePerformance: any;
  jobPerformance: any;
  rateLimiterStats: any;
  alerts: Alert[];
}

export interface Alert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: number;
}

export interface AlertThresholds {
  maxMemoryMB: number;
  maxQueryTimeMs: number;
  maxErrorRate: number;
  maxEventLoopDelayMs: number;
  minCacheHitRate: number;
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();

// Helper functions for easy integration
export function trackAPICall(endpoint: string, duration: number, success: boolean): void {
  globalPerformanceMonitor.trackAPICall(endpoint, duration, success);
}

export function trackQueryTime(query: string, duration: number): void {
  globalPerformanceMonitor.trackQueryTime(query, duration);
}

export function trackDBOperation(operation: string, table: string, duration: number, success: boolean): void {
  globalPerformanceMonitor.trackDBOperation(operation, table, duration, success);
}

export function trackJobExecution(jobName: string, duration: number, success: boolean): void {
  globalPerformanceMonitor.trackJobExecution(jobName, duration, success);
}
