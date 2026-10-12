import { Hono } from 'hono';
import { settingsUpdateSchema } from '@pla/shared';
import type { AppEnv } from '../config/env';
import { unwrap } from '../db/supabase';
import { requireOwner } from '../middleware/auth';
import { loadSettings } from '../services/context';
import { AppError } from '../utils/errors';
import { getCtx, ok, parseBody } from './util';

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use('*', requireOwner);

settingsRoutes.get('/', async (c) => ok(c, getCtx(c).settings));

settingsRoutes.patch('/', async (c) => {
  const ctx = getCtx(c);
  const { notifications, ...fields } = await parseBody(c, settingsUpdateSchema);

  if (fields.default_account_id) {
    const acc = unwrap(
      await ctx.db
        .from('financial_accounts')
        .select('id')
        .eq('id', fields.default_account_id)
        .eq('owner_id', ctx.ownerId)
        .eq('is_archived', false)
        .maybeSingle(),
      'default account',
    );
    if (!acc) throw new AppError(400, 'invalid_account', 'Unknown account');
  }

  if (Object.keys(fields).length) {
    unwrap(await ctx.db.from('user_settings').update(fields).eq('user_id', ctx.ownerId), 'update settings');
  }
  if (notifications?.length) {
    unwrap(
      await ctx.db.from('notification_preferences').upsert(
        notifications.map((n) => ({ owner_id: ctx.ownerId, kind: n.kind, enabled: n.enabled, local_time: n.local_time })),
        { onConflict: 'owner_id,kind' },
      ),
      'update notification prefs',
    );
  }
  return ok(c, await loadSettings(ctx.db, ctx.ownerId));
});
