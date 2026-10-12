/** Pure ISO-date (YYYY-MM-DD) helpers; no host timezone dependence. */

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function startOfWeek(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, -((wd + 6) % 7)); // Monday
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return fromUtc(Date.UTC(y, m, 0));
}

/** First day of the month `n` months away from the month of `iso`. */
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  return fromUtc(Date.UTC(y, m - 1 + n, 1));
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface LocalParts {
  date: string;
  minutes: number; // minutes since local midnight
  weekday: number;
}

export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: weekday(date) };
}

export function localDate(now: Date, timeZone: string): string {
  return localParts(now, timeZone).date;
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convert a local wall-clock date+time in `timeZone` to the UTC instant. */
export function localToUtc(date: string, hhmm: string, timeZone: string): Date {
  const target = toUtc(date) + parseTimeToMinutes(hhmm) * 60_000;
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    const shown = toUtc(p.date) + p.minutes * 60_000;
    guess -= shown - target;
  }
  return new Date(guess);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
