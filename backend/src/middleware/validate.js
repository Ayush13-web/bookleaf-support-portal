import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

/**
 * Validates and coerces request parts against zod schemas.
 * Usage: validate({ params, query, body })
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return next(AppError.validation(err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    }
    next(err);
  }
};
