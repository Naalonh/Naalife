import { Hono } from 'hono';
import type { AppEnv } from '../config/env';
import { handleWebhook } from '../bot/webhook';

/**
 * Telegram webhook. Not behind the session-token middleware (Telegram can't send one);
 * instead every request must carry the secret set via setWebhook(secret_token),
 * and only updates from OWNER_TELEGRAM_ID are acted upon.
 */
export const telegramRoutes = new Hono<AppEnv>();

telegramRoutes.post('/webhook', (c) => handleWebhook(c));
