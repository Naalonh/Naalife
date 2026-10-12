import {
  DEFAULT_NOTIFICATION_TIMES,
  dueDailyNotifications,
  formatMinor,
  localParts,
  localToUtc,
  retryDelayMinutes,
  scheduleStatus,
  type NotificationKind,
  type TaskItem,
} from '@pla/shared';
import type { Ctx, Env } from '../config/env';
import { ownerTelegramId } from '../config/env';
import { createDb, unwrap } from '../db/supabase';
import { sumRows } from './aggregate';
import { buildCtx, resolveOwnerId } from './context';
import { fetchLedger, listAccounts, totalBalance } from './financeService';
import { listBudgets } from './budgetService';
import { listGoals, totalDailyTarget, totalSavedToday } from './savingsService';
import { listOccurrences, sortTasks } from './taskService';
import { escapeHtml, sendTelegramMessage } from './telegram';

export interface NotificationJob {
  id: string;
  owner_id: string;
  kind: NotificationKind | 'task_reminder' | 'budget_alert';
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

const PRIORITY_ICON: Record<TaskItem['priority'], string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

function taskLine(t: TaskItem): string {
  const time = t.due_time ? ` · ${t.due_time}` : '';
  return `${PRIORITY_ICON[t.priority]} ${escapeHtml(t.title)}${time}`;
}

// ---- message builders ---------------------------------------------------------

export async function morningMessage(ctx: Ctx): Promise<string> {
  const cur = ctx.settings.preferred_currency;
  const rate = ctx.settings.fx_khr_per_usd;
  const [tasks, goals] = await Promise.all([
    listOccurrences(ctx, { from: ctx.today, to: ctx.today, status: 'open' }),
    listGoals(ctx),
  ]);
  const overdue = await listOccurrences(ctx, { from: '1970-01-01', to: ctx.today, status: 'open' });
  const overdueCount = overdue.filter((t) => t.overdue).length;
  const lines = ['☀️ <b>Good morning!</b>', ''];
  if (tasks.length) {
    lines.push(`📝 <b>Today's tasks (${tasks.length})</b>`);
    lines.push(...sortTasks(tasks).slice(0, 8).map(taskLine));
  } else {
    lines.push('📝 No tasks scheduled for today.');
  }
  if (overdueCount) lines.push('', `⚠️ ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`);
  const target = totalDailyTarget(goals, cur, rate);
  lines.push('', target > 0 ? `💰 Today's saving target: <b>${formatMinor(target, cur)}</b>` : '💰 No active savings target today.');
  return lines.join('\n');
}

export async function savingsMessage(ctx: Ctx): Promise<string | null> {
  const cur = ctx.settings.preferred_currency;
  const rate = ctx.settings.fx_khr_per_usd;
  const goals = await listGoals(ctx);
  const target = totalDailyTarget(goals, cur, rate);
  if (target <= 0) return null;
  const saved = totalSavedToday(goals, cur, rate);
  if (saved >= target) {
    return `🎉 <b>Savings target reached!</b>\nYou saved ${formatMinor(saved, cur)} today (target ${formatMinor(target, cur)}).`;
  }
  // goals that have fallen behind an even plan (missed days); the daily target already includes catch-up
  const behind = goals
    .filter((g) => g.status === 'active')
    .map((g) => ({ g, s: scheduleStatus(g.target_minor, g.saved_minor, g.start_date, g.target_date, ctx.today) }))
    .filter(({ s }) => s.state === 'behind')
    .map(({ g, s }) => `⚠️ ${escapeHtml(g.name)}: behind by ${formatMinor(-s.diff_minor, g.currency)}`);
  return [
    '💰 <b>Savings reminder</b>',
    `Today's target: ${formatMinor(target, cur)}`,
    `Saved so far: ${formatMinor(saved, cur)}`,
    `Still to go: <b>${formatMinor(target - saved, cur)}</b>`,
    ...(behind.length ? ['', ...behind, 'Today’s target already includes the catch-up.'] : []),
  ].join('\n');
}

export async function dailySummaryText(ctx: Ctx): Promise<string> {
  const cur = ctx.settings.preferred_currency;
  const rate = ctx.settings.fx_khr_per_usd;
  const [ledger, accounts] = await Promise.all([fetchLedger(ctx, ctx.today, ctx.today), listAccounts(ctx)]);
  const income = sumRows(ledger, 'income', cur);
  const expense = sumRows(ledger, 'expense', cur);
  return [
    `📊 <b>Today (${ctx.today})</b>`,
    `Income: ${formatMinor(income, cur)}`,
    `Expenses: ${formatMinor(expense, cur)}`,
    `Net: <b>${formatMinor(income - expense, cur, { sign: true })}</b>`,
    `Balance: ${formatMinor(totalBalance(accounts, cur, rate), cur)}`,
  ].join('\n');
}

export async function eveningMessage(ctx: Ctx): Promise<string> {
  const summary = await dailySummaryText(ctx);
  const open = await listOccurrences(ctx, { from: ctx.today, to: ctx.today, status: 'open' });
  const budgets = (await listBudgets(ctx)).filter((b) => b.active && b.status.level !== 'ok');
  const lines = [summary];
  if (budgets.length) {
    lines.push('', ...budgets.map((b) => `⚠️ ${escapeHtml(b.category?.name ?? 'Overall')} ${b.period} budget at ${b.status.used_pct}%`));
  }
  if (open.length) {
    lines.push('', `⏳ <b>${open.length} unfinished task${open.length > 1 ? 's' : ''}</b>`, ...sortTasks(open).slice(0, 8).map(taskLine));
  } else {
    lines.push('', '✅ All of today\'s tasks are done. Nice work!');
  }
  return lines.join('\n');
}

/** Returns null when the job no longer needs to be sent (e.g. task already completed). */
async function renderJob(ctx: Ctx, job: NotificationJob): Promise<string | null> {
  switch (job.kind) {
    case 'morning':
      return morningMessage(ctx);
    case 'savings':
      return savingsMessage(ctx);
    case 'evening':
      return eveningMessage(ctx);
    case 'budget_alert':
      return typeof job.payload.text === 'string' ? job.payload.text : null;
    case 'task_reminder': {
      const id = String(job.payload.occurrence_id ?? '');
      const rows = await listOccurrences(ctx, { from: '1970-01-01', to: '2999-12-31', status: 'open' });
      const t = rows.find((r) => r.occurrence_id === id);
      return t ? `⏰ <b>Reminder</b>\n${taskLine(t)}${t.description ? `\n${escapeHtml(t.description)}` : ''}` : null;
    }
  }
}

// ---- job creation -----------------------------------------------------------------

/** Create (idempotently) the notification jobs that are due at `now`. */
export async function ensureDueJobs(ctx: Ctx, now: Date): Promise<number> {
  const jobs: Array<Record<string, unknown>> = [];

  for (const d of dueDailyNotifications(now, ctx.settings.timezone, ctx.settings.notifications)) {
    jobs.push({
      owner_id: ctx.ownerId,
      kind: d.kind,
      dedupe_key: d.dedupe_key,
      due_at: d.due_at.toISOString(),
    });
  }

  if (ctx.settings.task_reminders_enabled) {
    const local = localParts(now, ctx.settings.timezone);
    const open = await listOccurrences(ctx, { from: local.date, to: local.date, status: 'open' });
    for (const t of open) {
      if (!t.reminder_time) continue;
      const [h, m] = t.reminder_time.split(':').map(Number);
      const late = local.minutes - (h * 60 + m);
      if (late < 0 || late > 180) continue;
      jobs.push({
        owner_id: ctx.ownerId,
        kind: 'task_reminder',
        dedupe_key: `task:${t.occurrence_id}`,
        payload: { occurrence_id: t.occurrence_id },
        due_at: localToUtc(t.date, t.reminder_time, ctx.settings.timezone).toISOString(),
      });
    }
  }

  if (!jobs.length) return 0;
  // ON CONFLICT DO NOTHING on (owner_id, dedupe_key): re-running never re-creates or resets a job.
  unwrap(
    await ctx.db.from('notification_jobs').upsert(jobs, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }),
    'ensure jobs',
  );
  return jobs.length;
}

// ---- delivery -----------------------------------------------------------------------

/**
 * Claim due jobs atomically (FOR UPDATE SKIP LOCKED), deliver them and record the result.
 * Safe to call concurrently from cron and from request handlers.
 */
export async function processDueJobs(env: Env, ctx?: Ctx, limit = 10, now = new Date()): Promise<number> {
  const db = ctx?.db ?? createDb(env);
  const claimed = unwrap(
    await db.rpc('claim_notification_jobs', { p_limit: limit, p_now: now.toISOString() }),
    'claim jobs',
  ) as NotificationJob[] | null;
  if (!claimed?.length) return 0;

  const c =
    ctx ?? (await buildCtx(env, db, await resolveOwnerId(db, env), (p) => void p.catch(() => undefined), now));
  const chatId = ownerTelegramId(env);

  for (const job of claimed) {
    try {
      const text = await renderJob(c, job);
      if (text === null) {
        await db.from('notification_jobs').update({ status: 'skipped', locked_at: null }).eq('id', job.id);
        continue;
      }
      const res = await sendTelegramMessage(env, chatId, text);
      await db.from('notification_delivery_logs').insert({
        job_id: job.id,
        attempt: job.attempts,
        status: res.ok ? 'sent' : 'failed',
        http_status: res.status,
        error: res.ok ? null : res.error?.slice(0, 300),
        telegram_message_id: res.messageId ?? null,
      });
      if (res.ok) {
        await db
          .from('notification_jobs')
          .update({ status: 'sent', sent_at: new Date().toISOString(), locked_at: null, last_error: null })
          .eq('id', job.id);
      } else {
        await markFailed(db, job, res.error ?? 'send failed', Boolean(res.permanent));
      }
    } catch (e) {
      await markFailed(db, job, e instanceof Error ? e.message : 'unknown error', false);
    }
  }
  return claimed.length;
}

async function markFailed(db: Ctx['db'], job: NotificationJob, error: string, permanent: boolean): Promise<void> {
  const exhausted = permanent || job.attempts >= job.max_attempts;
  await db
    .from('notification_jobs')
    .update(
      exhausted
        ? { status: 'failed', locked_at: null, last_error: error.slice(0, 300) }
        : {
            status: 'pending',
            locked_at: null,
            last_error: error.slice(0, 300),
            next_attempt_at: new Date(Date.now() + retryDelayMinutes(job.attempts) * 60_000).toISOString(),
          },
    )
    .eq('id', job.id);
}

export { DEFAULT_NOTIFICATION_TIMES };
