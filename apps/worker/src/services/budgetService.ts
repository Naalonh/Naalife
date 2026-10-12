import {
  alertLevels,
  addDays,
  addMonths,
  budgetStatus,
  endOfMonth,
  formatMinor,
  periodRange,
  startOfMonth,
  startOfWeek,
  type Budget,
  type BudgetHistoryEntry,
  type BudgetPeriod,
  type Currency,
} from '@pla/shared';
import type { z } from 'zod';
import type { budgetCreateSchema, budgetUpdateSchema } from '@pla/shared';
import type { Ctx } from '../config/env';
import { isUniqueViolation, unwrap } from '../db/supabase';
import { AppError, notFound } from '../utils/errors';
import { sumRows, type LedgerRow } from './aggregate';
import { getCategories } from './context';
import { fetchLedger } from './financeService';

interface BudgetRow {
  id: string;
  period: BudgetPeriod;
  category_id: string | null;
  amount_minor: number;
  currency: Currency;
  alert_threshold_pct: number;
  active: boolean;
}

async function loadBudgets(ctx: Ctx, id?: string): Promise<BudgetRow[]> {
  let q = ctx.db
    .from('budgets')
    .select('id, period, category_id, amount_minor, currency, alert_threshold_pct, active')
    .eq('owner_id', ctx.ownerId)
    .order('created_at');
  if (id) q = q.eq('id', id);
  return (unwrap(await q, 'budgets') as BudgetRow[]).map((b) => ({ ...b, amount_minor: Number(b.amount_minor) }));
}

function spentFor(rows: LedgerRow[], b: BudgetRow, from: string, to: string): number {
  return sumRows(rows, 'expense', b.currency, from, to, b.category_id);
}

async function decorate(ctx: Ctx, budgets: BudgetRow[], rows: LedgerRow[]): Promise<Budget[]> {
  const cats = await getCategories(ctx);
  return budgets.map((b) => {
    const { from, to } = periodRange(b.period, ctx.today);
    const cat = cats.find((c) => c.id === b.category_id) ?? null;
    return {
      ...b,
      category: cat ? { id: cat.id, slug: cat.slug, name: cat.name, icon: cat.icon, color: cat.color } : null,
      period_from: from,
      period_to: to,
      status: budgetStatus(b.amount_minor, spentFor(rows, b, from, to), b.alert_threshold_pct),
    };
  });
}

/** Earliest date any budget period needs, so one ledger query serves them all. */
function earliestStart(today: string): string {
  const w = startOfWeek(today);
  const m = startOfMonth(today);
  return w < m ? w : m;
}

export async function listBudgets(ctx: Ctx, ledger?: LedgerRow[]): Promise<Budget[]> {
  const budgets = await loadBudgets(ctx);
  if (!budgets.length) return [];
  const rows = ledger ?? (await fetchLedger(ctx, earliestStart(ctx.today), ctx.today));
  return decorate(ctx, budgets, rows);
}

export async function getBudget(ctx: Ctx, id: string): Promise<Budget> {
  const [b] = await loadBudgets(ctx, id);
  if (!b) throw notFound('Budget');
  const rows = await fetchLedger(ctx, earliestStart(ctx.today), ctx.today);
  return (await decorate(ctx, [b], rows))[0];
}

export async function createBudget(ctx: Ctx, input: z.infer<typeof budgetCreateSchema>): Promise<Budget> {
  if (input.category_id) {
    const cats = await getCategories(ctx);
    const c = cats.find((x) => x.id === input.category_id);
    if (!c || c.kind !== 'expense') throw new AppError(400, 'invalid_category', 'Budgets need an expense category');
  }
  const res = await ctx.db
    .from('budgets')
    .insert({ ...input, owner_id: ctx.ownerId })
    .select('id')
    .single();
  if (isUniqueViolation(res.error)) {
    throw new AppError(409, 'duplicate', 'An active budget already exists for this period and category');
  }
  const { id } = unwrap(res, 'create budget') as { id: string };
  return getBudget(ctx, id);
}

export async function updateBudget(ctx: Ctx, id: string, patch: z.infer<typeof budgetUpdateSchema>): Promise<Budget> {
  const res = await ctx.db.from('budgets').update(patch).eq('id', id).eq('owner_id', ctx.ownerId).select('id');
  if (isUniqueViolation(res.error)) {
    throw new AppError(409, 'duplicate', 'An active budget already exists for this period and category');
  }
  const rows = unwrap(res, 'update budget') as Array<{ id: string }>;
  if (!rows.length) throw notFound('Budget');
  return getBudget(ctx, id);
}

export async function deleteBudget(ctx: Ctx, id: string): Promise<void> {
  const rows = unwrap(
    await ctx.db.from('budgets').delete().eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'delete budget',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Budget');
}

function shiftPeriod(period: BudgetPeriod, anchor: string, back: number): { from: string; to: string } {
  if (period === 'daily') {
    const d = addDays(anchor, -back);
    return { from: d, to: d };
  }
  if (period === 'weekly') {
    const from = addDays(startOfWeek(anchor), -7 * back);
    return { from, to: addDays(from, 6) };
  }
  const from = addMonths(anchor, -back);
  return { from, to: endOfMonth(from) };
}

/** Budget history: the last `count` completed + current periods. */
export async function budgetHistory(ctx: Ctx, id: string, count = 6): Promise<BudgetHistoryEntry[]> {
  const [b] = await loadBudgets(ctx, id);
  if (!b) throw notFound('Budget');
  const periods = Array.from({ length: count }, (_, i) => shiftPeriod(b.period, ctx.today, i));
  const earliest = periods[periods.length - 1].from;
  const rows = await fetchLedger(ctx, earliest, ctx.today);
  return periods.map((p) => ({
    period_from: p.from,
    period_to: p.to,
    status: budgetStatus(b.amount_minor, spentFor(rows, b, p.from, p.to), b.alert_threshold_pct),
  }));
}

/**
 * After an expense is recorded, enqueue Telegram warnings for budgets that crossed a
 * threshold. The dedupe key (budget + period + level) guarantees one alert per level
 * per period, no matter how many expenses follow.
 */
export async function enqueueBudgetAlerts(ctx: Ctx, categoryId: string | null): Promise<number> {
  if (!ctx.settings.budget_alerts_enabled) return 0;
  const all = (await loadBudgets(ctx)).filter(
    (b) => b.active && (b.category_id === null || b.category_id === categoryId),
  );
  if (!all.length) return 0;
  const rows = await fetchLedger(ctx, earliestStart(ctx.today), ctx.today);
  const cats = await getCategories(ctx);

  const jobs: Array<Record<string, unknown>> = [];
  for (const b of all) {
    const { from, to } = periodRange(b.period, ctx.today);
    const spent = spentFor(rows, b, from, to);
    const scope = cats.find((c) => c.id === b.category_id)?.name ?? 'Overall';
    for (const level of alertLevels(b.amount_minor, spent, b.alert_threshold_pct)) {
      const text =
        level === 'over'
          ? `🚨 <b>Over budget!</b> ${scope} ${b.period} budget: spent ${formatMinor(spent, b.currency)} of ${formatMinor(b.amount_minor, b.currency)}.`
          : `⚠️ <b>Budget warning</b> — ${scope} ${b.period} budget is at ${Math.round((spent / b.amount_minor) * 100)}%: ${formatMinor(spent, b.currency)} of ${formatMinor(b.amount_minor, b.currency)}.`;
      jobs.push({
        owner_id: ctx.ownerId,
        kind: 'budget_alert',
        dedupe_key: `budget:${b.id}:${from}:${level}`,
        payload: { text },
        due_at: new Date().toISOString(),
      });
    }
  }
  if (!jobs.length) return 0;
  unwrap(
    await ctx.db.from('notification_jobs').upsert(jobs, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }),
    'enqueue budget alerts',
  );
  return jobs.length;
}
