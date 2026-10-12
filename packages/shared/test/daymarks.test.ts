import { describe, expect, it } from 'vitest';
import { dayMarkUpsertSchema, isPausedByDay } from '../src';

describe('day types pause repeating work tasks', () => {
  const dailyWork = { category: 'work', recurrence_type: 'daily' };

  it('does not pause anything on ordinary or work days', () => {
    expect(isPausedByDay(dailyWork, null)).toBe(false);
    expect(isPausedByDay(dailyWork, undefined)).toBe(false);
    expect(isPausedByDay(dailyWork, 'work')).toBe(false);
  });

  it('pauses repeating work/business tasks on day off, holiday and study days', () => {
    for (const kind of ['off', 'holiday', 'study'] as const) {
      expect(isPausedByDay(dailyWork, kind)).toBe(true);
      expect(isPausedByDay({ category: 'business', recurrence_type: 'weekly' }, kind)).toBe(true);
    }
  });

  it('never pauses other categories, so study and personal tasks keep running', () => {
    for (const category of ['study', 'personal', 'health', 'finance', 'other']) {
      expect(isPausedByDay({ category, recurrence_type: 'daily' }, 'holiday')).toBe(false);
    }
  });

  it('never pauses one-off tasks, so a deadline cannot silently vanish', () => {
    expect(isPausedByDay({ category: 'work', recurrence_type: 'none' }, 'holiday')).toBe(false);
  });
});

describe('half days', () => {
  const at = (due_time: string | null) => ({ category: 'work', recurrence_type: 'daily', due_time });

  it('work-morning half day pauses afternoon work tasks only', () => {
    expect(isPausedByDay(at('09:00'), 'half_am')).toBe(false);
    expect(isPausedByDay(at('11:59'), 'half_am')).toBe(false);
    expect(isPausedByDay(at('12:00'), 'half_am')).toBe(true);
    expect(isPausedByDay(at('15:30:00'), 'half_am')).toBe(true);
  });

  it('work-afternoon half day pauses morning work tasks only', () => {
    expect(isPausedByDay(at('09:00:00'), 'half_pm')).toBe(true);
    expect(isPausedByDay(at('11:59'), 'half_pm')).toBe(true);
    expect(isPausedByDay(at('12:00'), 'half_pm')).toBe(false);
    expect(isPausedByDay(at('16:00'), 'half_pm')).toBe(false);
  });

  it('keeps tasks without a time, falls back to the reminder time, and ignores other categories', () => {
    expect(isPausedByDay(at(null), 'half_am')).toBe(false);
    expect(isPausedByDay({ category: 'work', recurrence_type: 'daily', due_time: null, reminder_time: '14:00' }, 'half_am')).toBe(true);
    expect(isPausedByDay({ category: 'study', recurrence_type: 'daily', due_time: '15:00' }, 'half_am')).toBe(false);
    expect(isPausedByDay({ category: 'work', recurrence_type: 'none', due_time: '15:00' }, 'half_am')).toBe(false);
  });
});

describe('day mark payload', () => {
  it('accepts a single day and a bounded range', () => {
    expect(dayMarkUpsertSchema.safeParse({ from: '2026-04-14', kind: 'holiday' }).success).toBe(true);
    expect(dayMarkUpsertSchema.safeParse({ from: '2026-04-14', to: '2026-04-16', kind: 'holiday', note: 'Khmer New Year' }).success).toBe(true);
  });

  it('rejects unknown kinds, reversed ranges and ranges over 60 days', () => {
    expect(dayMarkUpsertSchema.safeParse({ from: '2026-04-14', kind: 'vacation' }).success).toBe(false);
    expect(dayMarkUpsertSchema.safeParse({ from: '2026-04-14', to: '2026-04-10', kind: 'off' }).success).toBe(false);
    expect(dayMarkUpsertSchema.safeParse({ from: '2026-01-01', to: '2026-12-31', kind: 'off' }).success).toBe(false);
  });
});
