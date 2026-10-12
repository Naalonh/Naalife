import { describe, expect, it } from 'vitest';
import {
  csvCell,
  dueDailyNotifications,
  localParts,
  localToUtc,
  nextOccurrence,
  occurrenceDates,
  retryDelayMinutes,
  toCsv,
  type NotificationPref,
} from '../src';

const TZ = 'Asia/Phnom_Penh'; // UTC+7, no DST
const prefs: NotificationPref[] = [
  { kind: 'morning', enabled: true, local_time: '07:00' },
  { kind: 'savings', enabled: true, local_time: '20:00' },
  { kind: 'evening', enabled: true, local_time: '21:00' },
];

describe('timezone handling', () => {
  it('derives local date and minutes', () => {
    const p = localParts(new Date('2026-03-18T17:30:00Z'), TZ); // 00:30 next day locally
    expect(p.date).toBe('2026-03-19');
    expect(p.minutes).toBe(30);
  });

  it('converts local wall-clock time to the UTC instant', () => {
    expect(localToUtc('2026-03-18', '07:00', TZ).toISOString()).toBe('2026-03-18T00:00:00.000Z');
    expect(localToUtc('2026-03-18', '21:00', TZ).toISOString()).toBe('2026-03-18T14:00:00.000Z');
  });
});

describe('reminder scheduling', () => {
  it('07:00 Phnom Penh is 00:00 UTC; a tick at 23:55 UTC (06:55 local) is not yet due', () => {
    expect(dueDailyNotifications(new Date('2026-03-17T23:55:00Z'), TZ, prefs)).toEqual([]);
    const due = dueDailyNotifications(new Date('2026-03-18T00:00:00Z'), TZ, prefs);
    expect(due.map((d) => d.kind)).toEqual(['morning']);
    expect(due[0].dedupe_key).toBe('morning:2026-03-18');
    expect(due[0].due_at.toISOString()).toBe('2026-03-18T00:00:00.000Z');
  });

  it('produces the same dedupe key on every tick of the same day (no duplicates)', () => {
    const a = dueDailyNotifications(new Date('2026-03-18T14:00:00Z'), TZ, prefs);
    const b = dueDailyNotifications(new Date('2026-03-18T14:05:00Z'), TZ, prefs);
    const c = dueDailyNotifications(new Date('2026-03-18T14:10:00Z'), TZ, prefs);
    const keys = (x: typeof a) => x.map((d) => d.dedupe_key).sort();
    expect(keys(a)).toEqual(keys(b));
    expect(keys(b)).toEqual(keys(c));
    expect(keys(a)).toContain('evening:2026-03-18');
  });

  it('keeps jobs for a delayed cron but drops them after the grace window', () => {
    // 21:00 local reminder, cron delayed to 22:30 local -> still delivered
    const late = dueDailyNotifications(new Date('2026-03-18T15:30:00Z'), TZ, prefs);
    expect(late.map((d) => d.kind)).toContain('evening');
    // 03:00 local the next day: 07:00 job of the new day is not due yet and yesterday's is gone
    expect(dueDailyNotifications(new Date('2026-03-18T20:00:00Z'), TZ, prefs)).toEqual([]);
  });

  it('respects disabled preferences and custom times', () => {
    const custom = prefs.map((p) => (p.kind === 'morning' ? { ...p, local_time: '06:30' } : { ...p, enabled: false }));
    const due = dueDailyNotifications(new Date('2026-03-17T23:31:00Z'), TZ, custom);
    expect(due.map((d) => d.kind)).toEqual(['morning']);
  });

  it('backs off retries exponentially up to an hour', () => {
    expect(retryDelayMinutes(1)).toBe(2);
    expect(retryDelayMinutes(2)).toBe(4);
    expect(retryDelayMinutes(3)).toBe(8);
    expect(retryDelayMinutes(20)).toBe(60);
  });
});

describe('recurring tasks', () => {
  it('daily recurrence yields one date per day, bounded by the window', () => {
    const d = occurrenceDates({ type: 'daily', interval: 1, days: [], anchor: '2026-03-16' }, '2026-03-16', '2026-03-20');
    expect(d).toEqual(['2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20']);
  });

  it('never returns duplicates and is stable across overlapping windows', () => {
    const rule = { type: 'weekly' as const, interval: 1, days: [1, 3], anchor: '2026-03-16' };
    const a = occurrenceDates(rule, '2026-03-16', '2026-04-05');
    const b = occurrenceDates(rule, '2026-03-23', '2026-04-12');
    expect(new Set(a).size).toBe(a.length);
    const overlap = a.filter((x) => x >= '2026-03-23' && x <= '2026-04-05');
    expect(b.filter((x) => x <= '2026-04-05')).toEqual(overlap);
  });

  it('weekly picks the chosen weekdays (0=Sun)', () => {
    const d = occurrenceDates({ type: 'weekly', interval: 1, days: [1, 3], anchor: '2026-03-16' }, '2026-03-16', '2026-03-29');
    expect(d).toEqual(['2026-03-16', '2026-03-18', '2026-03-23', '2026-03-25']);
  });

  it('weekly with interval 2 skips alternate weeks', () => {
    const d = occurrenceDates({ type: 'weekly', interval: 2, days: [1], anchor: '2026-03-16' }, '2026-03-16', '2026-04-13');
    expect(d).toEqual(['2026-03-16', '2026-03-30', '2026-04-13']);
  });

  it('custom = every N days from the anchor', () => {
    const d = occurrenceDates({ type: 'custom', interval: 3, days: [], anchor: '2026-03-01' }, '2026-03-02', '2026-03-12');
    expect(d).toEqual(['2026-03-04', '2026-03-07', '2026-03-10']);
  });

  it('honours the until date and the anchor', () => {
    const rule = { type: 'daily' as const, interval: 1, days: [], anchor: '2026-03-10', until: '2026-03-12' };
    expect(occurrenceDates(rule, '2026-03-01', '2026-03-31')).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
    expect(nextOccurrence(rule, '2026-03-12')).toBeNull();
    expect(nextOccurrence(rule, '2026-03-10')).toBe('2026-03-11');
  });

  it('non-recurring tasks have exactly one occurrence', () => {
    expect(occurrenceDates({ type: 'none', interval: 1, days: [], anchor: '2026-03-18' }, '2026-03-01', '2026-03-31')).toEqual([
      '2026-03-18',
    ]);
  });
});

describe('csv', () => {
  it('quotes cells and neutralises spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5.20')).toBe('-5.20');
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n');
  });
});
