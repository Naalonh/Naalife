import { addDays, diffDays, eachDay, startOfWeek, weekday } from './dates';
import type { RecurrenceType } from './constants';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval: number; // every N days (custom) or every N weeks (weekly)
  days: number[]; // weekdays 0=Sun..6=Sat, weekly only
  anchor: string; // first possible date (task due date)
  until?: string | null;
}

/** All occurrence dates of `rule` within [from, to] inclusive. Deterministic and duplicate-free. */
export function occurrenceDates(rule: RecurrenceRule, from: string, to: string): string[] {
  const start = from < rule.anchor ? rule.anchor : from;
  const end = rule.until && rule.until < to ? rule.until : to;
  if (start > end) return [];
  const interval = Math.max(1, rule.interval || 1);

  switch (rule.type) {
    case 'none':
      return rule.anchor >= from && rule.anchor <= end ? [rule.anchor] : [];
    case 'daily':
      return eachDay(start, end);
    case 'custom':
      return eachDay(start, end).filter((d) => diffDays(rule.anchor, d) % interval === 0);
    case 'weekly': {
      const days = rule.days.length ? rule.days : [weekday(rule.anchor)];
      const anchorWeek = startOfWeek(rule.anchor);
      return eachDay(start, end).filter((d) => {
        if (!days.includes(weekday(d))) return false;
        const weeks = Math.floor(diffDays(anchorWeek, startOfWeek(d)) / 7);
        return weeks % interval === 0;
      });
    }
  }
}

export function nextOccurrence(rule: RecurrenceRule, after: string, horizonDays = 366): string | null {
  const list = occurrenceDates(rule, addDays(after, 1), addDays(after, horizonDays));
  return list[0] ?? null;
}
