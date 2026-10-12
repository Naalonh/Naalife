import { Hono } from 'hono';
import { telegramAuthSchema, type Me } from '@pla/shared';
import { devAuthAllowed, ownerTelegramId, type AppEnv } from '../config/env';
import { createDb, unwrap } from '../db/supabase';
import { requireOwner } from '../middleware/auth';
import { getCategories, resolveOwnerId } from '../services/context';
import { AppError } from '../utils/errors';
import { InitDataError, signSession, verifyInitData } from '../utils/telegramAuth';
import { getCtx, ok, parseBody } from './util';

export const authRoutes = new Hono<AppEnv>();

/** Exchange signed Telegram initData for a short-lived owner session token. */
authRoutes.post('/auth/telegram', async (c) => {
  const { initData } = await parseBody(c, telegramAuthSchema);
  let user;
  try {
    ({ user } = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN, { maxAgeSeconds: 3600 }));
  } catch (e) {
    if (e instanceof InitDataError) throw new AppError(401, 'unauthorized', 'Invalid Telegram session');
    throw e;
  }
  if (user.id !== ownerTelegramId(c.env)) throw new AppError(403, 'forbidden', 'This app is private');

  const db = createDb(c.env);
  await resolveOwnerId(db, c.env, { first_name: user.first_name, username: user.username });
  const { token, expiresAt } = await signSession(user.id, c.env.TELEGRAM_BOT_TOKEN, c.env.SESSION_SECRET);
  return ok(c, { token, expires_at: expiresAt });
});

/**
 * Development-only login for testing the UI in a normal browser.
 * Returns 404 unless ENVIRONMENT=development AND DEV_AUTH_ENABLED=true AND the host is loopback.
 */
authRoutes.post('/auth/dev', async (c) => {
  if (!devAuthAllowed(c.env, c.req.url)) throw new AppError(404, 'not_found', 'Not found');
  const db = createDb(c.env);
  await resolveOwnerId(db, c.env, { first_name: 'Dev', username: 'dev' });
  const { token, expiresAt } = await signSession(
    ownerTelegramId(c.env),
    c.env.TELEGRAM_BOT_TOKEN,
    c.env.SESSION_SECRET,
  );
  return ok(c, { token, expires_at: expiresAt });
});

export const meRoutes = new Hono<AppEnv>();
// requireOwner is attached per-route (not `use('*')`) so it can't leak onto sibling routers.
meRoutes.get('/me', requireOwner, async (c) => {
  const ctx = getCtx(c);
  const user = unwrap(
    await ctx.db.from('users').select('telegram_id, first_name, username').eq('id', ctx.ownerId).single(),
    'me',
  ) as { telegram_id: number; first_name: string | null; username: string | null };
  const me: Me = {
    telegram_id: Number(user.telegram_id),
    first_name: user.first_name,
    username: user.username,
    settings: ctx.settings,
    categories: await getCategories(ctx),
    today: ctx.today,
  };
  return ok(c, me);
});
