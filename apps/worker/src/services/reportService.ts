import {
  addDays,
  addMonths,
  budgetStatus,
  convertMinor,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  toCsv,
  type Budget,
  type Dashboard,
  type Report,
  type SeriesPoint,
} from '@pla/shared';
import type { Ctx } from '../config/env';
import { fetchAll, unwrap } from '../db/supabase';
import { categoryTotals, dailyTrend, previousWindow, sumRows, type LedgerRow } from './aggregate';
import { getCategories } from './context';
import { fetchLedger, listAccounts, listTransactions, totalBalance, TX_SELECT } from './financeService';
import { listBudgets } from './budgetService';
import {
  listGoals,
  totalDailyTarget,
  totalSaved,
  totalSavedToday,
} from './savingsService';
import { listOccurrences, materializeOccurrences, sortTasks } from './taskService';
import { localParts } from '@pla/shared';

export async function buildDashboard(ctx: Ctx): Promise<Dashboard> {
  const { settings, today } = ctx;
  const cur = settings.preferred_currency;
  const rate = settings.fx_khr_per_usd;
  const monthStart = startOfMonth(today);
  const chartFrom = startOfMonth(addMonths(today, -5));
  const weekStart = startOfWeek(today);

  await materializeOccurrences(ctx.db, ctx.ownerId, today);

  const [accounts, ledger, allGoals, tasks, recent] = await Promise.all([
    listAccounts(ctx),
    fetchLedger(ctx, chartFrom, today),
    listGoals(ctx, { includeArchived: true }),
    listOccurrences(ctx, { from: addDays(today, -60), to: addDays(today, 7), status: 'open', includeOverdue: true }),
    listTransactions(ctx, { page: 1, limit: 8 }),
  ]);
  const budgets = await listBudgets(ctx, ledger.filter((r) => r.occurred_on >= startOfMonth(today) || r.occurred_on >= weekStart));
  const cats = await getCategories(ctx);

  const goals = allGoals.filter((g) => g.status !== 'archived');

  const income_vs_expense: SeriesPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const from = addMonths(today, -i);
    const to = endOfMonth(from);
    income_vs_expense.push({
      label: from.slice(0, 7),
      income_minor: sumRows(ledger, 'income', cur, from, to),
      expense_minor: sumRows(ledger, 'expense', cur, from, to),
    });
  }

  const trendFrom = addDays(today, -13);
  const daily_spending = dailyTrend(ledger, cur, trendFrom, today).map((d) => ({
    date: d.date,
    expense_minor: d.expense_minor,
  }));

  const monthIncome = sumRows(ledger, 'income', cur, monthStart, today);
  const monthExpense = sumRows(ledger, 'expense', cur, monthStart, today);

  const nowLocal = localParts(new Date(), settings.timezone).minutes;
  const upcoming = sortTasks(
    tasks.filter((t) => {
      if (!t.reminder_time || t.status !== 'open') return false;
      if (t.date > today) return true;
      if (t.date < today) return false;
      const [h, m] = t.reminder_time.split(':').map(Number);
      return h * 60 + m >= nowLocal;
    }),
  )
    .sort((a, b) => (a.date + (a.reminder_time ?? '')).localeCompare(b.date + (b.reminder_time ?? '')))
    .slice(0, 5);

  return {
    today,
    currency: cur,
    fx_khr_per_usd: rate,
    available_balance_minor: totalBalance(accounts, cur, rate),
    accounts,
    today_income_minor: sumRows(ledger, 'income', cur, today, today),
    today_expense_minor: sumRows(ledger, 'expense', cur, today, today),
    week_expense_minor: sumRows(ledger, 'expense', cur, weekStart, today),
    month_income_minor: monthIncome,
    month_expense_minor: monthExpense,
    net_cash_flow_minor: monthIncome - monthExpense,
    saving_target_today_minor: totalDailyTarget(goals, cur, rate),
    saved_today_minor: totalSavedToday(allGoals, cur, rate),
    total_savings_minor: totalSaved(allGoals, cur, rate),
    goals,
    tasks_today: sortTasks(tasks.filter((t) => t.date === today)),
    tasks_overdue: sortTasks(tasks.filter((t) => t.overdue)),
    upcoming_reminders: upcoming,
    recent_transactions: recent.rows,
    budgets,
    charts: {
      income_vs_expense,
      daily_spending,
      expense_categories: categoryTotals(ledger, 'expense', cats, cur, monthStart, today),
    },
  };
}

export async function buildReport(
  ctx: Ctx,
  period: Report['period'],
  from: string,
  to: string,
  categoryId?: string,
): Promise<Report> {
  const cur = ctx.settings.preferred_currency;
  const rate = ctx.settings.fx_khr_per_usd;
  const prev = previousWindow(from, to, period === 'monthly');
  const ledgerAll = await fetchLedger(ctx, prev.from, to);
  const ledger: LedgerRow[] = categoryId ? ledgerAll.filter((r) => r.category_id === categoryId) : ledgerAll;
  const cats = await getCategories(ctx);

  const income = sumRows(ledger, 'income', cur, from, to);
  const expense = sumRows(ledger, 'expense', cur, from, to);
  const pIncome = sumRows(ledger, 'income', cur, prev.from, prev.to);
  const pExpense = sumRows(ledger, 'expense', cur, prev.from, prev.to);

  const contribs = unwrap(
    await ctx.db
      .from('savings_contributions')
      .select('amount_minor, goal:savings_goals(currency)')
      .eq('owner_id', ctx.ownerId)
      .is('reversed_at', null)
      .gte('contributed_on', from)
      .lte('contributed_on', to),
    'report contributions',
  ) as unknown as Array<{ amount_minor: number; goal: { currency: 'USD' | 'KHR' } | { currency: 'USD' | 'KHR' }[] | null }>;
  const savings = contribs.reduce((s, c) => {
    const g = Array.isArray(c.goal) ? c.goal[0] : c.goal;
    return s + convertMinor(Number(c.amount_minor), g?.currency ?? cur, cur, rate);
  }, 0);

  const accounts = await listAccounts(ctx);
  // Budgets whose cadence matches the report window, evaluated over exactly this window.
  const budgets: Budget[] = (await listBudgets(ctx, [])).filter((b) => b.period === period);
  const budgetsForWindow = budgets.map((b) => {
    const spent = sumRows(ledgerAll, 'expense', b.currency, from, to, b.category_id);
    return { ...b, period_from: from, period_to: to, status: budgetStatus(b.amount_minor, spent, b.alert_threshold_pct) };
  });

  return {
    period,
    from,
    to,
    currency: cur,
    income_minor: income,
    expense_minor: expense,
    net_minor: income - expense,
    savings_contributions_minor: savings,
    balances: accounts.map((a) => ({
      account_id: a.id,
      name: a.name,
      currency: a.currency,
      balance_minor: a.balance_minor,
    })),
    budgets: budgetsForWindow,
    categories: categoryTotals(ledger, 'expense', cats, cur, from, to),
    income_sources: categoryTotals(ledger, 'income', cats, cur, from, to),
    trend: dailyTrend(ledger, cur, from, to),
    previous: {
      from: prev.from,
      to: prev.to,
      income_minor: pIncome,
      expense_minor: pExpense,
      net_minor: pIncome - pExpense,
    },
  };
}

export function windowFor(period: 'daily' | 'weekly' | 'monthly', anchor: string): { from: string; to: string } {
  if (period === 'daily') return { from: anchor, to: anchor };
  if (period === 'weekly') return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

interface ExportRow {
  occurred_on: string;
  type: string;
  amount_minor: number;
  currency: string;
  account_amount_minor: number;
  fx_khr_per_usd: number;
  description: string;
  source: string;
  category: { name: string } | { name: string }[] | null;
  account: { name: string; currency: string } | { name: string; currency: string }[] | null;
  to_account: { name: string } | { name: string }[] | null;
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Full transaction export (CSV). Amounts are written in major units. */
export async function exportTransactionsCsv(ctx: Ctx, from?: string, to?: string): Promise<string> {
  const rows = await fetchAll<ExportRow>((a, b) => {
    let q = ctx.db
      .from('transactions')
      .select(
        'occurred_on, type, amount_minor, currency, account_amount_minor, fx_khr_per_usd, description, source, category:categories(name), account:financial_accounts!transactions_account_id_fkey(name, currency), to_account:financial_accounts!transactions_to_account_id_fkey(name)',
      )
      .eq('owner_id', ctx.ownerId);
    if (from) q = q.gte('occurred_on', from);
    if (to) q = q.lte('occurred_on', to);
    return q.order('occurred_on').order('id').range(a, b) as unknown as PromiseLike<{
      data: ExportRow[] | null;
      error: { message: string } | null;
    }>;
  });
  const major = (minor: number, cur: string) => (cur === 'KHR' ? String(minor) : (minor / 100).toFixed(2));
  return toCsv(
    ['date', 'type', 'category', 'description', 'amount', 'currency', 'account', 'to_account', 'account_amount', 'account_currency', 'fx_khr_per_usd', 'source'],
    rows.map((r) => {
      const acc = one(r.account);
      return [
        r.occurred_on,
        r.type,
        one(r.category)?.name ?? '',
        r.description,
        major(Number(r.amount_minor), r.currency),
        r.currency,
        acc?.name ?? '',
        one(r.to_account)?.name ?? '',
        major(Number(r.account_amount_minor), acc?.currency ?? r.currency),
        acc?.currency ?? '',
        r.fx_khr_per_usd,
        r.source,
      ];
    }),
  );
}

export { TX_SELECT };
