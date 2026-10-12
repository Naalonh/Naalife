import { t } from '@/i18n';
import { addDays, eachDay, endOfMonth, startOfMonth, startOfWeek, weekday } from '@pla/shared';

export const addDaysIso = addDays;
export { eachDay, endOfMonth, startOfMonth, startOfWeek, weekday };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => t(m));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => t(d));

export const WEEKDAY_SHORT = DAYS;

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function prettyDate(iso: string, today: string): string {
  if (iso === today) return t('Today');
  if (iso === addDays(today, 1)) return t('Tomorrow');
  if (iso === addDays(today, -1)) return t('Yesterday');
  return `${DAYS[weekday(iso)]}, ${shortDate(iso)}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
