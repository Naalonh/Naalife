import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { MoneyError } from '@pla/shared';
import { AppError } from '../utils/errors';

/** Single place that turns exceptions into the consistent `{ error: {...} }` envelope. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      err.status,
    );
  }
  // duck-typed: schemas come from @pla/shared, which may resolve its own copy of zod
  if (err instanceof ZodError || (err as { name?: string }).name === 'ZodError') {
    const issues = (err as ZodError).issues ?? [];
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  if (err instanceof MoneyError) {
    return c.json({ error: { code: 'invalid_amount', message: err.message } }, 400);
  }
  // Never echo internals or request bodies (they contain financial data).
  console.error('unhandled_error', err instanceof Error ? err.name : typeof err);
  return c.json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
};
