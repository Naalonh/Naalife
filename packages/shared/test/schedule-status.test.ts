import { describe, expect, it } from 'vitest';
import { scheduleStatus } from '../src';

// $600 goal over 100 days => $6.00 (600 cents) per day on an even plan
const start = '2026-01-01';
const end = '2026-04-11';

describe('savings schedule status', () => {
  it('is on track when saving roughly one even step per day', () => {
    const s = scheduleStatus(60000, 30000, start, end, '2026-02-20'); // day 50 -> expected 30000
    expect(s.expected_minor).toBe(30000);
    expect(s.state).toBe('on_track');
  });

  it('is behind after missed days and reports how far', () => {
    const s = scheduleStatus(60000, 10000, start, end, '2026-02-20');
    expect(s.state).toBe('behind');
    expect(s.diff_minor).toBe(-20000);
  });

  it('is ahead after a big lump sum', () => {
    const s = scheduleStatus(60000, 45000, start, end, '2026-02-20');
    expect(s.state).toBe('ahead');
    expect(s.diff_minor).toBe(15000);
  });

  it('is done once the target is reached, even early or overshooting', () => {
    expect(scheduleStatus(60000, 60000, start, end, '2026-01-10').state).toBe('done');
    expect(scheduleStatus(60000, 75000, start, end, '2026-01-10').state).toBe('done');
  });

  it('handles day 0, past the deadline and same-day goals', () => {
    expect(scheduleStatus(60000, 0, start, end, '2026-01-01').state).toBe('on_track');
    expect(scheduleStatus(60000, 1000, start, end, '2026-06-01').state).toBe('behind');
    expect(scheduleStatus(5000, 0, '2026-03-01', '2026-03-01', '2026-03-01').expected_minor).toBe(0);
  });
});
