import type { Request, Response, NextFunction } from 'express';
import { ResponseUtils } from '../shared/utils/response.utils.js';
import { logger } from '../utils/logger.js';

/** 404 handler placed after all route mounts */
export function notFoundHandler(_req: Request, res: Response) {
  // Generic endpoint not found response
  res.status(404).json(ResponseUtils.notFound('endpoint'));
}

/** Central error handler - MUST have 4 args to be recognized by Express */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = Number(err?.status || err?.statusCode || 500);

  // Basic shape normalisation
  let response;
  if (err?.validationErrors && Array.isArray(err.validationErrors)) {
    // If upstream provided a list of validation issues
    const msg = err.message || 'Validation failed';
    response = { ok: false, error: 'Validation Error', message: msg, meta: { errors: err.validationErrors } };
  } else if (status === 404) {
    response = ResponseUtils.notFound(err?.resource || 'resource');
  } else if (status === 401) {
    response = ResponseUtils.unauthorized(err?.message || 'Unauthorized');
  } else if (status === 403) {
    response = ResponseUtils.forbidden(err?.message || 'Forbidden');
  } else if (status === 429) {
    response = ResponseUtils.rateLimited(err?.message || 'Rate limit exceeded');
  } else if (status >= 500) {
    // Avoid leaking internal details
    response = ResponseUtils.internalError();
  } else {
    response = ResponseUtils.error(err?.message || 'Request failed');
  }

  // Log after constructing response (omit large bodies)
  logger.error({
    err: {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
      status
    },
    url: req.originalUrl,
    method: req.method
  }, 'request_error');

  res.status(status).json(response);
}
