import type { Context } from 'hono';
import type { ZodTypeAny, z } from 'zod';
import type { AppEnv, Ctx } from '../config/env';
import { AppError } from '../utils/errors';

export const getCtx = (c: Context<AppEnv>): Ctx => c.get('ctx');

export async function parseBody<S extends ZodTypeAny>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodTypeAny>(c: Context<AppEnv>, schema: S): z.infer<S> {
  return schema.parse(c.req.query());
}

export function ok<T>(c: Context<AppEnv>, data: T, meta?: { page: number; limit: number; total: number }, status: 200 | 201 = 200) {
  return c.json(meta ? { data, meta } : { data }, status);
}

export function idParam(c: Context<AppEnv>, name = 'id'): string {
  const v = c.req.param(name) ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new AppError(400, 'invalid_id', 'Invalid identifier');
  }
  return v;
}
