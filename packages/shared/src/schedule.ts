import type { NotificationKind } from './constants';
import { localParts, localToUtc, parseTimeToMinutes } from './dates';

export interface NotificationPref {
  kind: NotificationKind;
  enabled: boolean;
  local_time: string; // HH:MM
}

export interface DueNotification {
  kind: NotificationKind;
  dedupe_key: string;
  local_date: string;
  due_at: Date;
}

/**
 * Decide which daily notifications should exist right now. A notification is due
 * once the local clock passes its time and stays eligible for `graceMinutes`
 * (a delayed cron still delivers, but yesterday's reminder never fires at 3am).
 * The dedupe key (kind + local date) makes job creation idempotent.
 */
export function dueDailyNotifications(
  now: Date,
  timeZone: string,
  prefs: NotificationPref[],
  graceMinutes = 180,
): DueNotification[] {
  const local = localParts(now, timeZone);
  const out: DueNotification[] = [];
  for (const p of prefs) {
    if (!p.enabled) continue;
    const late = local.minutes - parseTimeToMinutes(p.local_time);
    if (late < 0 || late > graceMinutes) continue;
    out.push({
      kind: p.kind,
      dedupe_key: `${p.kind}:${local.date}`,
      local_date: local.date,
      due_at: localToUtc(local.date, p.local_time, timeZone),
    });
  }
  return out;
}

/** Exponential backoff for failed deliveries, in minutes (2, 4, 8 ... capped at 60). */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.max(1, attempt));
}
