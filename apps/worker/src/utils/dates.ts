import { localDate } from '@pla/shared';

export function todayIn(timezone: string, now = new Date()): string {
  return localDate(now, timezone);
}

export {
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  localParts,
  localToUtc,
} from '@pla/shared';
