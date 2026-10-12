import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  ListTodo,
  Minus,
  PiggyBank,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Dashboard as DashboardData } from '@pla/shared';
import { Badge, Card, CardTitle, Skeleton } from '@/components/ui/card';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Button } from '@/components/ui/button';
import { Ring } from '@/components/ui/ring';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/layout/PageHeader';
import { TransactionRow } from '@/components/finance/TransactionRow';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { TaskCard } from '@/components/tasks/TaskCard';
import { GoalCard } from '@/components/savings/GoalCard';
import { CategoryDonut, IncomeExpenseChart, SavingsProgressChart, SpendingTrendChart } from '@/components/charts/Charts';
import { useOwner } from '@/contexts/AuthContext';
import { useSheets } from '@/contexts/SheetContext';
import { useDashboard } from '@/hooks/queries';
import { useMoney } from '@/lib/money';
import { prettyDate, WEEKDAY_SHORT, weekday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

/** Remembered per device only; purely cosmetic privacy. */
function useHideBalance(): [boolean, () => void] {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('pla.hideBalance') === '1';
    } catch {
      return false;
    }
  });
  return [
    hidden,
    () =>
      setHidden((h) => {
        try {
          localStorage.setItem('pla.hideBalance', h ? '0' : '1');
        } catch {
          /* ignore */
        }
        return !h;
      }),
  ];
}

function SectionHeader({ title, to, label = t('See all') }: { title: string; to?: string; label?: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
      {to && (
        <Link to={to} className="flex items-center text-xs font-bold text-primary">
          {label} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function Carousel({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{children}</div>
  );
}

/** One-line, context-aware nudge shown above the fold. */
function smartInsight(d: DashboardData, fmt: (n: number) => string): { tone: 'danger' | 'warning' | 'info' | 'primary'; icon: LucideIcon; text: string } {
  const over = d.budgets.find((b) => b.active && b.status.level === 'over');
  if (over) {
    return { tone: 'danger', icon: AlertTriangle, text: t('Over budget: {0} ({1})', over.category?.name ? t(over.category.name) : t('All spending'), t(over.period)) };
  }
  const warn = d.budgets.find((b) => b.active && b.status.level === 'warning');
  if (warn) {
    return {
      tone: 'warning',
      icon: AlertTriangle,
      text: t('{0} {1} budget is {2}% used', warn.category?.name ? t(warn.category.name) : t('Spending'), t(warn.period), Math.round(warn.status.used_pct)),
    };
  }
  const left = d.saving_target_today_minor - d.saved_today_minor;
  if (d.saving_target_today_minor > 0 && left > 0) {
    return { tone: 'info', icon: PiggyBank, text: t('Save {0} more today to stay on track', fmt(left)) };
  }
  if (d.tasks_overdue.length > 0) {
    return { tone: 'warning', icon: ListTodo, text: t(d.tasks_overdue.length > 1 ? '{0} overdue tasks need attention' : '{0} overdue task needs attention', d.tasks_overdue.length) };
  }
  return { tone: 'primary', icon: Sparkles, text: t('You\'re on track today. Nice work!') };
}

const TONE_BOX = {
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  primary: 'bg-primary/15 text-primary',
} as const;

function WeekBars({ data, today }: { data: Array<{ date: string; expense_minor: number }>; today: string }) {
  const week = data.slice(-7);
  const max = Math.max(...week.map((d) => d.expense_minor), 1);
  return (
    <div className="flex h-24 items-end justify-between gap-1.5">
      {week.map((d) => {
        const isToday = d.date === today;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end">
              <div
                className={cn(
                  'w-full rounded-lg transition-all duration-700',
                  isToday ? 'bg-gradient-to-t from-primary to-info' : 'bg-foreground/[0.14]',
                )}
                style={{ height: `${Math.max(8, (d.expense_minor / max) * 100)}%` }}
              />
            </div>
            <span className={cn('text-[10px] font-bold', isToday ? 'text-primary' : 'text-muted-foreground')}>
              {WEEKDAY_SHORT[weekday(d.date)].slice(0, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-52 rounded-4xl" />
      <Skeleton className="h-16 rounded-3xl" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-3xl" />
    </div>
  );
}

type Chart = 'flow' | 'daily' | 'mix' | 'goals';

export default function Dashboard() {
  const me = useOwner();
  const { fmt, cur } = useMoney();
  const sheets = useSheets();
  const q = useDashboard();
  const d = q.data;
  const [hidden, toggleHidden] = useHideBalance();
  const [chart, setChart] = useState<Chart>('flow');

  const name = me.first_name ?? t('there');
  const insight = useMemo(() => (d ? smartInsight(d, (n) => fmt(n)) : null), [d, fmt]);
  const todayTasks = d?.tasks_today ?? [];
  const done = todayTasks.filter((t) => t.status === 'done').length;
  const taskPct = todayTasks.length ? (done / todayTasks.length) * 100 : 0;
  const savePct = d && d.saving_target_today_minor > 0 ? (d.saved_today_minor / d.saving_target_today_minor) * 100 : 0;
  const mask = '••••••';

  return (
    <div>
      <header className="flex items-center gap-3 pb-4 pt-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-extrabold text-primary-foreground shadow-glow">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {greeting()}
            {d ? ` · ${prettyDate(d.today, d.today)}, ${d.today.slice(5)}` : ''}
          </p>
          <h1 className="truncate text-xl font-extrabold tracking-tight">{name}</h1>
        </div>
        <Link
          to="/reports"
          aria-label={t('Reports')}
          className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground"
        >
          <BarChart3 className="h-5 w-5" />
        </Link>
      </header>

      {q.isLoading && <DashboardSkeleton />}
      {q.isError && (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" />}
          title={t('Couldn\'t load your dashboard')}
          hint={t('Check your connection and try again.')}
          action={
            <Button variant="secondary" onClick={() => void q.refetch()}>
              {t('Retry')}
            </Button>
          }
        />
      )}

      {d && insight && (
        <div className="stagger space-y-4">
          {/* hero */}
          <section className="hero relative overflow-hidden rounded-4xl p-5 text-white">
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-white/75">
                  <Wallet className="h-4 w-4" /> {t('Available balance')}
                </p>
                <button
                  type="button"
                  aria-label={hidden ? t('Show balance') : t('Hide balance')}
                  onClick={toggleHidden}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm"
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[2.7rem] font-extrabold leading-none tracking-tightest tabular-nums">
                {hidden ? mask : <AnimatedMoney minor={d.available_balance_minor} currency={cur} />}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
                      <ArrowDownLeft className="h-3 w-3" />
                    </span>
                    {t('Income today')}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums">{hidden ? mask : fmt(d.today_income_minor)}</p>
                </div>
                <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                    {t('Spent today')}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums">{hidden ? mask : fmt(d.today_expense_minor)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* smart insight */}
          <div className="glass flex items-center gap-3 rounded-3xl p-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', TONE_BOX[insight.tone])}>
              <insight.icon className="h-5 w-5" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{insight.text}</p>
          </div>

          {/* quick actions */}
          <section className="grid grid-cols-4 gap-2" aria-label={t('Quick actions')}>
            {(
              [
                { icon: Minus, label: t('Expense'), tone: 'bg-danger/15 text-danger', run: () => sheets.open({ kind: 'transaction', type: 'expense' }) },
                { icon: Plus, label: t('Income'), tone: 'bg-primary/15 text-primary', run: () => sheets.open({ kind: 'transaction', type: 'income' }) },
                { icon: PiggyBank, label: t('Savings'), tone: 'bg-info/15 text-info', run: () => sheets.open({ kind: 'contribution' }) },
                { icon: ListTodo, label: t('Task'), tone: 'bg-accent/15 text-accent', run: () => sheets.open({ kind: 'task' }) },
              ] as Array<{ icon: LucideIcon; label: string; tone: string; run: () => void }>
            ).map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.run}
                className="glass pressable flex flex-col items-center gap-2 rounded-3xl px-1 py-3.5 text-xs font-bold"
              >
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', a.tone)}>
                  <a.icon className="h-5 w-5" strokeWidth={2.4} />
                </span>
                {a.label}
              </button>
            ))}
          </section>

          {/* accounts carousel */}
          <section className="space-y-2.5">
            <SectionHeader title={t('Accounts')} to="/finance" />
            <Carousel>
              {d.accounts.map((a) => (
                <Link
                  key={a.id}
                  to="/finance"
                  className="glass pressable w-[44%] min-w-[9.5rem] shrink-0 snap-start rounded-3xl p-3.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Landmark className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-3 truncate text-xs font-semibold text-muted-foreground">{a.name}</p>
                  <p className="text-base font-extrabold tabular-nums">{hidden ? mask : fmt(a.balance_minor, a.currency)}</p>
                </Link>
              ))}
            </Carousel>
          </section>

          {/* today at a glance */}
          <section className="grid grid-cols-2 gap-3">
            <Card className="flex flex-col items-center gap-3 py-5">
              <Ring value={savePct} size={88} tone="info">
                <span className="text-lg font-extrabold tabular-nums">{Math.round(Math.min(savePct, 999))}%</span>
              </Ring>
              <div className="text-center">
                <CardTitle>{t('Saving today')}</CardTitle>
                <p className="mt-1 text-[13px] font-bold tabular-nums">
                  {fmt(d.saved_today_minor)}
                  <span className="font-medium text-muted-foreground"> / {fmt(d.saving_target_today_minor)}</span>
                </p>
              </div>
            </Card>
            <Card className="flex flex-col items-center gap-3 py-5">
              <Ring value={taskPct} size={88} tone="accent">
                <span className="text-lg font-extrabold tabular-nums">
                  {done}/{todayTasks.length}
                </span>
              </Ring>
              <div className="text-center">
                <CardTitle>{t('Tasks today')}</CardTitle>
                <p className="mt-1 text-[13px] font-bold">
                  {d.tasks_overdue.length > 0 ? (
                    <span className="text-danger">{d.tasks_overdue.length} {t('overdue')}</span>
                  ) : (
                    <span className="text-primary">{t('On track')}</span>
                  )}
                </p>
              </div>
            </Card>
          </section>

          {/* this week */}
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{t('Spent this week')}</CardTitle>
                <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">
                  {hidden ? mask : <AnimatedMoney minor={d.week_expense_minor} currency={cur} />}
                </p>
              </div>
              <div className="text-right">
                <CardTitle>{t('This month')}</CardTitle>
                <p
                  className={cn(
                    'mt-1 flex items-center justify-end gap-1 text-sm font-extrabold tabular-nums',
                    d.net_cash_flow_minor < 0 ? 'text-danger' : 'text-primary',
                  )}
                >
                  {d.net_cash_flow_minor < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                  {hidden ? mask : fmt(d.net_cash_flow_minor, cur, { sign: true })}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <WeekBars data={d.charts.daily_spending} today={d.today} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { l: t('Income'), v: d.month_income_minor, i: TrendingUp, c: 'text-primary' },
                { l: t('Expenses'), v: d.month_expense_minor, i: TrendingDown, c: 'text-danger' },
                { l: t('Saved'), v: d.total_savings_minor, i: PiggyBank, c: 'text-info' },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl bg-foreground/[0.05] px-1 py-2.5">
                  <s.i className={cn('mx-auto h-4 w-4', s.c)} />
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.l}</p>
                  <p className="text-[13px] font-extrabold tabular-nums">{hidden ? '••••' : fmt(s.v)}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* tasks */}
          <section className="space-y-2.5">
            <SectionHeader title={t('Today\'s tasks')} to="/tasks" />
            {[...d.tasks_overdue, ...d.tasks_today].slice(0, 4).map((t) => (
              <TaskCard key={t.occurrence_id} task={t} showDate={t.overdue} onEdit={() => sheets.open({ kind: 'task', task: t })} />
            ))}
            {d.tasks_today.length + d.tasks_overdue.length === 0 && (
              <div className="glass flex items-center justify-center gap-2 rounded-3xl py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> {t('Nothing due today')}
              </div>
            )}
          </section>

          {d.upcoming_reminders.length > 0 && (
            <Card>
              <CardTitle className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" /> {t('Upcoming reminders')}
              </CardTitle>
              <ul className="mt-3 space-y-2.5">
                {d.upcoming_reminders.map((t) => (
                  <li key={t.occurrence_id} className="flex items-center gap-3 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <Badge>
                      {prettyDate(t.date, d.today)} · {t.reminder_time}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* goals carousel */}
          {d.goals.length > 0 && (
            <section className="space-y-2.5">
              <SectionHeader title={t('Savings goals')} to="/savings" />
              <Carousel>
                {d.goals.map((g) => (
                  <div key={g.id} className="w-[88%] shrink-0 snap-start">
                    <GoalCard goal={g} onAdd={() => sheets.open({ kind: 'contribution', goal: g })} />
                  </div>
                ))}
              </Carousel>
            </section>
          )}

          {d.budgets.filter((b) => b.active).length > 0 && (
            <section className="space-y-2.5">
              <SectionHeader title={t('Budgets')} to="/finance" />
              {d.budgets
                .filter((b) => b.active)
                .slice(0, 3)
                .map((b) => (
                  <BudgetCard key={b.id} budget={b} />
                ))}
            </section>
          )}

          {/* insights, tabbed so the page stays short */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle>{t('Insights')}</CardTitle>
              <Link to="/reports" className="flex items-center text-xs font-bold text-primary">
                {t('Reports')} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <Segmented
              value={chart}
              onChange={setChart}
              options={[
                { value: 'flow', label: t('Flow') },
                { value: 'daily', label: t('Daily') },
                { value: 'mix', label: t('Mix') },
                { value: 'goals', label: t('Goals') },
              ]}
            />
            <div key={chart} className="tab-pane">
              {chart === 'flow' && <IncomeExpenseChart data={d.charts.income_vs_expense} currency={d.currency} />}
              {chart === 'daily' && <SpendingTrendChart data={d.charts.daily_spending} currency={d.currency} />}
              {chart === 'mix' && <CategoryDonut data={d.charts.expense_categories} currency={d.currency} />}
              {chart === 'goals' && <SavingsProgressChart goals={d.goals} />}
            </div>
          </Card>

          {/* recent */}
          <Card className="px-3">
            <div className="flex items-center justify-between px-1 pt-1">
              <CardTitle>{t('Recent activity')}</CardTitle>
              <Link to="/finance" className="flex items-center text-xs font-bold text-primary">
                {t('See all')} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-1 divide-y divide-foreground/[0.06]">
              {d.recent_transactions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('No transactions yet. Tap + to add your first one.')}</p>
              )}
              {d.recent_transactions.map((t) => (
                <TransactionRow key={t.id} tx={t} accounts={d.accounts} onClick={() => sheets.open({ kind: 'transaction', tx: t })} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

