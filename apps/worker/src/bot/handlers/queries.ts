import { addDays, formatMinor, startOfMonth } from '@pla/shared';
import type { Ctx } from '../../config/env';
import { dailySummaryText } from '../../services/notificationService';
import { listAccounts, totalBalance } from '../../services/financeService';
import { buildReport } from '../../services/reportService';
import { listGoals, totalDailyTarget, totalSavedToday } from '../../services/savingsService';
import { listOccurrences, materializeOccurrences, sortTasks } from '../../services/taskService';
import { escapeHtml } from '../../services/telegram';
import type { TaskItem } from '@pla/shared';

export async function balanceText(ctx: Ctx): Promise<string> {
  const cur = ctx.settings.preferred_currency;
  const accounts = await listAccounts(ctx);
  const lines = ['💳 <b>Balances</b>'];
  for (const a of accounts) lines.push(`${escapeHtml(a.name)}: ${formatMinor(a.balance_minor, a.currency)}`);
  lines.push('', `Available: <b>${formatMinor(totalBalance(accounts, cur, ctx.settings.fx_khr_per_usd), cur)}</b>`);
  return lines.join('\n');
}

export async function todayText(ctx: Ctx): Promise<string> {
  return dailySummaryText(ctx);
}

export async function todayTasks(ctx: Ctx): Promise<{ text: string; items: TaskItem[] }> {
  await materializeOccurrences(ctx.db, ctx.ownerId, ctx.today);
  const items = sortTasks(await listOccurrences(ctx, { from: ctx.today, to: ctx.today, status: 'open' }));
  const overdue = (await listOccurrences(ctx, { from: addDays(ctx.today, -60), to: addDays(ctx.today, -1), status: 'open' })).length;
  if (!items.length && !overdue) return { text: '🎉 You have no open tasks today.', items };
  const lines = [`📝 <b>Today's tasks (${items.length})</b>`];
  for (const t of items) lines.push(`• ${escapeHtml(t.title)}${t.due_time ? ` · ${t.due_time}` : ''}`);
  if (overdue) lines.push('', `⚠️ ${overdue} overdue`);
  return { text: lines.join('\n'), items };
}

export async function savingsText(ctx: Ctx): Promise<string> {
  const cur = ctx.settings.preferred_currency;
  const rate = ctx.settings.fx_khr_per_usd;
  const goals = await listGoals(ctx);
  if (!goals.length) return '🎯 No savings goals yet. Create one in the app.';
  const lines = ['🎯 <b>Savings progress</b>'];
  for (const g of goals) {
    lines.push(
      `<b>${escapeHtml(g.name)}</b> — ${g.progress_pct}%`,
      `${formatMinor(g.saved_minor, g.currency)} / ${formatMinor(g.target_minor, g.currency)} · ${formatMinor(g.daily_requirement_minor, g.currency)}/day · ${g.days_remaining}d left`,
    );
  }
  const target = totalDailyTarget(goals, cur, rate);
  lines.push('', `Today: ${formatMinor(totalSavedToday(goals, cur, rate), cur)} / ${formatMinor(target, cur)}`);
  return lines.join('\n');
}

export async function monthlyReportText(ctx: Ctx): Promise<string> {
  const from = startOfMonth(ctx.today);
  const r = await buildReport(ctx, 'monthly', from, ctx.today);
  const cur = r.currency;
  const lines = [
    `📈 <b>Report ${from.slice(0, 7)}</b>`,
    `Income: ${formatMinor(r.income_minor, cur)}`,
    `Expenses: ${formatMinor(r.expense_minor, cur)}`,
    `Net: <b>${formatMinor(r.net_minor, cur, { sign: true })}</b>`,
    `Saved: ${formatMinor(r.savings_contributions_minor, cur)}`,
  ];
  if (r.categories.length) {
    lines.push('', '<b>Top spending</b>');
    for (const c of r.categories.slice(0, 5)) lines.push(`• ${escapeHtml(c.name)}: ${formatMinor(c.total_minor, cur)}`);
  }
  return lines.join('\n');
}

export const HELP_TEXT = [
  '🧭 <b>Commands</b>',
  '/start — Welcome',
  '/app — Open Mini App',
  '/expense — Record an expense (<code>/expense 2.50 lunch</code>)',
  '/income — Record income (<code>/income 500 salary</code>)',
  '/balance — View available balance',
  '/today — Daily financial summary',
  '/tasks — View today\'s tasks',
  '/save — Savings progress',
  '/report — Monthly report',
  '/help — Command list',
].join('\n');
