/**
 * Shared response utilities for consistent API responses
 */

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: any;
  };
}

export class ResponseUtils {
  public static success<T>(data: T, message?: string, meta?: any): ApiResponse<T> {
    return {
      ok: true,
      data,
      message,
      meta
    };
  }

  public static error(error: string | Error, message?: string): ApiResponse {
    return {
      ok: false,
      error: error instanceof Error ? error.message : error,
      message
    };
  }

  public static validationError(field: string, message: string): ApiResponse {
    return {
      ok: false,
      error: `Validation failed for ${field}`,
      message
    };
  }

  public static notFound(resource: string): ApiResponse {
    return {
      ok: false,
      error: `${resource} not found`,
      message: `The requested ${resource} could not be found`
    };
  }

  public static unauthorized(message = 'Unauthorized'): ApiResponse {
    return {
      ok: false,
      error: 'Unauthorized',
      message
    };
  }

  public static forbidden(message = 'Forbidden'): ApiResponse {
    return {
      ok: false,
      error: 'Forbidden',
      message
    };
  }

  public static rateLimited(message = 'Rate limit exceeded'): ApiResponse {
    return {
      ok: false,
      error: 'Rate limit exceeded',
      message
    };
  }

  public static internalError(message = 'Internal server error'): ApiResponse {
    return {
      ok: false,
      error: 'Internal server error',
      message
    };
  }

  public static paginated<T>(
    data: T[],
    total: number,
    page: number = 1,
    limit: number = 10
  ): ApiResponse<T[]> {
    return {
      ok: true,
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }
}
