import type { TaskCategory } from './constants';

/** What kind of day it is, as tagged by the owner. Untagged days are ordinary days. */
export const DAY_KINDS = ['work', 'half_am', 'half_pm', 'study', 'off', 'holiday'] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export interface DayMark {
  date: string;
  kind: DayKind;
  note: string;
}

/** Task categories that only make sense on a working day. */
export const WORK_CATEGORIES: readonly TaskCategory[] = ['work', 'business'];

/** Before this time (HH:MM) counts as morning, from it onwards as afternoon. */
export const HALF_DAY_SPLIT = '12:00';

/**
 * Whether a task occurrence is paused (hidden, no reminders, never overdue) on a day of `kind`.
 *
 * - study / off / holiday: repeating work & business tasks are paused all day.
 * - half_am (work morning, off afternoon): repeating work tasks timed from 12:00 on are paused.
 * - half_pm (off morning, work afternoon): repeating work tasks timed before 12:00 are paused.
 *   Tasks with no time stay visible because the half they belong to is unknown.
 *
 * One-off tasks always stay visible so a deadline can never silently disappear.
 */
export function isPausedByDay(
  task: { category: string; recurrence_type: string; due_time?: string | null; reminder_time?: string | null },
  kind: DayKind | null | undefined,
): boolean {
  if (!kind || kind === 'work') return false;
  if (task.recurrence_type === 'none') return false;
  if (!(WORK_CATEGORIES as readonly string[]).includes(task.category)) return false;

  if (kind === 'half_am' || kind === 'half_pm') {
    const time = task.due_time ?? task.reminder_time;
    if (!time) return false;
    const afternoon = time.slice(0, 5) >= HALF_DAY_SPLIT;
    return kind === 'half_am' ? afternoon : !afternoon;
  }
  return true;
}
