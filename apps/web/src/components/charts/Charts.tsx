import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CURRENCY_EXPONENT, type CategoryTotal, type Currency, type SavingsGoal, type SeriesPoint } from '@pla/shared';
import { formatMinor } from '@pla/shared';
import { monthLabel, shortDate } from '@/lib/dates';
import { t } from '@/i18n';

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';

function compact(minor: number, currency: Currency): string {
  const v = minor / 10 ** CURRENCY_EXPONENT[currency];
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function TooltipBox({ active, payload, label, currency, labelFmt }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; payload?: { fill?: string } }>;
  label?: string;
  currency: Currency;
  labelFmt?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-soft">
      {label ? <div className="mb-1 font-semibold">{labelFmt ? labelFmt(label) : label}</div> : null}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-muted-foreground">{t(p.name)}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatMinor(p.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({ data, currency }: { data: SeriesPoint[]; currency: Currency }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} tickFormatter={(l: string) => monthLabel(l).slice(0, 3)} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} tickFormatter={(v: number) => compact(v, currency)} axisLine={false} tickLine={false} width={48} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} content={<TooltipBox currency={currency} labelFmt={monthLabel} />} />
        <Bar dataKey="income_minor" name={t('Income')} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expense_minor" name={t('Expenses')} fill="hsl(var(--danger))" radius={[6, 6, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingTrendChart({
  data,
  currency,
  dataKey = 'expense_minor',
  height = 170,
}: {
  data: Array<{ date: string; expense_minor: number; income_minor?: number }>;
  currency: Currency;
  dataKey?: 'expense_minor' | 'income_minor';
  height?: number;
}) {
  const color = dataKey === 'expense_minor' ? 'hsl(var(--danger))' : 'hsl(var(--primary))';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickFormatter={(v: number) => compact(v, currency)} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<TooltipBox currency={currency} labelFmt={shortDate} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={dataKey === 'expense_minor' ? t('Spent') : t('Income')}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#g-${dataKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, currency }: { data: CategoryTotal[]; currency: Currency }) {
  const total = data.reduce((s, d) => s + d.total_minor, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted-foreground">{t('No data for this period yet.')}</p>;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total_minor" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.category_id ?? 'none'} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Total')}</span>
          <span className="text-sm font-bold tabular-nums">{formatMinor(total, currency)}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 5).map((d) => (
          <li key={d.category_id ?? 'none'} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate">{t(d.name)}</span>
            <span className="ml-auto font-semibold tabular-nums">{Math.round((d.total_minor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SavingsProgressChart({ goals }: { goals: SavingsGoal[] }) {
  const data = goals.map((g) => ({ name: g.name, progress: g.progress_pct, remaining: Math.max(0, 100 - g.progress_pct) }));
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('No savings goals yet.')}</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(90, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barSize={14}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="name" tick={AXIS} width={92} axisLine={false} tickLine={false} />
        <Legend wrapperStyle={{ display: 'none' }} />
        <Tooltip
          cursor={false}
          formatter={(v: number) => `${v}%`}
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
        />
        <Bar dataKey="progress" name={t('Saved')} stackId="a" fill="hsl(var(--primary))" radius={[7, 0, 0, 7]} />
        <Bar dataKey="remaining" name={t('Remaining')} stackId="a" fill="hsl(var(--muted))" radius={[0, 7, 7, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
