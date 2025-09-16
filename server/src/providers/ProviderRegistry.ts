import fs from 'fs';
import path from 'path';
import { AlphaVantageProvider } from './AlphaVantageProvider.js';
import { NewsApiProvider } from './NewsProvider.js';
import { BaseProvider } from './BaseProvider.js';
import { StooqProvider } from './StooqProvider.js';
import { MoneycontrolProvider } from './MoneycontrolProvider.js';
import { TrendlyneProvider } from './TrendlyneProvider.js';
import { logger } from '../utils/logger.js';
import { upsertProvider } from '../db.js';
import { z } from 'zod';

export interface ProviderConfigEntry {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  ragEnabled?: boolean;
  symbols?: string[];
  apiKeyEnv?: string;
  queryMode?: string;
  rateLimitRpm?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  scheduleCron?: string;
  disableOnFailures?: number;
  [k: string]: any;
}

const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['prices','news','fundamentals','derivatives','indices','mixed']),
  enabled: z.boolean().default(true),
  ragEnabled: z.boolean().optional(),
  symbols: z.array(z.string().min(1)).optional(),
  apiKeyEnv: z.string().optional(),
  queryMode: z.string().optional(),
  rateLimitRpm: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  backoffBaseMs: z.number().int().min(100).max(60000).optional(),
  scheduleCron: z.string().optional(),
  disableOnFailures: z.number().int().min(1).max(20).optional()
}).passthrough();

class RegistryImpl {
  private providers = new Map<string, BaseProvider>();
  private config: ProviderConfigEntry[] = [];
  private disabled = new Set<string>();

  loadConfig(configPath?: string) {
    const root = process.cwd();
    const candidates = configPath ? [configPath] : [
      path.resolve(root, 'providers.config.json'),
      path.resolve(root, '..', 'providers.config.json')
    ];
    for (const guess of candidates) {
      try {
        const raw = fs.readFileSync(guess, 'utf8');
        const json = JSON.parse(raw);
        if (!Array.isArray(json)) throw new Error('providers.config.json must be an array');
        const parsed: ProviderConfigEntry[] = [];
        for (const entry of json) {
          const r = ProviderConfigSchema.safeParse(entry);
            if (!r.success) {
              logger.warn({ id: (entry && entry.id) || 'unknown', issues: r.error.issues }, 'provider_config_invalid_entry');
              continue;
            }
            parsed.push(r.data as ProviderConfigEntry);
        }
        this.config = parsed;
        logger.info({ count: this.config.length, file: guess }, 'providers_config_loaded');
        // Warn for missing API keys on enabled providers requiring them
        for (const c of this.config) {
          if (c.enabled && c.apiKeyEnv) {
            const keyName = c.apiKeyEnv.trim();
            if (!process.env[keyName]) {
              logger.warn({ provider: c.id, apiKeyEnv: keyName }, 'provider_api_key_missing_env');
            }
          }
        }
        return;
      } catch (err) {
        logger.debug({ err, file: guess }, 'providers_config_candidate_failed');
      }
    }
    logger.warn({ tried: candidates }, 'providers_config_not_found');
    this.config = [];
  }

  initProviders() {
    for (const entry of this.config) {
      let impl: BaseProvider | null = null;
      switch (entry.id) {
        case 'alphavantage': impl = new AlphaVantageProvider(); break;
        case 'newsapi': {
          const qm = (['symbol','name','symbolOrName'] as const).includes((entry.queryMode||'symbol') as any) ? entry.queryMode as 'symbol'|'name'|'symbolOrName' : 'symbol';
          impl = new NewsApiProvider(qm);
          break;
        }
        case 'stooq': impl = new StooqProvider(); break;
        case 'moneycontrol': impl = new MoneycontrolProvider(); break;
        case 'trendlyne': impl = new TrendlyneProvider(); break;
        default:
          logger.warn({ id: entry.id }, 'provider_unknown_skipped');
      }
      if (!impl) continue;
      this.providers.set(entry.id, impl);
      upsertProvider({ id: impl.id, name: impl.name, kind: impl.kind, enabled: !!entry.enabled, rag_enabled: !!entry.ragEnabled, config: entry });
    }
  }

  get(id: string) { 
    return this.disabled.has(id) ? null : (this.providers.get(id) || null); 
  }

  isDisabled(id: string) { 
    return this.disabled.has(id); 
  }

  disable(id: string, reason?: string) { 
    if (this.providers.has(id)) { 
      this.disabled.add(id); 
      logger.warn({ provider: id, reason }, 'provider_runtime_disabled'); 
    } 
  }

  enable(id: string) { 
    if (this.disabled.delete(id)) { 
      logger.info({ provider: id }, 'provider_runtime_enabled'); 
    } 
  }

  list() { 
    return Array.from(this.providers.values()).map(p => { 
      const cfg = this.getConfig(p.id); 
      return { 
        id: p.id, 
        name: p.name, 
        kind: p.kind, 
        supportsSymbol: p.supportsSymbol, 
        scheduleCron: cfg?.scheduleCron, 
        rateLimitRpm: cfg?.rateLimitRpm,
        disabled: this.disabled.has(p.id)
      }; 
    }); 
  }

  getConfig(id: string) { 
    return this.config.find(c => c.id === id) || null; 
  }
}

export const ProviderRegistry = new RegistryImpl();

export function bootstrapProviders(configPath?: string) {
  ProviderRegistry.loadConfig(configPath);
  ProviderRegistry.initProviders();
  return ProviderRegistry.list();
}
