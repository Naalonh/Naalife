import { addDays, endOfMonth, startOfMonth, startOfWeek } from './dates';
import type { BudgetPeriod } from './constants';

export function periodRange(period: BudgetPeriod, today: string): { from: string; to: string } {
  switch (period) {
    case 'daily':
      return { from: today, to: today };
    case 'weekly': {
      const from = startOfWeek(today);
      return { from, to: addDays(from, 6) };
    }
    case 'monthly':
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export type BudgetLevel = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  limit_minor: number;
  spent_minor: number;
  remaining_minor: number;
  used_pct: number;
  level: BudgetLevel;
}

export function budgetStatus(limit: number, spent: number, thresholdPct: number): BudgetStatus {
  const used = limit > 0 ? (spent / limit) * 100 : 0;
  const level: BudgetLevel = spent > limit ? 'over' : used >= thresholdPct ? 'warning' : 'ok';
  return {
    limit_minor: limit,
    spent_minor: spent,
    remaining_minor: Math.max(0, limit - spent),
    used_pct: Math.round(used * 10) / 10,
    level,
  };
}

/** Which alert levels apply for the given spent/limit state. */
export function alertLevels(limit: number, spent: number, thresholdPct: number): Array<'warning' | 'over'> {
  const out: Array<'warning' | 'over'> = [];
  if (limit <= 0) return out;
  if (spent * 100 >= limit * thresholdPct) out.push('warning');
  if (spent > limit) out.push('over');
  return out;
}
