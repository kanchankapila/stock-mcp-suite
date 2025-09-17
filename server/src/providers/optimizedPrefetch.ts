import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchYahooQuotesBatch, fetchYahooDaily, parseYahooDaily } from './yahoo.js';
import { fetchStooqDaily } from './stooq.js';
import { fetchNews, parseNews } from '../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../providers/moneycontrol.js';
import { fetchYahooFin } from '../providers/yahooFin.js';
import { insertPriceRow, upsertStock, insertNewsRow, upsertMcTech } from '../db.js';
import { indexNamespace } from '../rag/langchain.js';
import { logger } from '../utils/logger.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker } from '../utils/ticker.js';
import { globalRateLimiter, RequestPriority } from '../utils/apiRateLimiter.js';
import { trackJobExecution, globalPerformanceMonitor } from '../utils/performanceMonitor.js';
import * as trendlyne from '../providers/trendlyne.js';
import * as external from '../providers/external.js';

type YFinCompat = {
  ok?: boolean;
  [key: string]: any;
};

/**
 * Optimized prefetch system with intelligent job management
 */
export class OptimizedPrefetchManager {
  private isRunning = false;
  private schedulers = new Map<string, NodeJS.Timeout>();
  private jobQueue = new Map<string, PrefetchJob[]>();
  private processingJobs = new Set<string>();
  private stats = {
    jobsProcessed: 0,
    jobsFailed: 0,
    avgProcessingTime: 0,
    lastRun: 0
  };

  private config: PrefetchConfig;

  constructor() {
    this.config = {
      // Reduced batch sizes for better performance
      quoteBatchSize: Number(process.env.PREFETCH_QUOTE_BATCH_SIZE || 50), // Down from 250
      newsBatchSize: Number(process.env.PREFETCH_NEWS_BATCH || 10),
      externalBatchSize: Number(process.env.PREFETCH_EXTERNAL_BATCH || 15), // Down from 25
      trendlyneBatchSize: Number(process.env.PREFETCH_TRENDLYNE_BATCH || 15), // Down from 25
      yfinBatchSize: Number(process.env.PREFETCH_YFIN_BATCH || 15), // Down from 25
      
      // Optimized intervals
      baseInterval: Number(process.env.PREFETCH_INTERVAL_MS || 45000), // 45 seconds
      newsInterval: Number(process.env.PREFETCH_NEWS_INTERVAL_MS || 300000), // 5 min
      externalInterval: Number(process.env.PREFETCH_EXTERNAL_INTERVAL_MS || 1800000), // 30 min (was 24h)
      trendlyneInterval: Number(process.env.PREFETCH_TRENDLYNE_INTERVAL_MS || 3600000), // 1 hour (was 24h)
      yfinInterval: Number(process.env.PREFETCH_YFIN_INTERVAL_MS || 7200000), // 2 hours (was 24h)
      
      // Performance optimizations
      maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_PREFETCH_JOBS || 3),
      backoffMultiplier: Number(process.env.PREFETCH_BACKOFF_MULT || 1.5), // Reduced from 2
      maxBackoffMs: Number(process.env.PREFETCH_BACKOFF_MAX_MS || 15000), // Reduced from 10000
      baseDelayMs: Number(process.env.PREFETCH_PER_REQ_DELAY_MS || 100), // Reduced from 200
      
      // Feature flags
      enableNews: String(process.env.PREFETCH_NEWS_ENABLE || 'true') === 'true',
      enableExternal: String(process.env.PREFETCH_EXTERNAL_ENABLE || 'true') === 'true',
      enableTrendlyne: String(process.env.PREFETCH_TRENDLYNE_ENABLE || 'true') === 'true',
      enableYfin: String(process.env.PREFETCH_YFIN_ENABLE || 'true') === 'true',
      enableRagIndex: String(process.env.PREFETCH_RAG_INDEX_ENABLE || 'false') === 'true',
      useChartFallback: String(process.env.PREFETCH_USE_CHART_FALLBACK || 'true') === 'true',
      useStooqFallback: String(process.env.PREFETCH_USE_STOOQ_FALLBACK || 'true') === 'true'
    };
  }

  /**
   * Start optimized prefetch system
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('prefetch_manager_already_running');
      return;
    }

    if (String(process.env.PREFETCH_DISABLED || 'false') === 'true') {
      logger.warn('prefetch_disabled_by_env_var');
      return;
    }

    const stocklistPath = this.resolveStocklistPath();
    if (!stocklistPath) {
      logger.error('stocklist_not_found');
      return;
    }

    const baseSymbols = this.extractSymbolsFromStocklist(stocklistPath);
    if (!baseSymbols.length) {
      logger.warn({ stocklistPath }, 'prefetch_no_symbols');
      return;
    }

    this.isRunning = true;
    logger.info({ symbolCount: baseSymbols.length, config: this.config }, 'optimized_prefetch_starting');

    // Start performance monitoring
    globalPerformanceMonitor.start(30000);

    // Initialize job queues
    this.initializeJobQueues(baseSymbols);

    // Start job schedulers
    this.startJobSchedulers();

    // Health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Stop all prefetch operations
   */
  stop(): void {
    if (!this.isRunning) return;

    logger.info('stopping_optimized_prefetch');
    this.isRunning = false;

    // Clear all schedulers
    for (const [jobType, timer] of this.schedulers) {
      clearTimeout(timer);
      logger.debug({ jobType }, 'prefetch_scheduler_stopped');
    }
    this.schedulers.clear();

    // Clear job queues
    this.jobQueue.clear();
    this.processingJobs.clear();

    globalPerformanceMonitor.stop();
    logger.info('optimized_prefetch_stopped');
  }

  private initializeJobQueues(symbols: string[]): void {
    const tickers = symbols.map(s => resolveTicker(s, 'yahoo'));
    const newsMap = new Map<string, string>();
    const mcMap = new Map<string, string>();

    for (const symbol of symbols) {
      try {
        const yahoo = resolveTicker(symbol, 'yahoo');
        newsMap.set(yahoo, resolveTicker(symbol, 'news'));
        mcMap.set(yahoo, resolveTicker(symbol, 'mc'));
      } catch (err) {
        logger.warn({ err, symbol }, 'ticker_resolution_failed');
      }
    }

    // Create batched jobs
    this.createBatchedJobs('quotes', tickers, this.config.quoteBatchSize);
    
    if (this.config.enableNews) {
      this.createBatchedJobs('news', tickers, this.config.newsBatchSize, newsMap);
    }
    
    if (this.config.enableExternal) {
      this.createBatchedJobs('external', tickers, this.config.externalBatchSize, mcMap);
    }
    
    if (this.config.enableTrendlyne) {
      this.createBatchedJobs('trendlyne', tickers, this.config.trendlyneBatchSize);
    }
    
    if (this.config.enableYfin) {
      this.createBatchedJobs('yfin', tickers, this.config.yfinBatchSize);
    }
  }

  private createBatchedJobs(jobType: string, items: string[], batchSize: number, metadataMap?: Map<string, string>): void {
    const jobs: PrefetchJob[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      jobs.push({
        id: `${jobType}_${Math.floor(i / batchSize)}`,
        type: jobType as JobType,
        batch,
        metadata: metadataMap,
        priority: this.getJobPriority(jobType),
        createdAt: Date.now(),
        attempts: 0
      });
    }
    
    this.jobQueue.set(jobType, jobs);
    logger.info({ jobType, jobCount: jobs.length, batchSize }, 'prefetch_jobs_created');
  }

  private getJobPriority(jobType: string): number {
    const priorities = {
      'quotes': 1,     // Highest priority
      'news': 2,       // Medium-high
      'yfin': 3,       // Medium
      'external': 4,   // Medium-low
      'trendlyne': 5   // Lowest
    };
    return priorities[jobType as keyof typeof priorities] || 3;
  }

  private startJobSchedulers(): void {
    // Quote scheduler - high frequency
    this.schedulers.set('quotes', setInterval(() => {
      this.processJobQueue('quotes');
    }, this.config.baseInterval));

    // News scheduler
    if (this.config.enableNews) {
      this.schedulers.set('news', setInterval(() => {
        this.processJobQueue('news');
      }, this.config.newsInterval));
    }

    // External providers scheduler
    if (this.config.enableExternal) {
      this.schedulers.set('external', setInterval(() => {
        this.processJobQueue('external');
      }, this.config.externalInterval));
    }

    // Trendlyne scheduler
    if (this.config.enableTrendlyne) {
      this.schedulers.set('trendlyne', setInterval(() => {
        this.processJobQueue('trendlyne');
      }, this.config.trendlyneInterval));
    }

    // Yahoo Finance scheduler
    if (this.config.enableYfin) {
      this.schedulers.set('yfin', setInterval(() => {
        this.processJobQueue('yfin');
      }, this.config.yfinInterval));
    }

    // Start immediate execution for quotes
    setTimeout(() => this.processJobQueue('quotes'), 1000);
  }

  private async processJobQueue(jobType: string): Promise<void> {
    if (this.processingJobs.has(jobType)) {
      logger.debug({ jobType }, 'job_already_processing');
      return;
    }

    const jobs = this.jobQueue.get(jobType) || [];
    if (!jobs.length) {
      logger.debug({ jobType }, 'no_jobs_in_queue');
      return;
    }

    // Check concurrent job limit
    if (this.processingJobs.size >= this.config.maxConcurrentJobs) {
      logger.debug({ concurrent: this.processingJobs.size }, 'max_concurrent_jobs_reached');
      return;
    }

    this.processingJobs.add(jobType);
    
    try {
      // Get next job with highest priority
      const job = jobs.shift();
      if (!job) return;

      const startTime = Date.now();
      logger.debug({ jobId: job.id, jobType, batchSize: job.batch.length }, 'processing_job');
      
      await this.executeJob(job);
      
      const duration = Date.now() - startTime;
      this.updateStats(true, duration);
      
      trackJobExecution(job.type, duration, true);
      
      // Add job back to end of queue for next cycle
      jobs.push({ ...job, createdAt: Date.now(), attempts: 0 });
      
      logger.debug({ jobId: job.id, duration }, 'job_completed');
    } catch (error) {
      logger.error({ error, jobType }, 'job_processing_failed');
      this.updateStats(false, 0);
      
      // Re-queue failed job with backoff
      const failedJob = jobs[0];
      if (failedJob) {
        failedJob.attempts++;
        if (failedJob.attempts < 3) {
          setTimeout(() => {
            jobs.unshift(failedJob);
          }, this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, failedJob.attempts));
        }
      }
    } finally {
      this.processingJobs.delete(jobType);
    }
  }

  private async executeJob(job: PrefetchJob): Promise<void> {
    const requestPriority = job.priority <= 2 ? RequestPriority.HIGH : 
                           job.priority <= 3 ? RequestPriority.NORMAL : RequestPriority.LOW;

    switch (job.type) {
      case 'quotes':
        await this.executeQuotesJob(job, requestPriority);
        break;
      case 'news':
        await this.executeNewsJob(job, requestPriority);
        break;
      case 'external':
        await this.executeExternalJob(job, requestPriority);
        break;
      case 'trendlyne':
        await this.executeTrendlyneJob(job, requestPriority);
        break;
      case 'yfin':
        await this.executeYfinJob(job, requestPriority);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private async executeQuotesJob(job: PrefetchJob, priority: RequestPriority): Promise<void> {
    try {
      const quotes = await globalRateLimiter.execute('yahoo', async () => {
        return await fetchYahooQuotesBatch(job.batch);
      }, priority);

      for (const q of quotes) {
        const date = new Date(q.time).toISOString().slice(0, 10);
        const row = { symbol: q.symbol, date, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 };
        insertPriceRow(row);
        upsertStock(q.symbol, q.symbol);
      }
    } catch (error) {
      // Fallback to chart API if batch quotes fail
      if (this.config.useChartFallback) {
        await this.executeChartFallback(job.batch, priority);
      } else {
        throw error;
      }
    }
  }

  private async executeChartFallback(symbols: string[], priority: RequestPriority): Promise<void> {
    for (const symbol of symbols) {
      try {
        const chart = await globalRateLimiter.execute('yahoo', async () => {
          return await fetchYahooDaily(symbol, '1d', '30m');
        }, priority);
        
        const rows = parseYahooDaily(symbol, chart);
        const last = rows[rows.length - 1];
        if (last) {
          insertPriceRow(last);
          upsertStock(symbol, symbol);
        }
        
        // Small delay between chart requests
        await this.sleep(this.config.baseDelayMs);
      } catch (chartError) {
        // Final fallback to Stooq
        if (this.config.useStooqFallback) {
          try {
            const stooqRows = await fetchStooqDaily(symbol);
            const lastStooq = stooqRows[stooqRows.length - 1];
            if (lastStooq) {
              insertPriceRow(lastStooq);
              upsertStock(symbol, symbol);
            }
          } catch (stooqError) {
            logger.warn({ symbol, chartError, stooqError }, 'all_price_fallbacks_failed');
          }
        }
      }
    }
  }

  private async executeNewsJob(job: PrefetchJob, priority: RequestPriority): Promise<void> {
    const NA = process.env.NEWS_API_KEY;
    if (!NA) return; // Skip if no API key

    for (const symbol of job.batch) {
      try {
        const newsQuery = job.metadata?.get(symbol) || symbol;
        
        const newsJson = await globalRateLimiter.execute('news', async () => {
          return await fetchNews(newsQuery, NA);
        }, priority);
        
        const news = parseNews(symbol, newsJson);
        const textsForIndex: Array<{ text: string; metadata: Record<string, unknown> }> = [];
        
        for (const n of news) {
          const s = sentimentScore([`${n.title}. ${n.summary}`]);
          insertNewsRow({ id: n.id, symbol, date: n.date, title: n.title, summary: n.summary, url: n.url, sentiment: s });
          
          if (this.config.enableRagIndex) {
            const text = `${n.title?.trim() || ''}. ${n.summary?.trim() || ''}`.trim();
            if (text) {
              textsForIndex.push({ 
                text, 
                metadata: { 
                  date: String(n.date || '').slice(0,10), 
                  source: 'news', 
                  url: n.url || '' 
                } 
              });
            }
          }
        }
        
        // RAG indexing (non-blocking)
        if (textsForIndex.length) {
          setTimeout(async () => {
            try {
              await indexNamespace(symbol, { texts: textsForIndex });
            } catch (err) {
              logger.warn({ err, symbol }, 'rag_indexing_failed');
            }
          }, 0);
        }
        
        await this.sleep(this.config.baseDelayMs);
      } catch (error) {
        logger.warn({ error, symbol }, 'news_fetch_failed');
      }
    }
  }

  private async executeExternalJob(job: PrefetchJob, priority: RequestPriority): Promise<void> {
    for (const symbol of job.batch) {
      try {
        const mcid = job.metadata?.get(symbol);
        if (!mcid) continue;

        // Moneycontrol price/volume with rate limiting
        const mcPvRaw = await globalRateLimiter.execute('moneycontrol', async () => {
          return await external.mcPriceVolume(mcid);
        }, priority);
        
        const mcPv = mcPvRaw as { data?: Array<{ date?: string, open?: number, high?: number, low?: number, close?: number, volume?: number }> } | null;
        
        if (mcPv && mcPv.data && Array.isArray(mcPv.data)) {
          for (const row of mcPv.data) {
            if (row.date && row.close != null) {
              insertPriceRow({ 
                symbol, 
                date: row.date, 
                open: row.open ?? row.close, 
                high: row.high ?? row.close, 
                low: row.low ?? row.close, 
                close: row.close, 
                volume: row.volume ?? 0 
              });
            }
          }
        }
        
        await this.sleep(this.config.baseDelayMs);
      } catch (error) {
        logger.warn({ error, symbol }, 'external_job_failed');
      }
    }
  }

  private async executeTrendlyneJob(job: PrefetchJob, priority: RequestPriority): Promise<void> {
    for (const symbol of job.batch) {
      try {
        const tlid = symbol; // Assuming symbol is usable as Trendlyne ID
        
        const advTech = await globalRateLimiter.execute('trendlyne', async () => {
          return await trendlyne.tlAdvTechnical(tlid, 24);
        }, priority);
        
        if (advTech) {
          const norm = trendlyne.normalizeAdvTechnical(advTech);
          const id = `trendlyne:advtech:${symbol}`;
          const date = new Date().toISOString();
          const title = `Trendlyne Advanced Technicals`;
          const summary = `Score: ${norm.score}, Signal: ${norm.signal}, Decision: ${norm.decision}`;
          
          insertNewsRow({ id, symbol, date, title, summary, url: 'https://trendlyne.com/', sentiment: 0 });
          
          if (this.config.enableRagIndex) {
            setTimeout(async () => {
              try {
                await indexNamespace(symbol, { 
                  texts: [{ 
                    text: summary, 
                    metadata: { 
                      date: date.slice(0,10), 
                      source: 'trendlyne', 
                      url: 'https://trendlyne.com/' 
                    } 
                  }] 
                });
              } catch (err) {
                logger.warn({ err, symbol }, 'trendlyne_rag_indexing_failed');
              }
            }, 0);
          }
        }
        
        await this.sleep(this.config.baseDelayMs);
      } catch (error) {
        logger.warn({ error, symbol }, 'trendlyne_job_failed');
      }
    }
  }

  private async executeYfinJob(job: PrefetchJob, priority: RequestPriority): Promise<void> {
    for (const symbol of job.batch) {
      try {
        const yfin = await globalRateLimiter.execute('yahoo', async () => {
          return await fetchYahooFin(symbol, '1y', '1d');
        }, priority) as YFinCompat;
        
        if (!yfin || yfin.ok === false) {
          await this.sleep(1000); // Brief pause for failed requests
          continue;
        }
        
        const kpiText = this.extractKPIText(yfin);
        const finText = this.makeFinancialSummary(yfin);
        const date = new Date().toISOString();
        const texts: Array<{ text: string; metadata: any }> = [];
        
        if (kpiText) {
          const profileParts = this.extractProfileParts(yfin);
          const sid = `yfin:profile:${symbol}`;
          const s = sentimentScore([kpiText]);
          insertNewsRow({ 
            id: sid, 
            symbol, 
            date, 
            title: 'Yahoo Profile & KPIs', 
            summary: kpiText.slice(0, 960), 
            url: profileParts.website || 'https://finance.yahoo.com/', 
            sentiment: s 
          });
          
          if (this.config.enableRagIndex) {
            texts.push({ text: kpiText, metadata: { date: date.slice(0,10), source: 'yahoo_fin', url: profileParts.website || '' } });
          }
        }
        
        if (finText) {
          const fid = `yfin:financials:${symbol}`;
          const s2 = sentimentScore([finText]);
          insertNewsRow({ 
            id: fid, 
            symbol, 
            date, 
            title: 'Yahoo Financials Summary', 
            summary: finText.slice(0, 960), 
            url: 'https://finance.yahoo.com/', 
            sentiment: s2 
          });
          
          if (this.config.enableRagIndex) {
            texts.push({ text: finText, metadata: { date: date.slice(0,10), source: 'yahoo_fin_financials', url: '' } });
          }
        }
        
        // RAG indexing (non-blocking)
        if (texts.length && this.config.enableRagIndex) {
          setTimeout(async () => {
            try {
              await indexNamespace(symbol, { texts });
            } catch (err) {
              logger.warn({ err, symbol }, 'yfin_rag_indexing_failed');
            }
          }, 0);
        }
        
        await this.sleep(this.config.baseDelayMs);
      } catch (error) {
        logger.warn({ error, symbol }, 'yfin_job_failed');
      }
    }
  }

  private startHealthMonitoring(): void {
    setInterval(() => {
      const report = {
        isRunning: this.isRunning,
        processingJobs: Array.from(this.processingJobs),
        queueSizes: Object.fromEntries(
          Array.from(this.jobQueue.entries()).map(([k, v]) => [k, v.length])
        ),
        stats: this.stats,
        rateLimiterStats: globalRateLimiter.getAllStats()
      };
      
      logger.info(report, 'prefetch_health_report');
    }, 300000); // 5 minutes
  }

  private updateStats(success: boolean, duration: number): void {
    if (success) {
      this.stats.jobsProcessed++;
      this.stats.avgProcessingTime = (this.stats.avgProcessingTime + duration) / 2;
    } else {
      this.stats.jobsFailed++;
    }
    this.stats.lastRun = Date.now();
  }

  private extractSymbolsFromStocklist(filePath: string): string[] {
    try {
      const txt = fs.readFileSync(filePath, 'utf8');
      const regex = /(?:^|[\s,{])symbol\s*:\s*['"]([A-Za-z0-9\-.]+)['"]/g;
      const set = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = regex.exec(txt))) {
        const s = m[1].toUpperCase();
        if (s && s !== '#N/A') set.add(s);
      }
      return Array.from(set);
    } catch (err) {
      logger.error({ err, filePath }, 'stocklist_parse_failed');
      return [];
    }
  }

  private resolveStocklistPath(): string | null {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      process.env.STOCKLIST_PATH && path.resolve(String(process.env.STOCKLIST_PATH)),
      path.resolve(process.cwd(), 'stocklist.ts'),
      path.resolve(process.cwd(), 'server', 'stocklist.ts'),
      path.resolve(here, '..', '..', 'stocklist.ts'),
      path.resolve(here, '..', '..', '..', 'server', 'stocklist.ts')
    ].filter(Boolean) as string[];
    
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private extractKPIText(yfin: any): string {
    const info = yfin?.info || {};
    const qt = yfin?.quote_table || {};
    const sector = info.sector || info.Sector || '';
    const industry = info.industry || info.Industry || '';
    const website = info.website || info.Website || '';
    const summary = info.longBusinessSummary || info.long_business_summary || '';
    const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
    const pe = qt['PE Ratio (TTM)'] || '';
    const eps = qt['EPS (TTM)'] || '';
    
    return `Sector: ${sector}. Industry: ${industry}. Market Cap: ${mcap}. PE: ${pe}. EPS: ${eps}. ${summary}`.trim();
  }

  private extractProfileParts(yfin: any): any {
    const info = yfin?.info || {};
    return {
      sector: info.sector || info.Sector || '',
      industry: info.industry || info.Industry || '',
      website: info.website || info.Website || '',
      summary: info.longBusinessSummary || info.long_business_summary || ''
    };
  }

  private makeFinancialSummary(yfin: any): string {
    // Simplified financial summary extraction
    try {
      const info = yfin?.info || {};
      const qt = yfin?.quote_table || {};
      const sector = info.sector || info.Sector || '';
      const industry = info.industry || info.Industry || '';
      const mcap = qt['Market Cap'] || qt['Market Cap (intraday)'] || '';
      
      return `Sector: ${sector}, Industry: ${industry}, Mcap: ${mcap}`.trim();
    } catch {
      return '';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      processingJobs: Array.from(this.processingJobs),
      queueSizes: Object.fromEntries(
        Array.from(this.jobQueue.entries()).map(([k, v]) => [k, v.length])
      ),
      config: this.config
    };
  }
}

// Types
interface PrefetchConfig {
  quoteBatchSize: number;
  newsBatchSize: number;
  externalBatchSize: number;
  trendlyneBatchSize: number;
  yfinBatchSize: number;
  baseInterval: number;
  newsInterval: number;
  externalInterval: number;
  trendlyneInterval: number;
  yfinInterval: number;
  maxConcurrentJobs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  baseDelayMs: number;
  enableNews: boolean;
  enableExternal: boolean;
  enableTrendlyne: boolean;
  enableYfin: boolean;
  enableRagIndex: boolean;
  useChartFallback: boolean;
  useStooqFallback: boolean;
}

interface PrefetchJob {
  id: string;
  type: JobType;
  batch: string[];
  metadata?: Map<string, string>;
  priority: number;
  createdAt: number;
  attempts: number;
}

type JobType = 'quotes' | 'news' | 'external' | 'trendlyne' | 'yfin';

// Global instance
export const optimizedPrefetchManager = new OptimizedPrefetchManager();
