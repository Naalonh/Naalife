import { createClient } from '@supabase/supabase-js';
import type { Db, Env } from '../config/env';
import { AppError } from '../utils/errors';

export function createDb(env: Env): Db {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

interface PgResult<T> {
  data: T | null;
  error: { code?: string; message: string } | null;
}

/** Unwrap a PostgREST result; DB messages are logged (code only), never returned to clients. */
export function unwrap<T>(res: PgResult<T>, what = 'query'): T {
  if (res.error) {
    console.error(`db_error ${what}`, res.error.code ?? '', res.error.message.slice(0, 200));
    throw new AppError(500, 'db_error', 'Database operation failed');
  }
  return res.data as T;
}

export function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

/** Page through a PostgREST query (default max 1000 rows per request). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PgResult<T[]>>,
  pageSize = 1000,
  maxRows = 20000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const rows = unwrap(await build(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Escape user text for use inside PostgREST ilike patterns. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
