import {
  convertMinor,
  goalProgress,
  type Contribution,
  type Currency,
  type SavingsGoal,
} from '@pla/shared';
import type { z } from 'zod';
import type { contributionCreateSchema, goalCreateSchema, goalUpdateSchema } from '@pla/shared';
import type { Ctx } from '../config/env';
import { unwrap } from '../db/supabase';
import { AppError, notFound } from '../utils/errors';

interface GoalRow {
  id: string;
  name: string;
  target_minor: number;
  currency: Currency;
  start_date: string;
  target_date: string;
  status: SavingsGoal['status'];
  completed_at: string | null;
  created_at: string;
}

async function savedTotals(ctx: Ctx): Promise<Map<string, number>> {
  const rows = unwrap(
    await ctx.db.from('savings_goal_totals').select('goal_id, saved_minor').eq('owner_id', ctx.ownerId),
    'goal totals',
  ) as Array<{ goal_id: string; saved_minor: number }>;
  return new Map(rows.map((r) => [r.goal_id, Number(r.saved_minor)]));
}

async function savedToday(ctx: Ctx): Promise<Map<string, number>> {
  const rows = unwrap(
    await ctx.db
      .from('savings_contributions')
      .select('goal_id, amount_minor')
      .eq('owner_id', ctx.ownerId)
      .eq('contributed_on', ctx.today)
      .is('reversed_at', null),
    'contributions today',
  ) as Array<{ goal_id: string; amount_minor: number }>;
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.goal_id, (m.get(r.goal_id) ?? 0) + Number(r.amount_minor));
  return m;
}

export async function listGoals(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Promise<SavingsGoal[]> {
  let q = ctx.db
    .from('savings_goals')
    .select('id, name, target_minor, currency, start_date, target_date, status, completed_at, created_at')
    .eq('owner_id', ctx.ownerId)
    .order('target_date');
  if (!opts.includeArchived) q = q.neq('status', 'archived');
  const [goals, totals, today] = await Promise.all([q, savedTotals(ctx), savedToday(ctx)]);
  return (unwrap(goals, 'goals') as GoalRow[]).map((g) => {
    const saved = totals.get(g.id) ?? 0;
    const target = Number(g.target_minor);
    return {
      ...g,
      target_minor: target,
      saved_minor: saved,
      saved_today_minor: today.get(g.id) ?? 0,
      ...goalProgress(target, saved, ctx.today, g.target_date),
      // finished goals don't ask for more money
      ...(g.status === 'completed' ? { daily_requirement_minor: 0 } : {}),
    };
  });
}

export async function getGoal(ctx: Ctx, id: string): Promise<SavingsGoal> {
  const g = (await listGoals(ctx, { includeArchived: true })).find((x) => x.id === id);
  if (!g) throw notFound('Savings goal');
  return g;
}

export async function createGoal(ctx: Ctx, input: z.infer<typeof goalCreateSchema>): Promise<SavingsGoal> {
  const start = input.start_date ?? ctx.today;
  if (input.target_date < start) throw new AppError(400, 'bad_request', 'Target date must not be before start date');
  const { id } = unwrap(
    await ctx.db
      .from('savings_goals')
      .insert({
        owner_id: ctx.ownerId,
        name: input.name,
        target_minor: input.target_minor,
        currency: input.currency,
        start_date: start,
        target_date: input.target_date,
      })
      .select('id')
      .single(),
    'create goal',
  ) as { id: string };
  return getGoal(ctx, id);
}

export async function updateGoal(ctx: Ctx, id: string, patch: z.infer<typeof goalUpdateSchema>): Promise<SavingsGoal> {
  const current = await getGoal(ctx, id);
  const update: Record<string, unknown> = { ...patch };
  if (patch.target_date && patch.target_date < current.start_date) {
    throw new AppError(400, 'bad_request', 'Target date must not be before start date');
  }
  if (patch.target_minor !== undefined && current.status !== 'archived') {
    // raising the target re-opens a completed goal; lowering it may complete it
    const completed = current.saved_minor >= patch.target_minor;
    if (completed && current.status === 'active') {
      update.status = 'completed';
      update.completed_at = new Date().toISOString();
    } else if (!completed && current.status === 'completed') {
      update.status = 'active';
      update.completed_at = null;
    }
  }
  if (patch.status === 'active' && current.status === 'archived') {
    const t = patch.target_minor ?? current.target_minor;
    if (current.saved_minor >= t) {
      update.status = 'completed';
      update.completed_at = new Date().toISOString();
    }
  }
  const rows = unwrap(
    await ctx.db.from('savings_goals').update(update).eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'update goal',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Savings goal');
  return getGoal(ctx, id);
}

/** Permanently removes the goal. Its contributions cascade away, returning funded cash to the accounts. */
export async function deleteGoal(ctx: Ctx, id: string): Promise<void> {
  const rows = unwrap(
    await ctx.db.from('savings_goals').delete().eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'delete goal',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Savings goal');
}

export async function listContributions(ctx: Ctx, goalId: string): Promise<Contribution[]> {
  await getGoal(ctx, goalId);
  const rows = unwrap(
    await ctx.db
      .from('savings_contributions')
      .select('id, goal_id, amount_minor, account_id, account_amount_minor, contributed_on, note, reversed_at, created_at')
      .eq('owner_id', ctx.ownerId)
      .eq('goal_id', goalId)
      .order('contributed_on', { ascending: false })
      .order('created_at', { ascending: false }),
    'contributions',
  ) as Contribution[];
  return rows.map((r) => ({
    ...r,
    amount_minor: Number(r.amount_minor),
    account_amount_minor: r.account_amount_minor === null ? null : Number(r.account_amount_minor),
  }));
}

export interface ContributionResult {
  goal: SavingsGoal;
  goal_completed: boolean;
  duplicate: boolean;
}

export async function addContribution(
  ctx: Ctx,
  goalId: string,
  input: z.infer<typeof contributionCreateSchema>,
): Promise<ContributionResult> {
  const goal = await getGoal(ctx, goalId);
  if (goal.status !== 'active') {
    throw new AppError(409, 'goal_not_active', 'Contributions can only be added to active goals');
  }
  let accountAmount: number | null = null;
  if (input.account_id) {
    const acc = unwrap(
      await ctx.db
        .from('financial_accounts')
        .select('currency, is_archived')
        .eq('id', input.account_id)
        .eq('owner_id', ctx.ownerId)
        .maybeSingle(),
      'account',
    ) as { currency: Currency; is_archived: boolean } | null;
    if (!acc || acc.is_archived) throw notFound('Account');
    accountAmount = convertMinor(input.amount_minor, goal.currency, acc.currency, ctx.settings.fx_khr_per_usd);
    if (accountAmount <= 0) throw new AppError(400, 'amount_too_small', 'Amount is too small for this account');
  }

  const res = await ctx.db.rpc('add_savings_contribution', {
    p_owner: ctx.ownerId,
    p_goal: goalId,
    p_amount: input.amount_minor,
    p_account: input.account_id ?? null,
    p_account_amount: accountAmount,
    p_on: input.contributed_on ?? ctx.today,
    p_note: input.note,
    p_request: input.client_request_id ?? null,
  });
  if (res.error) {
    if (res.error.code === 'P0001') throw new AppError(409, 'goal_not_active', 'Goal is not active');
    if (res.error.code === 'P0002') throw notFound('Goal or account');
  }
  const out = unwrap(res, 'add contribution') as { goal_completed: boolean; duplicate: boolean };
  return { goal: await getGoal(ctx, goalId), goal_completed: out.goal_completed && !out.duplicate, duplicate: out.duplicate };
}

export async function reverseContribution(ctx: Ctx, goalId: string, contributionId: string): Promise<SavingsGoal> {
  const owned = unwrap(
    await ctx.db
      .from('savings_contributions')
      .select('id')
      .eq('id', contributionId)
      .eq('goal_id', goalId)
      .eq('owner_id', ctx.ownerId)
      .maybeSingle(),
    'contribution',
  );
  if (!owned) throw notFound('Contribution');
  const res = await ctx.db.rpc('reverse_savings_contribution', { p_owner: ctx.ownerId, p_contribution: contributionId });
  if (res.error?.code === 'P0001') throw new AppError(409, 'already_reversed', 'Contribution already reversed');
  unwrap(res, 'reverse contribution');
  return getGoal(ctx, goalId);
}

/** Sum of daily requirements across active goals, expressed in `display`. */
export function totalDailyTarget(goals: SavingsGoal[], display: Currency, rate: number): number {
  return goals
    .filter((g) => g.status === 'active')
    .reduce((s, g) => s + convertMinor(g.daily_requirement_minor, g.currency, display, rate), 0);
}

export function totalSavedToday(goals: SavingsGoal[], display: Currency, rate: number): number {
  return goals.reduce((s, g) => s + convertMinor(g.saved_today_minor, g.currency, display, rate), 0);
}

/** Includes archived goals: archiving hides a goal but the money is still saved. */
export function totalSaved(goals: SavingsGoal[], display: Currency, rate: number): number {
  return goals.reduce((s, g) => s + convertMinor(g.saved_minor, g.currency, display, rate), 0);
}
