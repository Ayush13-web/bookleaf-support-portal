import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
}

/** Central error mapping: every failure returns { error: { code, message, details? } }. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details && { details: err.details }) };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  } else if (err.code === '22P02') {
    status = 400; // invalid text representation (bad id format etc.)
    body = { code: 'BAD_REQUEST', message: 'Malformed identifier or value' };
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: body });
}
