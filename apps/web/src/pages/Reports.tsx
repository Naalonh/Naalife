import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Flame,
  PiggyBank,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { addDays, addMonths, eachDay, endOfWeek, startOfWeek } from '@pla/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, IconTile, Skeleton } from '@/components/ui/card';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { PageHeader } from '@/components/layout/PageHeader';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { CategoryDonut } from '@/components/charts/Charts';
import { CashFlowChart } from '@/components/charts/ReportCharts';
import { useOwner } from '@/contexts/AuthContext';
import { useReport } from '@/hooks/queries';
import { download } from '@/lib/api';
import { monthLabel, shortDate } from '@/lib/dates';
import { useMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

type Period = 'daily' | 'weekly' | 'monthly';

function Delta({ now, prev, invert }: { now: number; prev: number; invert?: boolean }) {
  if (prev === 0 && now === 0) return <span className="text-[11px] text-muted-foreground">{t('no change')}</span>;
  const pct = prev === 0 ? 100 : Math.round(((now - prev) / Math.abs(prev)) * 100);
  const good = invert ? pct <= 0 : pct >= 0;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
        good ? 'bg-primary/15 text-primary' : 'bg-danger/15 text-danger',
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct)}%
    </span>
  );
}

function CompareRow({
  label,
  now,
  prev,
  tone,
  invert,
}: {
  label: string;
  now: number;
  prev: number;
  tone: 'primary' | 'accent';
  invert?: boolean;
}) {
  const { fmt, cur } = useMoney();
  const max = Math.max(now, prev, 1);
  const bar = tone === 'primary' ? 'bg-primary' : 'bg-accent';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">{label}</span>
        <Delta now={now} prev={prev} invert={invert} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className={cn('h-full rounded-full transition-all duration-700', bar)} style={{ width: `${(now / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right text-xs font-bold tabular-nums">{fmt(now, cur)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className={cn('h-full rounded-full opacity-35 transition-all duration-700', bar)} style={{ width: `${(prev / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">{fmt(prev, cur)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const me = useOwner();
  const { fmt, cur } = useMoney();
  const [period, setPeriod] = useState<Period>('monthly');
  const [anchor, setAnchor] = useState(me.today);
  const [categoryId, setCategoryId] = useState('');

  const params: Record<string, string | undefined> =
    period === 'monthly'
      ? { month: anchor.slice(0, 7), category_id: categoryId || undefined }
      : { date: anchor, category_id: categoryId || undefined };
  const q = useReport(period, params);
  const r = q.data;

  function shift(dir: -1 | 1) {
    if (period === 'daily') setAnchor(addDays(anchor, dir));
    else if (period === 'weekly') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addMonths(anchor, dir));
  }

  const title =
    period === 'monthly'
      ? monthLabel(anchor.slice(0, 7))
      : period === 'weekly'
        ? `${shortDate(startOfWeek(anchor))} – ${shortDate(endOfWeek(anchor))}`
        : shortDate(anchor);

  // client-side insights derived from the report returned by the API
  const insights = useMemo(() => {
    if (!r) return null;
    const days = Math.max(1, eachDay(r.from, r.to).length);
    const top = r.categories[0];
    const worst = [...r.trend].sort((a, b) => b.expense_minor - a.expense_minor)[0];
    return {
      avgPerDay: Math.round(r.expense_minor / days),
      top,
      worst: worst && worst.expense_minor > 0 ? worst : null,
      saveRate: r.income_minor > 0 ? Math.round((r.savings_contributions_minor / r.income_minor) * 100) : null,
    };
  }, [r]);

  async function exportCsv() {
    if (!r) return;
    try {
      await download('/reports/export', { from: r.from, to: r.to }, `transactions-${r.from}_${r.to}.csv`);
      toast.success(t('CSV exported'));
    } catch {
      toast.error(t('Export failed'));
    }
  }

  const catTotal = r ? r.categories.reduce((s, c) => s + c.total_minor, 0) : 0;

  return (
    <div className="stagger space-y-4">
      <PageHeader
        title={t('Reports')}
        subtitle={t('Real numbers from your ledger')}
        back="/"
        action={
          <Button variant="secondary" size="icon" aria-label={t('Export CSV')} disabled={!r} onClick={() => void exportCsv()}>
            <Download className="h-5 w-5" />
          </Button>
        }
      />

      <Segmented
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(me.today);
        }}
        options={[
          { value: 'daily', label: t('Daily') },
          { value: 'weekly', label: t('Weekly') },
          { value: 'monthly', label: t('Monthly') },
        ]}
      />

      <div className="glass flex items-center justify-between rounded-full p-1.5">
        <Button variant="ghost" size="icon" aria-label={t('Previous period')} onClick={() => shift(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-extrabold"
          onClick={() => setAnchor(me.today)}
          aria-label={t('Jump to today')}
        >
          <CalendarRange className="h-4 w-4 text-primary" />
          {title}
        </button>
        <Button variant="ghost" size="icon" aria-label={t('Next period')} onClick={() => shift(1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t('Filter by category')}>
        <option value="">{t('All categories')}</option>
        {me.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {t(c.name)}
            {c.kind === 'income' ? t(' (income)') : ''}
          </option>
        ))}
      </Select>

      {q.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-44 rounded-4xl" />
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-56 rounded-3xl" />
        </div>
      )}

      {r && (
        <div className={cn('stagger space-y-4 transition-opacity', q.isFetching && 'opacity-60')}>
          {/* hero */}
          <section className="hero relative overflow-hidden rounded-4xl p-5 text-white">
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-white/75">{t('Net cash flow')}</p>
                <Delta now={r.net_minor} prev={r.previous.net_minor} />
              </div>
              <p className="mt-1 text-[2.4rem] font-extrabold leading-none tracking-tightest tabular-nums">
                <AnimatedMoney minor={r.net_minor} currency={cur} sign />
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
                  <p className="flex items-center gap-1 text-[11px] font-medium text-white/70">
                    <ArrowDownRight className="h-3.5 w-3.5" /> {t('Income')}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums">
                    <AnimatedMoney minor={r.income_minor} currency={cur} />
                  </p>
                </div>
                <div className="rounded-2xl bg-black/20 p-3 backdrop-blur-sm">
                  <p className="flex items-center gap-1 text-[11px] font-medium text-white/70">
                    <ArrowUpRight className="h-3.5 w-3.5" /> {t('Spent')}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums">
                    <AnimatedMoney minor={r.expense_minor} currency={cur} />
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* insights bento */}
          {insights && (
            <section className="grid grid-cols-2 gap-3">
              <Card>
                <IconTile tone="info">
                  <Flame className="h-[18px] w-[18px]" />
                </IconTile>
                <CardTitle className="mt-3">{t('Avg per day')}</CardTitle>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">{fmt(insights.avgPerDay, cur)}</p>
              </Card>
              <Card>
                <IconTile tone="primary">
                  <PiggyBank className="h-[18px] w-[18px]" />
                </IconTile>
                <CardTitle className="mt-3">{t('Saved')}</CardTitle>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">{fmt(r.savings_contributions_minor, cur)}</p>
                <p className="text-[11px] text-muted-foreground">{t('not counted as spending')}</p>
              </Card>
              <Card>
                <IconTile tone="accent">
                  <Crown className="h-[18px] w-[18px]" />
                </IconTile>
                <CardTitle className="mt-3">{t('Top category')}</CardTitle>
                <p className="mt-0.5 truncate text-lg font-extrabold">{insights.top?.name ? t(insights.top.name) : '—'}</p>
                {insights.top && <p className="text-[11px] tabular-nums text-muted-foreground">{fmt(insights.top.total_minor, cur)}</p>}
              </Card>
              <Card>
                <IconTile tone="warning">
                  <BadgePercent className="h-[18px] w-[18px]" />
                </IconTile>
                <CardTitle className="mt-3">{t('Savings rate')}</CardTitle>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">
                  {insights.saveRate === null ? '—' : `${insights.saveRate}%`}
                </p>
                {insights.worst && period !== 'daily' && (
                  <p className="text-[11px] text-muted-foreground">{t('Peak day {0}', shortDate(insights.worst.date))}</p>
                )}
              </Card>
            </section>
          )}

          {/* comparison */}
          <Card className="space-y-5">
            <div className="flex items-center justify-between">
              <CardTitle>{t('Vs previous period')}</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {shortDate(r.previous.from)} – {shortDate(r.previous.to)}
              </span>
            </div>
            <CompareRow label={t('Expenses')} now={r.expense_minor} prev={r.previous.expense_minor} tone="accent" invert />
            <CompareRow label={t('Income')} now={r.income_minor} prev={r.previous.income_minor} tone="primary" />
          </Card>

          {/* trend */}
          {period !== 'daily' && (
            <Card>
              <div className="flex items-center justify-between">
                <CardTitle>{t('Cash flow trend')}</CardTitle>
                <div className="flex gap-3 text-[11px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-full bg-primary" /> {t('Income')}
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-full bg-accent" /> {t('Spent')}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <CashFlowChart data={r.trend} currency={cur} />
              </div>
            </Card>
          )}

          {/* categories */}
          <Card>
            <CardTitle>{t('Spending by category')}</CardTitle>
            <div className="mt-3">
              <CategoryDonut data={r.categories} currency={cur} />
            </div>
            <ul className="stagger mt-4 space-y-3">
              {r.categories.map((c) => {
                const pct = catTotal ? (c.total_minor / catTotal) * 100 : 0;
                return (
                  <li key={c.category_id ?? 'none'}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{t(c.name)}</span>
                      <span className="text-xs text-muted-foreground">{c.count}×</span>
                      <span className="w-24 text-right font-bold tabular-nums">{fmt(c.total_minor, cur)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {r.income_sources.length > 0 && (
            <Card>
              <CardTitle>{t('Income sources')}</CardTitle>
              <ul className="mt-3 space-y-2.5">
                {r.income_sources.map((c) => (
                  <li key={c.category_id ?? 'none'} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-sm font-semibold">{t(c.name)}</span>
                    <span className="text-sm font-extrabold tabular-nums text-primary">{fmt(c.total_minor, cur)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {r.budgets.length > 0 && (
            <section className="space-y-3">
              <h2 className="px-1 text-sm font-bold">{t('Budget utilisation')}</h2>
              {r.budgets.map((b) => (
                <BudgetCard key={b.id} budget={b} />
              ))}
            </section>
          )}

          <Card>
            <CardTitle>{t('Current balances')}</CardTitle>
            <ul className="mt-2 divide-y divide-foreground/[0.06]">
              {r.balances.map((b) => (
                <li key={b.account_id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold">{b.name}</span>
                  <span className="font-extrabold tabular-nums">{fmt(b.balance_minor, b.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Button variant="secondary" className="w-full" onClick={() => void exportCsv()}>
            <Download className="h-4 w-4" /> {t('Export this period as CSV')}
          </Button>
        </div>
      )}
    </div>
  );
}
