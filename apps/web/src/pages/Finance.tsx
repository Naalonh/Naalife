import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  Target,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { convertMinor, type Account, type AccountType, type Transaction } from '@pla/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardTitle, Skeleton } from '@/components/ui/card';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Input, Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/layout/PageHeader';
import { TransactionRow } from '@/components/finance/TransactionRow';
import { BudgetCard } from '@/components/finance/BudgetCard';
import { useOwner } from '@/contexts/AuthContext';
import { useSheets } from '@/contexts/SheetContext';
import { useAccounts, useBudgetHistory, useBudgets, useDashboard, useTransactions, type TxFilter } from '@/hooks/queries';
import { useMoney } from '@/lib/money';
import { prettyDate, shortDate } from '@/lib/dates';
import { cn, titleCase } from '@/lib/utils';
import { t } from '@/i18n';

type Tab = 'transactions' | 'accounts' | 'budgets';
type TypeFilter = '' | 'income' | 'expense' | 'transfer';

/* ------------------------------------------------------------- Hero */

function FinanceHero() {
  const { cur } = useMoney();
  const d = useDashboard().data;
  if (!d) return <Skeleton className="h-44 rounded-4xl" />;

  const total = d.month_income_minor + d.month_expense_minor;
  const incomePct = total > 0 ? (d.month_income_minor / total) * 100 : 50;
  const positive = d.net_cash_flow_minor >= 0;

  return (
    <section className="hero relative overflow-hidden rounded-4xl p-5 text-white">
      <div className="relative z-10">
        <p className="text-[13px] font-medium text-white/75">{t('Net cash flow · this month')}</p>
        <p className="mt-1 text-[2.4rem] font-extrabold leading-none tracking-tightest tabular-nums">
          <AnimatedMoney minor={d.net_cash_flow_minor} currency={cur} sign />
        </p>

        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-black/25">
            <div className="h-full bg-white/90 transition-all duration-700" style={{ width: `${incomePct}%` }} />
            <div className="h-full bg-black/35" style={{ width: `${100 - incomePct}%` }} />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] font-medium text-white/70">{t('Income')}</p>
              <p className="font-bold tabular-nums">
                <AnimatedMoney minor={d.month_income_minor} currency={cur} />
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium text-white/70">{t('Spent')}</p>
              <p className="font-bold tabular-nums">
                <AnimatedMoney minor={d.month_expense_minor} currency={cur} />
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-white/70">
          {positive ? t('You are keeping more than you spend.') : t('Spending is ahead of income this month.')}
        </p>
      </div>
    </section>
  );
}

function SpendStrip() {
  const { cur } = useMoney();
  const d = useDashboard().data;
  if (!d) return null;
  const items = [
    { label: t('Today'), v: d.today_expense_minor },
    { label: t('This week'), v: d.week_expense_minor },
    { label: t('This month'), v: d.month_expense_minor },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((s) => (
        <div key={s.label} className="glass rounded-2xl px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className="mt-0.5 text-sm font-extrabold tabular-nums">
            <AnimatedMoney minor={s.v} currency={cur} />
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Activity */

function TransactionsTab() {
  const me = useOwner();
  const sheets = useSheets();
  const { fmt, cur } = useMoney();
  const accounts = useAccounts();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const filter: TxFilter = useMemo(
    () => ({
      q: search.trim() || undefined,
      type: type || undefined,
      category_id: categoryId || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
    }),
    [search, type, categoryId, from, to, page],
  );
  const q = useTransactions(filter);
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const total = q.data?.meta.total ?? 0;
  const activeFilters = [categoryId, from, to].filter(Boolean).length;

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of rows) m.set(t.occurred_on, [...(m.get(t.occurred_on) ?? []), t]);
    return [...m.entries()].map(([date, txs]) => ({
      date,
      txs,
      // net of the day in the display currency; transfers are not income or spending
      net: txs.reduce((s, t) => {
        if (t.type === 'transfer') return s;
        const v = convertMinor(t.amount_minor, t.currency, cur, Number(t.fx_khr_per_usd));
        return t.type === 'income' ? s + v : s - v;
      }, 0),
    }));
  }, [rows, cur]);

  return (
    <div className="tab-pane stagger space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="rounded-full pl-11 pr-11"
            placeholder={t('Search transactions')}
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            aria-label={t('Search transactions')}
          />
          {search && (
            <button
              type="button"
              aria-label={t('Clear search')}
              className="absolute right-3 top-2.5 rounded-full bg-foreground/10 p-1.5"
              onClick={() => reset(setSearch)('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={t('Filters')}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
            showFilters && 'text-primary',
          )}
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
          {activeFilters > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <Card className="tab-pane space-y-3">
          <Select value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)} aria-label={t('Category')}>
            <option value="">{t('All categories')}</option>
            {me.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.name)}
                {c.kind === 'income' ? t(' (income)') : ''}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label={t('From date')} />
            <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label={t('To date')} />
          </div>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryId('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              {t('Clear filters')}
            </Button>
          )}
        </Card>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(
          [
            ['', t('All')],
            ['expense', t('Expenses')],
            ['income', t('Income')],
            ['transfer', t('Transfers')],
          ] as Array<[TypeFilter, string]>
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => reset(setType)(v)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
              type === v ? 'bg-foreground text-background shadow-soft' : 'bg-foreground/[0.07] text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-3xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title={t('No transactions found')}
          hint={t('Add an expense or income, or loosen the filters.')}
          action={
            <Button size="sm" onClick={() => sheets.open({ kind: 'transaction', type: 'expense' })}>
              <Plus className="h-4 w-4" /> {t('Add expense')}
            </Button>
          }
        />
      ) : (
        <div className="stagger space-y-4">
          {groups.map((g) => (
            <section key={g.date}>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {prettyDate(g.date, me.today)}
                </h3>
                <span className={cn('text-xs font-bold tabular-nums', g.net > 0 ? 'text-primary' : 'text-muted-foreground')}>
                  {g.net === 0 ? '' : fmt(g.net, cur, { sign: true })}
                </span>
              </div>
              <Card className="divide-y divide-foreground/[0.06] px-3 py-1">
                {g.txs.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    showDate={false}
                    accounts={accounts.data}
                    onClick={() => sheets.open({ kind: 'transaction', tx: t })}
                  />
                ))}
              </Card>
            </section>
          ))}

          <div className="glass flex items-center justify-between rounded-full p-1.5">
            <Button variant="ghost" size="icon" aria-label={t('Previous page')} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-xs font-semibold text-muted-foreground">
              {t(total === 1 ? 'Page {0} · {1} transaction' : 'Page {0} · {1} transactions', page, total)}
            </span>
            <Button variant="ghost" size="icon" aria-label={t('Next page')} disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Accounts */

const ACCOUNT_STYLE: Record<AccountType, { grad: string; icon: LucideIcon; label: string }> = {
  cash: { grad: 'from-cyan-400 to-cyan-700', icon: Banknote, label: t('Cash') },
  bank: { grad: 'from-indigo-500 to-violet-700', icon: Landmark, label: t('Bank') },
  ewallet: { grad: 'from-blue-500 to-blue-800', icon: Smartphone, label: t('E-wallet') },
  savings: { grad: 'from-amber-500 to-orange-700', icon: PiggyBank, label: t('Savings account') },
};

function AccountCard({ a, onClick }: { a: Account; onClick: () => void }) {
  const { fmt, cur, convert } = useMoney();
  const style = ACCOUNT_STYLE[a.type];
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'pressable relative w-full overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-left text-white shadow-soft',
        style.grad,
        a.is_archived && 'opacity-55 saturate-50',
      )}
    >
      <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" aria-hidden />
      <span className="absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-black/15 blur-xl" aria-hidden />
      <div className="relative flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-bold tracking-wide">
          {a.currency}
          {a.is_archived ? t(' · archived') : ''}
        </span>
      </div>
      <p className="relative mt-5 text-[13px] font-semibold text-white/80">
        {a.name} · {style.label}
      </p>
      <p className="relative mt-0.5 text-[1.7rem] font-extrabold leading-tight tracking-tightest tabular-nums">
        {fmt(a.balance_minor, a.currency)}
      </p>
      {a.currency !== cur && (
        <p className="relative text-xs font-medium tabular-nums text-white/75">≈ {fmt(convert(a.balance_minor, a.currency, cur))}</p>
      )}
    </button>
  );
}

function AccountsTab() {
  const sheets = useSheets();
  const { cur, convert } = useMoney();
  const [showArchived, setShowArchived] = useState(false);
  const q = useAccounts(true);
  const all = q.data ?? [];
  const accounts = all.filter((a) => showArchived || !a.is_archived);
  const total = all.filter((a) => !a.is_archived).reduce((s, a) => s + convert(a.balance_minor, a.currency, cur), 0);

  return (
    <div className="tab-pane stagger space-y-3">
      <Card>
        <CardTitle>{t('Total across accounts')}</CardTitle>
        <p className="mt-1 text-[2rem] font-extrabold leading-tight tracking-tightest tabular-nums">
          <AnimatedMoney minor={total} currency={cur} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('Transfers between accounts never count as income or spending.')}</p>
      </Card>

      {q.isLoading && <Skeleton className="h-36 rounded-3xl" />}
      {accounts.map((a) => (
        <AccountCard key={a.id} a={a} onClick={() => sheets.open({ kind: 'account', account: a })} />
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => sheets.open({ kind: 'account' })}>
          <Plus className="h-4 w-4" /> {t('New account')}
        </Button>
        <Button variant="secondary" onClick={() => sheets.open({ kind: 'transaction', type: 'transfer' })}>
          <ArrowLeftRight className="h-4 w-4" /> {t('Transfer')}
        </Button>
      </div>
      {all.some((a) => a.is_archived) && (
        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-muted-foreground"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? t('Hide archived accounts') : t('Show archived accounts')}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Budgets */

function BudgetHistorySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { fmt } = useMoney();
  const sheets = useSheets();
  const budgets = useBudgets();
  const b = budgets.data?.find((x) => x.id === id);
  const h = useBudgetHistory(id);
  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={t('Budget history')}
      description={b ? `${b.category?.name ? t(b.category.name) : t('All spending')} · ${titleCase(b.period)}` : undefined}
    >
      <div className="space-y-4">
        {b && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              onClose();
              sheets.open({ kind: 'budget', budget: b });
            }}
          >
            <Pencil className="h-4 w-4" /> {t('Edit budget')}
          </Button>
        )}
        {h.isLoading && <Skeleton className="h-16" />}
        {b &&
          h.data?.map((e) => (
            <div key={e.period_from}>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span className="font-semibold">
                  {e.period_from === e.period_to ? shortDate(e.period_from) : `${shortDate(e.period_from)} – ${shortDate(e.period_to)}`}
                </span>
                <span className="tabular-nums">
                  {fmt(e.status.spent_minor, b.currency)} / {fmt(e.status.limit_minor, b.currency)}
                </span>
              </div>
              <Progress
                value={e.status.used_pct}
                tone={e.status.level === 'over' ? 'danger' : e.status.level === 'warning' ? 'warning' : 'primary'}
              />
            </div>
          ))}
      </div>
    </Sheet>
  );
}

function BudgetsTab() {
  const sheets = useSheets();
  const q = useBudgets();
  const [history, setHistory] = useState<string | null>(null);
  const budgets = q.data ?? [];
  const over = budgets.filter((b) => b.active && b.status.level === 'over').length;
  const warn = budgets.filter((b) => b.active && b.status.level === 'warning').length;

  return (
    <div className="tab-pane stagger space-y-3">
      {(over > 0 || warn > 0) && (
        <div className="glass flex items-center gap-3 rounded-3xl p-3.5">
          <Badge tone={over ? 'danger' : 'warning'}>{over ? t('Over budget') : t('Heads up')}</Badge>
          <p className="text-sm font-semibold">
            {over > 0 ? t('{0} over budget', over) : ''}
            {over > 0 && warn > 0 ? ' · ' : ''}
            {warn > 0 ? t('{0} near the limit', warn) : ''}
          </p>
        </div>
      )}
      {q.isLoading && <Skeleton className="h-24 rounded-3xl" />}
      {!q.isLoading && budgets.length === 0 && (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title={t('No budgets yet')}
          hint={t('Set a daily food budget or a monthly cap and get warned before you overspend.')}
        />
      )}
      {budgets.map((b) => (
        <div key={b.id} className={b.active ? undefined : 'opacity-60'}>
          <BudgetCard budget={b} onClick={() => setHistory(b.id)} />
        </div>
      ))}
      <Button className="w-full" onClick={() => sheets.open({ kind: 'budget' })}>
        <Plus className="h-4 w-4" /> {t('New budget')}
      </Button>
      <BudgetHistorySheet id={history} onClose={() => setHistory(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------- Page */

export default function Finance() {
  const sheets = useSheets();
  const [tab, setTab] = useState<Tab>('transactions');
  return (
    <div className="stagger space-y-4">
      <header className="flex items-end justify-between pb-1 pt-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t('Money in, money out')}</p>
          <h1 className="text-[1.7rem] font-extrabold tracking-tightest">{t('Finance')}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to="/reports"
            aria-label={t('Reports')}
            className="glass flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
          >
            <BarChart3 className="h-5 w-5" />
          </Link>
          <Button
            size="icon"
            aria-label={t('Add transaction')}
            className="shadow-glow"
            onClick={() => sheets.open({ kind: 'transaction', type: 'expense' })}
          >
            <Plus className="h-5 w-5" strokeWidth={2.6} />
          </Button>
        </div>
      </header>

      <FinanceHero />
      <SpendStrip />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'transactions', label: t('Activity') },
          { value: 'accounts', label: t('Accounts') },
          { value: 'budgets', label: t('Budgets') },
        ]}
      />

      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'budgets' && <BudgetsTab />}
    </div>
  );
}
