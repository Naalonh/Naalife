import { createHmac } from 'node:crypto';
import type { Env } from '../src/config/env';

export const BOT_TOKEN = '123456:TEST-bot-token';
export const OWNER_ID = 424242;

export const baseEnv: Env = {
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
  OWNER_TELEGRAM_ID: String(OWNER_ID),
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  APP_URL: 'https://app.example.com',
  API_URL: 'https://api.example.com',
  ENVIRONMENT: 'production',
};

/** Builds a correctly signed Telegram initData string, as Telegram clients do. */
export function signedInitData(
  user: { id: number; first_name?: string },
  opts: { token?: string; authDate?: number; tamper?: boolean } = {},
): string {
  const params: Record<string, string> = {
    auth_date: String(opts.authDate ?? Math.floor(Date.now() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ first_name: 'Test', ...user }),
  };
  const dcs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(opts.token ?? BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  const search = new URLSearchParams({ ...params, hash });
  if (opts.tamper) search.set('user', JSON.stringify({ id: OWNER_ID + 1, first_name: 'Eve' }));
  return search.toString();
}
