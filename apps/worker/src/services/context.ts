import {
  DEFAULT_FX_KHR_PER_USD,
  DEFAULT_NOTIFICATION_TIMES,
  DEFAULT_TIMEZONE,
  NOTIFICATION_KINDS,
  type Category,
  type Currency,
  type NotificationKind,
  type Settings,
} from '@pla/shared';
import type { Ctx, Db, Env } from '../config/env';
import { ownerTelegramId } from '../config/env';
import { unwrap } from '../db/supabase';
import { todayIn } from '../utils/dates';

interface SettingsRow {
  preferred_currency: Currency;
  secondary_currency: Currency;
  fx_khr_per_usd: number | string;
  timezone: string;
  theme: 'dark' | 'light' | 'system';
  default_account_id: string | null;
  task_reminders_enabled: boolean;
  budget_alerts_enabled: boolean;
  bakong_account_type: 'individual' | 'merchant';
  bakong_account_id: string | null;
  bakong_merchant_name: string | null;
  bakong_merchant_city: string;
  bakong_phone: string | null;
  bakong_merchant_id: string | null;
  bakong_acquiring_bank: string | null;
  bakong_store_label: string | null;
}

interface PrefRow {
  kind: NotificationKind;
  enabled: boolean;
  local_time: string;
}

// An isolate-lifetime cache of the (immutable) owner id. Safe: it is derived from the
// OWNER_TELEGRAM_ID secret and the database row is created once.
const ownerIdCache = new Map<number, string>();

export async function resolveOwnerId(
  db: Db,
  env: Env,
  profile: { first_name?: string | null; username?: string | null } = {},
): Promise<string> {
  const tgId = ownerTelegramId(env);
  const hit = ownerIdCache.get(tgId);
  if (hit && !profile.first_name && !profile.username) return hit;
  const id = unwrap(
    await db.rpc('bootstrap_owner', {
      p_telegram_id: tgId,
      p_first_name: profile.first_name ?? null,
      p_username: profile.username ?? null,
    }),
    'bootstrap_owner',
  ) as string;
  ownerIdCache.set(tgId, id);
  return id;
}

export async function loadSettings(db: Db, ownerId: string): Promise<Settings> {
  const [s, p] = await Promise.all([
    db.from('user_settings').select('*').eq('user_id', ownerId).maybeSingle(),
    db.from('notification_preferences').select('kind, enabled, local_time').eq('owner_id', ownerId),
  ]);
  const row = unwrap(s, 'settings') as SettingsRow | null;
  const prefs = (unwrap(p, 'prefs') ?? []) as PrefRow[];
  return {
    preferred_currency: row?.preferred_currency ?? 'USD',
    secondary_currency: row?.secondary_currency ?? 'KHR',
    fx_khr_per_usd: Number(row?.fx_khr_per_usd ?? DEFAULT_FX_KHR_PER_USD),
    timezone: row?.timezone ?? DEFAULT_TIMEZONE,
    theme: row?.theme ?? 'dark',
    default_account_id: row?.default_account_id ?? null,
    task_reminders_enabled: row?.task_reminders_enabled ?? true,
    budget_alerts_enabled: row?.budget_alerts_enabled ?? true,
    bakong_account_type: row?.bakong_account_type ?? 'individual',
    bakong_account_id: row?.bakong_account_id ?? null,
    bakong_merchant_name: row?.bakong_merchant_name ?? null,
    bakong_merchant_city: row?.bakong_merchant_city ?? 'Phnom Penh',
    bakong_phone: row?.bakong_phone ?? null,
    bakong_merchant_id: row?.bakong_merchant_id ?? null,
    bakong_acquiring_bank: row?.bakong_acquiring_bank ?? null,
    bakong_store_label: row?.bakong_store_label ?? null,
    notifications: NOTIFICATION_KINDS.map((kind) => {
      const found = prefs.find((x) => x.kind === kind);
      return {
        kind,
        enabled: found?.enabled ?? true,
        local_time: (found?.local_time ?? DEFAULT_NOTIFICATION_TIMES[kind]).slice(0, 5),
      };
    }),
  };
}

export async function buildCtx(
  env: Env,
  db: Db,
  ownerId: string,
  defer: Ctx['defer'],
  now = new Date(),
): Promise<Ctx> {
  const settings = await loadSettings(db, ownerId);
  return { env, db, ownerId, settings, today: todayIn(settings.timezone, now), defer };
}

const categoryCache = new WeakMap<Ctx, Category[]>();

export async function getCategories(ctx: Ctx): Promise<Category[]> {
  const hit = categoryCache.get(ctx);
  if (hit) return hit;
  const rows = unwrap(
    await ctx.db
      .from('categories')
      .select('id, kind, slug, name, icon, color')
      .eq('owner_id', ctx.ownerId)
      .order('kind')
      .order('sort_order'),
    'categories',
  ) as Category[];
  categoryCache.set(ctx, rows);
  return rows;
}
