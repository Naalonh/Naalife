import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CURRENCY_EXPONENT, formatMinor, type Currency } from '@pla/shared';
import { shortDate } from '@/lib/dates';

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

function compact(minor: number, currency: Currency): string {
  const v = minor / 10 ** CURRENCY_EXPONENT[currency];
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

interface Point {
  date: string;
  income_minor: number;
  expense_minor: number;
}

/** Income and expenses on one smooth, gradient-filled chart. */
export function CashFlowChart({ data, currency }: { data: Point[]; currency: Currency }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 10, right: 6, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="cf-income" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cf-expense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--foreground) / 0.07)" vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tick={AXIS} tickFormatter={(v: number) => compact(v, currency)} axisLine={false} tickLine={false} width={46} />
        <Tooltip
          cursor={{ stroke: 'hsl(var(--foreground) / 0.2)', strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="glass rounded-xl bg-card/95 px-3 py-2 text-xs">
                <div className="mb-1 font-bold">{shortDate(String(label))}</div>
                {payload.map((p) => (
                  <div key={String(p.dataKey)} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-muted-foreground">{p.name}</span>
                    <span className="ml-auto pl-3 font-bold tabular-nums">{formatMinor(Number(p.value), currency)}</span>
                  </div>
                ))}
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="income_minor" name="Income" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#cf-income)" />
        <Area type="monotone" dataKey="expense_minor" name="Spent" stroke="hsl(var(--accent))" strokeWidth={2.5} fill="url(#cf-expense)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
