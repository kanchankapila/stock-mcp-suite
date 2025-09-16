/**
 * Centralized caching service for frontend
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class CacheService {
  private static instance: CacheService;
  private cache = new Map<string, CacheEntry<any>>();

  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public set<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number = 5 * 60 * 1000): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    return factory().then(value => {
      this.set(key, value, ttlMs);
      return value;
    });
  }

  public getSize(): number {
    return this.cache.size;
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Session storage wrapper for persistence across page reloads
export class SessionCacheService {
  private static instance: SessionCacheService;

  private constructor() {}

  public static getInstance(): SessionCacheService {
    if (!SessionCacheService.instance) {
      SessionCacheService.instance = new SessionCacheService();
    }
    return SessionCacheService.instance;
  }

  public set<T>(key: string, value: T, ttlMs: number = 2 * 60 * 60 * 1000): void {
    try {
      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl: ttlMs
      };
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to set session cache:', error);
    }
  }

  public get<T>(key: string): T | null {
    try {
      const stored = sessionStorage.getItem(key);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      const now = Date.now();
      
      if (now - entry.timestamp > entry.ttl) {
        sessionStorage.removeItem(key);
        return null;
      }

      return entry.value;
    } catch (error) {
      console.warn('Failed to get session cache:', error);
      return null;
    }
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to delete session cache:', error);
    }
  }
}
