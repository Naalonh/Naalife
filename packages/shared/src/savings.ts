import { diffDays } from './dates';

export function remainingMinor(target: number, saved: number): number {
  return Math.max(0, target - saved);
}

/** Days left until the target date (never below 1 so the maths stays defined). */
export function daysRemaining(today: string, targetDate: string): number {
  return Math.max(1, diffDays(today, targetDate));
}

/** Rounded UP to the smallest currency unit so the goal is always reached. */
export function dailyRequirementMinor(target: number, saved: number, today: string, targetDate: string): number {
  const remaining = remainingMinor(target, saved);
  if (remaining === 0) return 0;
  return Math.ceil(remaining / daysRemaining(today, targetDate));
}

export interface GoalProgress {
  remaining_minor: number;
  days_remaining: number;
  daily_requirement_minor: number;
  progress_pct: number;
  completed: boolean;
  overdue: boolean;
}

export function goalProgress(target: number, saved: number, today: string, targetDate: string): GoalProgress {
  const remaining = remainingMinor(target, saved);
  const pct = target > 0 ? Math.min(100, Math.floor((saved / target) * 1000) / 10) : 0;
  return {
    remaining_minor: remaining,
    days_remaining: daysRemaining(today, targetDate),
    daily_requirement_minor: dailyRequirementMinor(target, saved, today, targetDate),
    progress_pct: Math.max(0, pct),
    completed: remaining === 0,
    overdue: remaining > 0 && diffDays(today, targetDate) < 0,
  };
}

export type ScheduleState = 'done' | 'ahead' | 'on_track' | 'behind';

export interface ScheduleStatus {
  state: ScheduleState;
  /** What a perfectly even plan would have saved by today. */
  expected_minor: number;
  /** saved - expected (negative = behind). */
  diff_minor: number;
  /** One day worth of the even plan; used as the on-track tolerance. */
  per_day_minor: number;
  elapsed_days: number;
  total_days: number;
}

/**
 * Compares actual savings with an even plan from start date to target date.
 * Missing days make the goal "behind"; a big lump sum makes it "ahead".
 */
export function scheduleStatus(
  target: number,
  saved: number,
  startDate: string,
  targetDate: string,
  today: string,
): ScheduleStatus {
  const total = Math.max(1, diffDays(startDate, targetDate));
  const elapsed = Math.min(total, Math.max(0, diffDays(startDate, today)));
  const expected = Number((BigInt(target) * BigInt(elapsed)) / BigInt(total));
  const perDay = Math.ceil(target / total);
  const diff = saved - expected;
  let state: ScheduleState = 'on_track';
  if (saved >= target) state = 'done';
  else if (diff > perDay) state = 'ahead';
  else if (diff < -perDay) state = 'behind';
  return { state, expected_minor: expected, diff_minor: diff, per_day_minor: perDay, elapsed_days: elapsed, total_days: total };
}
