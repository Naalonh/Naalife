import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from '@pla/shared';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_TELEGRAM_ID: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  APP_URL: string;
  API_URL: string;
  ENVIRONMENT?: string;
  DEV_AUTH_ENABLED?: string;
  /** Optional dedicated session-signing secret; falls back to a key derived from the bot token. */
  SESSION_SECRET?: string;
}

export type Db = SupabaseClient;

/** Per-request context shared by services (after authentication). */
export interface Ctx {
  env: Env;
  db: Db;
  ownerId: string;
  settings: Settings;
  today: string;
  /** Schedule background work (e.g. notification delivery) after the response. */
  defer: (p: Promise<unknown>) => void;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: Ctx };
};

export function ownerTelegramId(env: Env): number {
  const n = Number(env.OWNER_TELEGRAM_ID);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('OWNER_TELEGRAM_ID is not configured');
  return n;
}

/** Dev-only login. Requires BOTH the development environment flag and a loopback host. */
export function devAuthAllowed(env: Env, requestUrl: string): boolean {
  if (env.ENVIRONMENT !== 'development' || env.DEV_AUTH_ENABLED !== 'true') return false;
  const host = new URL(requestUrl).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
