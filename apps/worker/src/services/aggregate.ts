import { addDays, convertMinor, eachDay, type Category, type CategoryTotal, type Currency } from '@pla/shared';

/** Minimal projection of a transaction used for reporting maths. */
export interface LedgerRow {
  type: 'income' | 'expense';
  occurred_on: string;
  amount_minor: number;
  currency: Currency;
  fx_khr_per_usd: number | string;
  category_id: string | null;
}

/**
 * Value of a row in the display currency. Same-currency rows are exact; cross-currency
 * rows convert at the rate that was recorded WITH the row (historical accuracy).
 */
export function displayMinor(row: LedgerRow, display: Currency): number {
  return convertMinor(row.amount_minor, row.currency, display, Number(row.fx_khr_per_usd));
}

export function sumRows(
  rows: LedgerRow[],
  type: 'income' | 'expense',
  display: Currency,
  from?: string,
  to?: string,
  categoryId?: string | null,
): number {
  let total = 0;
  for (const r of rows) {
    if (r.type !== type) continue;
    if (from && r.occurred_on < from) continue;
    if (to && r.occurred_on > to) continue;
    if (categoryId !== undefined && categoryId !== null && r.category_id !== categoryId) continue;
    total += displayMinor(r, display);
  }
  return total;
}

export function categoryTotals(
  rows: LedgerRow[],
  type: 'income' | 'expense',
  categories: Category[],
  display: Currency,
  from: string,
  to: string,
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string | null, CategoryTotal>();
  for (const r of rows) {
    if (r.type !== type || r.occurred_on < from || r.occurred_on > to) continue;
    const cat = r.category_id ? byId.get(r.category_id) : undefined;
    const key = cat?.id ?? null;
    const entry = acc.get(key) ?? {
      category_id: key,
      name: cat?.name ?? 'Uncategorised',
      color: cat?.color ?? '#94a3b8',
      total_minor: 0,
      count: 0,
    };
    entry.total_minor += displayMinor(r, display);
    entry.count += 1;
    acc.set(key, entry);
  }
  return [...acc.values()].sort((a, b) => b.total_minor - a.total_minor);
}

export function dailyTrend(
  rows: LedgerRow[],
  display: Currency,
  from: string,
  to: string,
): Array<{ date: string; income_minor: number; expense_minor: number }> {
  const map = new Map<string, { income_minor: number; expense_minor: number }>();
  for (const d of eachDay(from, to)) map.set(d, { income_minor: 0, expense_minor: 0 });
  for (const r of rows) {
    const slot = map.get(r.occurred_on);
    if (!slot) continue;
    const v = displayMinor(r, display);
    if (r.type === 'income') slot.income_minor += v;
    else slot.expense_minor += v;
  }
  return [...map.entries()].map(([date, v]) => ({ date, ...v }));
}

/** Inclusive length of [from, to] in days; used to find the previous comparable window. */
export function previousWindow(from: string, to: string, monthly: boolean): { from: string; to: string } {
  if (monthly) {
    const [y, m] = from.split('-').map(Number);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const pf = `${py}-${String(pm).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: pf, to: `${py}-${String(pm).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
  }
  const len = eachDay(from, to).length;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}
