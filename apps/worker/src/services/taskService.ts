import {
  OCCURRENCE_HORIZON_DAYS,
  isPausedByDay,
  WORK_CATEGORIES,
  addDays,
  occurrenceDates,
  startOfWeek,
  type RecurrenceRule,
  type RecurrenceType,
  type TaskCreate,
  type TaskItem,
  type TaskStats,
  type TaskUpdate,
} from '@pla/shared';
import type { Ctx, Db } from '../config/env';
import { unwrap } from '../db/supabase';
import { AppError, notFound } from '../utils/errors';
import { marksByDate } from './dayMarkService';

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  category: TaskItem['category'];
  priority: TaskItem['priority'];
  due_date: string;
  due_time: string | null;
  reminder_time: string | null;
  recurrence_type: RecurrenceType;
  recurrence_interval: number;
  recurrence_days: number[];
  recurrence_until: string | null;
}

interface OccurrenceRow {
  id: string;
  task_id: string;
  occurrence_date: string;
  status: 'open' | 'done' | 'skipped';
  completed_at: string | null;
  task: TaskRow;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function ruleOf(t: TaskRow): RecurrenceRule {
  return {
    type: t.recurrence_type,
    interval: t.recurrence_interval,
    days: t.recurrence_days ?? [],
    anchor: t.due_date,
    until: t.recurrence_until,
  };
}

function toItem(o: OccurrenceRow, today: string): TaskItem {
  const t = o.task;
  return {
    occurrence_id: o.id,
    task_id: o.task_id,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    date: o.occurrence_date,
    due_time: hhmm(t.due_time),
    reminder_time: hhmm(t.reminder_time),
    status: o.status,
    completed_at: o.completed_at,
    recurrence_type: t.recurrence_type,
    recurrence_interval: t.recurrence_interval,
    recurrence_days: t.recurrence_days ?? [],
    recurrence_until: t.recurrence_until,
    overdue: o.status === 'open' && o.occurrence_date < today,
  };
}

const OCC_SELECT =
  'id, task_id, occurrence_date, status, completed_at, task:tasks(id, title, description, category, priority, due_date, due_time, reminder_time, recurrence_type, recurrence_interval, recurrence_days, recurrence_until)';

/**
 * Materialise upcoming occurrences. The (task_id, occurrence_date) unique constraint plus
 * ON CONFLICT DO NOTHING makes this safe to run from the API, the bot and cron concurrently.
 */
export async function materializeOccurrences(
  db: Db,
  ownerId: string,
  today: string,
  tasks?: TaskRow[],
): Promise<number> {
  const list =
    tasks ??
    (unwrap(
      await db
        .from('tasks')
        .select('id, title, description, category, priority, due_date, due_time, reminder_time, recurrence_type, recurrence_interval, recurrence_days, recurrence_until')
        .eq('owner_id', ownerId)
        .neq('recurrence_type', 'none')
        .or(`recurrence_until.is.null,recurrence_until.gte.${today}`),
      'recurring tasks',
    ) as TaskRow[]);

  const horizon = addDays(today, OCCURRENCE_HORIZON_DAYS);
  const rows: Array<Record<string, unknown>> = [];
  for (const t of list) {
    const from = t.recurrence_type === 'none' ? t.due_date : today;
    for (const d of occurrenceDates(ruleOf(t), from, t.recurrence_type === 'none' ? t.due_date : horizon)) {
      rows.push({ task_id: t.id, owner_id: ownerId, occurrence_date: d });
    }
  }
  if (!rows.length) return 0;
  unwrap(
    await db.from('task_occurrences').upsert(rows, { onConflict: 'task_id,occurrence_date', ignoreDuplicates: true }),
    'materialize occurrences',
  );
  return rows.length;
}

export async function listOccurrences(
  ctx: Ctx,
  opts: { from: string; to: string; status?: 'open' | 'done' | 'skipped' | 'all'; includeOverdue?: boolean },
): Promise<TaskItem[]> {
  let q = ctx.db.from('task_occurrences').select(OCC_SELECT).eq('owner_id', ctx.ownerId).lte('occurrence_date', opts.to);
  if (opts.includeOverdue) {
    q = q.or(`occurrence_date.gte.${opts.from},status.eq.open`);
  } else {
    q = q.gte('occurrence_date', opts.from);
  }
  // 'all' means open + done; skipped occurrences are only returned when asked for explicitly
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
  else q = q.neq('status', 'skipped');
  const rows = unwrap(
    await q.order('occurrence_date').order('created_at').limit(1000),
    'occurrences',
  ) as unknown as OccurrenceRow[];
  // Repeating work/business tasks are paused on study / day-off / holiday days.
  const candidates = rows.filter(
    (r) => r.task.recurrence_type !== 'none' && (WORK_CATEGORIES as readonly string[]).includes(r.task.category),
  );
  let kept = rows;
  if (candidates.length) {
    const dates = candidates.map((r) => r.occurrence_date).sort();
    const marks = await marksByDate(ctx.db, ctx.ownerId, dates[0], dates[dates.length - 1]);
    if (marks.size) {
      kept = rows.filter(
        (r) =>
          !isPausedByDay(
            {
              category: r.task.category,
              recurrence_type: r.task.recurrence_type,
              due_time: r.task.due_time,
              reminder_time: r.task.reminder_time,
            },
            marks.get(r.occurrence_date),
          ),
      );
    }
  }
  return kept.map((r) => toItem(r, ctx.today));
}

export async function listTasks(
  ctx: Ctx,
  opts: { from?: string; to?: string; status?: 'open' | 'done' | 'skipped' | 'all' },
): Promise<TaskItem[]> {
  await materializeOccurrences(ctx.db, ctx.ownerId, ctx.today);
  const from = opts.from ?? addDays(ctx.today, -30);
  const to = opts.to ?? addDays(ctx.today, OCCURRENCE_HORIZON_DAYS);
  // overdue (open, before `from`) items are always included for the default view
  return listOccurrences(ctx, { from, to, status: opts.status, includeOverdue: !opts.from });
}

export async function createTask(ctx: Ctx, input: TaskCreate): Promise<TaskItem[]> {
  const due = input.due_date ?? ctx.today;
  const { id } = unwrap(
    await ctx.db
      .from('tasks')
      .insert({
        owner_id: ctx.ownerId,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        due_date: due,
        due_time: input.due_time ?? null,
        reminder_time: input.reminder_time ?? null,
        recurrence_type: input.recurrence_type,
        recurrence_interval: input.recurrence_interval,
        recurrence_days: input.recurrence_days,
        recurrence_until: input.recurrence_until ?? null,
      })
      .select('id')
      .single(),
    'create task',
  ) as { id: string };
  await syncOccurrences(ctx, id);
  return occurrencesOfTask(ctx, id);
}

async function loadTask(ctx: Ctx, id: string): Promise<TaskRow> {
  const t = unwrap(
    await ctx.db
      .from('tasks')
      .select('id, title, description, category, priority, due_date, due_time, reminder_time, recurrence_type, recurrence_interval, recurrence_days, recurrence_until')
      .eq('id', id)
      .eq('owner_id', ctx.ownerId)
      .maybeSingle(),
    'task',
  ) as TaskRow | null;
  if (!t) throw notFound('Task');
  return t;
}

/** Re-create the future schedule after a task's recurrence rule or date changed. */
async function syncOccurrences(ctx: Ctx, taskId: string): Promise<void> {
  const task = await loadTask(ctx, taskId);
  if (task.recurrence_type === 'none') {
    // exactly one occurrence, on the due date; move the open one if the date changed
    const existing = unwrap(
      await ctx.db.from('task_occurrences').select('id, occurrence_date, status').eq('task_id', taskId),
      'occ',
    ) as Array<{ id: string; occurrence_date: string; status: string }>;
    const keep = existing.find((o) => o.occurrence_date === task.due_date);
    for (const o of existing) {
      if (o !== keep && o.status === 'open') {
        await ctx.db.from('task_occurrences').delete().eq('id', o.id);
      }
    }
  } else {
    // drop open future occurrences that no longer match the rule, keep done ones as history
    const valid = new Set(
      occurrenceDates(ruleOf(task), ctx.today, addDays(ctx.today, OCCURRENCE_HORIZON_DAYS * 4)),
    );
    const future = unwrap(
      await ctx.db
        .from('task_occurrences')
        .select('id, occurrence_date, status')
        .eq('task_id', taskId)
        .gte('occurrence_date', ctx.today),
      'occ',
    ) as Array<{ id: string; occurrence_date: string; status: string }>;
    const stale = future.filter((o) => o.status === 'open' && !valid.has(o.occurrence_date)).map((o) => o.id);
    if (stale.length) await ctx.db.from('task_occurrences').delete().in('id', stale);
  }
  await materializeOccurrences(ctx.db, ctx.ownerId, ctx.today, [task]);
}

async function occurrencesOfTask(ctx: Ctx, taskId: string): Promise<TaskItem[]> {
  const rows = unwrap(
    await ctx.db
      .from('task_occurrences')
      .select(OCC_SELECT)
      .eq('owner_id', ctx.ownerId)
      .eq('task_id', taskId)
      .order('occurrence_date')
      .limit(60),
    'occurrences',
  ) as unknown as OccurrenceRow[];
  return rows.map((r) => toItem(r, ctx.today));
}

export async function updateTask(ctx: Ctx, id: string, patch: TaskUpdate): Promise<TaskItem[]> {
  const task = await loadTask(ctx, id);
  const { completed, skipped, occurrence_date, ...fields } = patch;

  if (skipped === true && task.recurrence_type === 'none') {
    throw new AppError(400, 'bad_request', 'Only repeating tasks can be skipped');
  }

  if (completed !== undefined || skipped !== undefined) {
    const date = occurrence_date ?? task.due_date;
    const status = skipped !== undefined ? (skipped ? 'skipped' : 'open') : completed ? 'done' : 'open';
    const rows = unwrap(
      await ctx.db
        .from('task_occurrences')
        .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
        .eq('task_id', id)
        .eq('owner_id', ctx.ownerId)
        .eq('occurrence_date', date)
        .select('id'),
      'complete occurrence',
    ) as Array<{ id: string }>;
    if (!rows.length) throw notFound('Task occurrence');
  }

  if (Object.keys(fields).length) {
    const next = { ...task, ...fields } as TaskRow;
    if (next.recurrence_until && next.recurrence_until < next.due_date) {
      throw new AppError(400, 'bad_request', 'Repeat-until date must not be before the start date');
    }
    unwrap(await ctx.db.from('tasks').update(fields).eq('id', id).eq('owner_id', ctx.ownerId), 'update task');
    await syncOccurrences(ctx, id);
  }
  return occurrencesOfTask(ctx, id);
}

export async function deleteTask(ctx: Ctx, id: string): Promise<void> {
  const rows = unwrap(
    await ctx.db.from('tasks').delete().eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'delete task',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Task');
}

export async function taskStats(ctx: Ctx): Promise<TaskStats> {
  const weekFrom = startOfWeek(ctx.today);
  const items = await listOccurrences(ctx, { from: weekFrom, to: addDays(weekFrom, 6) });
  const todayItems = items.filter((i) => i.date === ctx.today);
  const weekDone = items.filter((i) => i.status === 'done').length;
  const overdueCount = (
    await listOccurrences(ctx, { from: '1970-01-01', to: addDays(ctx.today, -1), status: 'open' })
  ).filter((i) => i.overdue).length;
  return {
    today_total: todayItems.length,
    today_done: todayItems.filter((i) => i.status === 'done').length,
    overdue: overdueCount,
    week_total: items.length,
    week_done: weekDone,
    completion_rate_pct: items.length ? Math.round((weekDone / items.length) * 100) : 0,
  };
}

export const PRIORITY_RANK: Record<TaskItem['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortTasks(items: TaskItem[]): TaskItem[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}
