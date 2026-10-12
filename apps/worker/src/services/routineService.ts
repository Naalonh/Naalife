import { addDays, eachDay, startOfWeek, type Routine } from '@pla/shared';
import type { z } from 'zod';
import type { routineCreateSchema, routineUpdateSchema } from '@pla/shared';
import type { Ctx } from '../config/env';
import { unwrap } from '../db/supabase';
import { notFound } from '../utils/errors';

interface RoutineRow {
  id: string;
  title: string;
  icon: string | null;
  active: boolean;
}

/** Consecutive completed days ending today (or yesterday if today is still open). */
export function currentStreak(completedDates: Set<string>, today: string): number {
  let cursor = completedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export async function listRoutines(ctx: Ctx): Promise<Routine[]> {
  const [r, c] = await Promise.all([
    ctx.db
      .from('daily_routines')
      .select('id, title, icon, active')
      .eq('owner_id', ctx.ownerId)
      .order('sort_order')
      .order('created_at'),
    ctx.db
      .from('routine_completions')
      .select('routine_id, completed_on')
      .eq('owner_id', ctx.ownerId)
      .gte('completed_on', addDays(ctx.today, -400))
      .lte('completed_on', ctx.today),
  ]);
  const routines = unwrap(r, 'routines') as RoutineRow[];
  const done = new Map<string, Set<string>>();
  for (const row of unwrap(c, 'completions') as Array<{ routine_id: string; completed_on: string }>) {
    if (!done.has(row.routine_id)) done.set(row.routine_id, new Set());
    done.get(row.routine_id)?.add(row.completed_on);
  }
  const weekFrom = startOfWeek(ctx.today);
  const weekDays = eachDay(weekFrom, addDays(weekFrom, 6));
  return routines.map((rt) => {
    const set = done.get(rt.id) ?? new Set<string>();
    return {
      ...rt,
      completed_today: set.has(ctx.today),
      streak: currentStreak(set, ctx.today),
      week: weekDays.map((d) => set.has(d)),
    };
  });
}

export async function createRoutine(ctx: Ctx, input: z.infer<typeof routineCreateSchema>): Promise<Routine> {
  const { id } = unwrap(
    await ctx.db
      .from('daily_routines')
      .insert({ owner_id: ctx.ownerId, title: input.title, icon: input.icon ?? null })
      .select('id')
      .single(),
    'create routine',
  ) as { id: string };
  return getRoutine(ctx, id);
}

async function getRoutine(ctx: Ctx, id: string): Promise<Routine> {
  const r = (await listRoutines(ctx)).find((x) => x.id === id);
  if (!r) throw notFound('Routine');
  return r;
}

export async function updateRoutine(ctx: Ctx, id: string, patch: z.infer<typeof routineUpdateSchema>): Promise<Routine> {
  const rows = unwrap(
    await ctx.db.from('daily_routines').update(patch).eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'update routine',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Routine');
  return getRoutine(ctx, id);
}

export async function setRoutineCompletion(
  ctx: Ctx,
  id: string,
  date: string | undefined,
  completed: boolean,
): Promise<Routine> {
  const day = date ?? ctx.today;
  const owned = unwrap(
    await ctx.db.from('daily_routines').select('id').eq('id', id).eq('owner_id', ctx.ownerId).maybeSingle(),
    'routine',
  );
  if (!owned) throw notFound('Routine');
  if (completed) {
    unwrap(
      await ctx.db
        .from('routine_completions')
        .upsert(
          { routine_id: id, owner_id: ctx.ownerId, completed_on: day },
          { onConflict: 'routine_id,completed_on', ignoreDuplicates: true },
        ),
      'complete routine',
    );
  } else {
    unwrap(
      await ctx.db
        .from('routine_completions')
        .delete()
        .eq('routine_id', id)
        .eq('owner_id', ctx.ownerId)
        .eq('completed_on', day),
      'uncomplete routine',
    );
  }
  return getRoutine(ctx, id);
}

export function weeklySummary(routines: Routine[]): { done: number; possible: number; pct: number } {
  const active = routines.filter((r) => r.active);
  const done = active.reduce((s, r) => s + r.week.filter(Boolean).length, 0);
  const possible = active.length * 7;
  return { done, possible, pct: possible ? Math.round((done / possible) * 100) : 0 };
}
