/**
 * Base service class with common functionality
 */

import { ResponseUtils, ApiResponse } from '../utils/response.utils.js';
import { ValidationUtils } from '../utils/validation.utils.js';
import { logger } from '../../utils/logger.js';

export abstract class BaseService {
  protected logger = logger;

  protected validateSymbol(symbol: string): void {
    const validation = ValidationUtils.validateSymbol(symbol);
    if (!validation.isValid) {
      throw new Error(`Invalid symbol: ${validation.errors.join(', ')}`);
    }
  }

  protected validatePagination(page?: number, limit?: number): void {
    const validation = ValidationUtils.validatePagination(page, limit);
    if (!validation.isValid) {
      throw new Error(`Invalid pagination: ${validation.errors.join(', ')}`);
    }
  }

  protected validateDateRange(from: string, to: string): void {
    const validation = ValidationUtils.validateDateRange(from, to);
    if (!validation.isValid) {
      throw new Error(`Invalid date range: ${validation.errors.join(', ')}`);
    }
  }

  protected handleError(error: any, context: string): ApiResponse {
    this.logger.error({ error, context }, 'service_error');
    
    if (error instanceof Error) {
      return ResponseUtils.error(error.message, `Error in ${context}`);
    }
    
    return ResponseUtils.internalError(`Unexpected error in ${context}`);
  }

  protected success<T>(data: T, message?: string, meta?: any): ApiResponse<T> {
    return ResponseUtils.success(data, message, meta);
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        this.logger.warn({ attempt, maxRetries, error }, 'retry_attempt');
        await this.delay(delayMs * attempt);
      }
    }
    
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected sanitizeInput(input: any): string {
    if (typeof input !== 'string') {
      return String(input || '');
    }
    return input.trim();
  }

  protected formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().slice(0, 10);
  }

  protected isValidDate(date: any): boolean {
    if (!date) return false;
    const d = new Date(date);
    return !isNaN(d.getTime());
  }
}
