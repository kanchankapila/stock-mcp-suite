import { logger } from './logger.js';

/**
 * Advanced API rate limiter with queue management and intelligent backoff
 */
export class APIRateLimiter {
  private queues = new Map<string, QueuedRequest[]>();
  private processing = new Map<string, boolean>();
  private rateLimits = new Map<string, RateLimitConfig>();
  private stats = new Map<string, RateLimitStats>();
  private backoffStates = new Map<string, BackoffState>();

  constructor() {
    // Cleanup stats periodically
    setInterval(() => this.cleanupStats(), 300000); // 5 minutes
  }

  /**
   * Configure rate limiting for a specific API
   */
  configure(apiKey: string, config: RateLimitConfig): void {
    this.rateLimits.set(apiKey, config);
    this.stats.set(apiKey, {
      requests: 0,
      errors: 0,
      rateLimitHits: 0,
      avgResponseTime: 0,
      lastRequest: 0
    });
  }

  /**
   * Execute API request with rate limiting and intelligent retry
   */
  async execute<T>(apiKey: string, fn: () => Promise<T>, priority: RequestPriority = RequestPriority.NORMAL): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        fn: async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        priority,
        timestamp: Date.now()
      };

      this.enqueue(apiKey, request);
      this.processQueue(apiKey);
    });
  }

  /**
   * Get current stats for an API
   */
  getStats(apiKey: string): RateLimitStats | null {
    return this.stats.get(apiKey) || null;
  }

  /**
   * Get all API stats
   */
  getAllStats(): Record<string, RateLimitStats> {
    const result: Record<string, RateLimitStats> = {};
    for (const [key, stats] of this.stats) {
      result[key] = { ...stats };
    }
    return result;
  }

  private enqueue(apiKey: string, request: QueuedRequest): void {
    if (!this.queues.has(apiKey)) {
      this.queues.set(apiKey, []);
    }

    const queue = this.queues.get(apiKey)!;
    
    // Insert based on priority
    let inserted = false;
    for (let i = 0; i < queue.length; i++) {
      if (request.priority < queue[i].priority) {
        queue.splice(i, 0, request);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      queue.push(request);
    }

    // Limit queue size to prevent memory issues
    const maxQueueSize = this.rateLimits.get(apiKey)?.maxQueueSize || 100;
    if (queue.length > maxQueueSize) {
      // Remove lowest priority items
      queue.sort((a, b) => a.priority - b.priority);
      queue.splice(maxQueueSize);
      logger.warn({ apiKey, queueSize: queue.length }, 'api_queue_size_limited');
    }
  }

  private async processQueue(apiKey: string): Promise<void> {
    if (this.processing.get(apiKey)) {
      return;
    }

    this.processing.set(apiKey, true);
    const queue = this.queues.get(apiKey) || [];
    const config = this.rateLimits.get(apiKey);
    const stats = this.stats.get(apiKey);

    if (!config || !stats) {
      this.processing.set(apiKey, false);
      return;
    }

    while (queue.length > 0) {
      const request = queue.shift()!;
      const startTime = Date.now();

      try {
        // Check if we need to wait due to rate limiting
        const delay = this.calculateDelay(apiKey);
        if (delay > 0) {
          await this.sleep(delay);
        }

        await request.fn();
        
        // Update success stats
        const responseTime = Date.now() - startTime;
        stats.requests++;
        stats.avgResponseTime = (stats.avgResponseTime + responseTime) / 2;
        stats.lastRequest = Date.now();
        
        // Reset backoff on success
        this.backoffStates.delete(apiKey);

      } catch (error: any) {
        stats.errors++;
        
        const errorMessage = String(error?.message || error);
        
        if (this.isRateLimit(error)) {
          stats.rateLimitHits++;
          this.handleRateLimit(apiKey, error);
          
          // Re-queue the request for retry
          this.enqueue(apiKey, request);
          
          logger.warn({ apiKey, error: errorMessage }, 'api_rate_limit_hit');
          
          // Break to prevent immediate retry
          break;
        } else {
          // For non-rate-limit errors, log and continue
          logger.error({ apiKey, error: errorMessage }, 'api_request_failed');
        }
      }

      // Base delay between requests
      await this.sleep(config.baseDelayMs || 200);
    }

    this.processing.set(apiKey, false);
  }

  private calculateDelay(apiKey: string): number {
    const config = this.rateLimits.get(apiKey)!;
    const stats = this.stats.get(apiKey)!;
    const backoff = this.backoffStates.get(apiKey);
    
    let delay = config.baseDelayMs || 200;
    
    // Apply backoff if in backoff state
    if (backoff) {
      delay = Math.min(backoff.currentDelay, config.maxBackoffMs || 30000);
    }
    
    // Ensure minimum time between requests
    const timeSinceLastRequest = Date.now() - stats.lastRequest;
    const minInterval = config.minIntervalMs || 1000;
    
    if (timeSinceLastRequest < minInterval) {
      delay = Math.max(delay, minInterval - timeSinceLastRequest);
    }
    
    return delay;
  }

  private handleRateLimit(apiKey: string, error: any): void {
    const config = this.rateLimits.get(apiKey)!;
    let backoff = this.backoffStates.get(apiKey);
    
    if (!backoff) {
      backoff = {
        currentDelay: config.baseDelayMs || 200,
        attempts: 0
      };
    }
    
    backoff.attempts++;
    backoff.currentDelay = Math.min(
      backoff.currentDelay * (config.backoffMultiplier || 2),
      config.maxBackoffMs || 30000
    );
    
    this.backoffStates.set(apiKey, backoff);
    
    // Extract retry-after header if available
    const retryAfter = this.extractRetryAfter(error);
    if (retryAfter > 0) {
      backoff.currentDelay = Math.max(backoff.currentDelay, retryAfter * 1000);
    }
  }

  private isRateLimit(error: any): boolean {
    const message = String(error?.message || error).toLowerCase();
    const status = error?.status || error?.response?.status;
    
    return status === 429 || 
           message.includes('rate limit') ||
           message.includes('429') ||
           message.includes('too many requests');
  }

  private extractRetryAfter(error: any): number {
    const retryAfter = error?.response?.headers?.['retry-after'] ||
                      error?.headers?.['retry-after'];
    
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? 0 : seconds;
    }
    
    return 0;
  }

  private cleanupStats(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [apiKey, stats] of this.stats) {
      if (now - stats.lastRequest > maxAge) {
        // Reset old stats
        stats.requests = 0;
        stats.errors = 0;
        stats.rateLimitHits = 0;
        stats.avgResponseTime = 0;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Types
export interface RateLimitConfig {
  baseDelayMs?: number;
  minIntervalMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  maxQueueSize?: number;
}

export interface RateLimitStats {
  requests: number;
  errors: number;
  rateLimitHits: number;
  avgResponseTime: number;
  lastRequest: number;
}

export enum RequestPriority {
  HIGH = 1,
  NORMAL = 2,
  LOW = 3
}

interface QueuedRequest {
  fn: () => Promise<void>;
  priority: RequestPriority;
  timestamp: number;
}

interface BackoffState {
  currentDelay: number;
  attempts: number;
}

// Global rate limiter instance
export const globalRateLimiter = new APIRateLimiter();

// Configure default rate limits for known APIs
globalRateLimiter.configure('yahoo', {
  baseDelayMs: 200,
  minIntervalMs: 1000,
  maxBackoffMs: 30000,
  backoffMultiplier: 2,
  maxQueueSize: 50
});

globalRateLimiter.configure('news', {
  baseDelayMs: 500,
  minIntervalMs: 2000,
  maxBackoffMs: 60000,
  backoffMultiplier: 2.5,
  maxQueueSize: 30
});

globalRateLimiter.configure('alphavantage', {
  baseDelayMs: 12000, // 5 calls per minute
  minIntervalMs: 12000,
  maxBackoffMs: 300000, // 5 minutes
  backoffMultiplier: 3,
  maxQueueSize: 20
});

globalRateLimiter.configure('moneycontrol', {
  baseDelayMs: 300,
  minIntervalMs: 500,
  maxBackoffMs: 15000,
  backoffMultiplier: 1.5,
  maxQueueSize: 40
});
