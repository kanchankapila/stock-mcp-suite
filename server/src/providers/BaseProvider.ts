// BaseProvider.ts
// Standard interface + shared types for pluggable data providers.
// Each concrete provider implements ingest() returning structured results.

import type * as DB from '../db.js';
import { logger } from '../utils/logger.js';

export type ProviderKind = 'prices' | 'news' | 'fundamentals' | 'derivatives' | 'indices' | 'mixed';

export interface RagIndexer {
  index(symbol: string, texts: { text: string; metadata?: Record<string, any> }[]): Promise<void>;
}

export interface RetryConfig { maxRetries: number; backoffBaseMs: number; }

export interface ProviderContext {
  db: typeof DB;
  logger: typeof logger;
  rag?: RagIndexer; // Optional RAG indexer hook
  env: NodeJS.ProcessEnv;
  rateLimiter?: { waitFor(cost?: number): Promise<void> };
  retryConfig?: RetryConfig;
}

export interface IngestionOptions {
  symbols?: string[];              // Symbols to ingest (if provider supports symbols)
  since?: string;                  // ISO date cutoff for incremental ingestion
  limit?: number;                  // Max items per symbol
  ragEnabled?: boolean;            // Whether to push text into vector store
  dryRun?: boolean;                // If true, do not persist
  apiKey?: string;                 // Optional provider API key override
}

export interface IngestionError { symbol?: string; error: string; cause?: unknown }

export interface IngestionResult {
  providerId: string;
  startedAt: string;
  finishedAt: string;
  symbolsTried: string[];
  prices?: Array<{ symbol: string; date: string; open:number; high:number; low:number; close:number; volume:number }>;
  news?: Array<{ id:string; symbol:string; date:string; title:string; summary:string; url:string; sentiment?: number|null }>;
  docs?: Array<{ symbol: string; text: string; metadata?: Record<string, any> }>;
  providerData?: Array<{ provider_id:string; symbol:string; captured_at:string; payload:any }>;
  errors?: IngestionError[];
  meta?: Record<string, any>;
}

export interface BaseProvider {
  id: string;                      // unique id referenced in config
  name: string;                    // human readable
  kind: ProviderKind;
  supportsSymbol: boolean;         // false for global / index-wide providers
  defaultBatchSize?: number;       // optional hint
  ingest(ctx: ProviderContext, opts: IngestionOptions): Promise<IngestionResult>;
}

export function createBaseResult(providerId: string, symbols: string[] = []): IngestionResult {
  return {
    providerId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    symbolsTried: symbols,
    prices: [],
    news: [],
    docs: [],
    providerData: [],
    errors: [],
    meta: {}
  };
}
