import { describe, expect, it } from 'vitest';
import {
  alertLevels,
  budgetStatus,
  dailyRequirementMinor,
  daysRemaining,
  goalProgress,
  periodRange,
  remainingMinor,
} from '../src';

describe('savings calculations', () => {
  it('matches the laptop example: $600 target, $100 saved, 100 days -> $5/day', () => {
    expect(remainingMinor(60000, 10000)).toBe(50000);
    expect(daysRemaining('2026-01-01', '2026-04-11')).toBe(100);
    expect(dailyRequirementMinor(60000, 10000, '2026-01-01', '2026-04-11')).toBe(500);
  });

  it('rounds the daily amount UP so the goal is always reached', () => {
    // $100 over 3 days = $33.333... -> $33.34
    expect(dailyRequirementMinor(10000, 0, '2026-01-01', '2026-01-04')).toBe(3334);
    // KHR has no decimals: 10,000 riel over 3 days -> 3,334
    expect(dailyRequirementMinor(10000, 0, '2026-01-01', '2026-01-04')).toBe(3334);
  });

  it('never goes negative and is zero once the goal is met', () => {
    expect(remainingMinor(1000, 5000)).toBe(0);
    expect(dailyRequirementMinor(1000, 1000, '2026-01-01', '2026-02-01')).toBe(0);
  });

  it('treats a past or same-day target date as "everything today"', () => {
    expect(daysRemaining('2026-02-01', '2026-02-01')).toBe(1);
    expect(daysRemaining('2026-02-01', '2026-01-01')).toBe(1);
    expect(dailyRequirementMinor(5000, 1000, '2026-02-01', '2026-01-01')).toBe(4000);
  });

  it('reports progress percentage, completion and overdue state', () => {
    const p = goalProgress(60000, 15000, '2026-01-01', '2026-04-11');
    expect(p.progress_pct).toBe(25);
    expect(p.completed).toBe(false);
    expect(p.overdue).toBe(false);
    expect(goalProgress(60000, 70000, '2026-01-01', '2026-04-11').progress_pct).toBe(100);
    expect(goalProgress(60000, 100, '2026-05-01', '2026-04-11').overdue).toBe(true);
  });
});

describe('budgets', () => {
  it('daily food example: $5 budget, $3 spent -> $2 left', () => {
    const s = budgetStatus(500, 300, 80);
    expect(s.remaining_minor).toBe(200);
    expect(s.used_pct).toBe(60);
    expect(s.level).toBe('ok');
  });

  it('warns at the threshold and flags overspending', () => {
    expect(budgetStatus(500, 400, 80).level).toBe('warning');
    expect(budgetStatus(500, 500, 80).level).toBe('warning');
    const over = budgetStatus(500, 650, 80);
    expect(over.level).toBe('over');
    expect(over.remaining_minor).toBe(0);
  });

  it('computes which alerts to send', () => {
    expect(alertLevels(500, 300, 80)).toEqual([]);
    expect(alertLevels(500, 400, 80)).toEqual(['warning']);
    expect(alertLevels(500, 501, 80)).toEqual(['warning', 'over']);
  });

  it('derives period ranges (weeks start Monday)', () => {
    expect(periodRange('daily', '2026-03-18')).toEqual({ from: '2026-03-18', to: '2026-03-18' });
    expect(periodRange('weekly', '2026-03-18')).toEqual({ from: '2026-03-16', to: '2026-03-22' });
    expect(periodRange('weekly', '2026-03-22')).toEqual({ from: '2026-03-16', to: '2026-03-22' });
    expect(periodRange('monthly', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('monthly', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
