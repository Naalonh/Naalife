import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../config/env';
import { ownerTelegramId } from '../config/env';
import { createDb } from '../db/supabase';
import { buildCtx, resolveOwnerId } from '../services/context';
import { AppError } from '../utils/errors';
import { verifySession } from '../utils/telegramAuth';

/**
 * Every /api route except the login endpoints goes through here.
 * The owner is established ONLY from a signed session token that was minted after
 * verifying Telegram initData; nothing from the request body or headers is trusted
 * as an identity.
 */
export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AppError(401, 'unauthorized', 'Authentication required');

  const env = c.env;
  const session = await verifySession(token, env.TELEGRAM_BOT_TOKEN, env.SESSION_SECRET);
  if (!session) throw new AppError(401, 'unauthorized', 'Invalid or expired session');
  if (session.telegramId !== ownerTelegramId(env)) throw new AppError(403, 'forbidden', 'This app is private');

  const db = createDb(env);
  const ownerId = await resolveOwnerId(db, env);
  const defer = (p: Promise<unknown>) => {
    const safe = p.catch((e) => console.error('deferred_error', e instanceof Error ? e.name : 'unknown'));
    try {
      c.executionCtx.waitUntil(safe);
    } catch {
      /* no execution context (tests) */
    }
  };
  c.set('ctx', await buildCtx(env, db, ownerId, defer));
  await next();
});
