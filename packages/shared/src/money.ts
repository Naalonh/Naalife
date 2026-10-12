import { CURRENCY_EXPONENT, type Currency } from './constants';

export class MoneyError extends Error {}

/**
 * Parse a user-entered decimal amount into integer minor units without any
 * floating point arithmetic. "2.5" USD -> 250, "4100" KHR -> 4100.
 */
export function parseAmount(input: string | number, currency: Currency): number {
  const exp = CURRENCY_EXPONENT[currency];
  let s = String(input).trim().replace(/[,\s_]/g, '').replace(/^\$|^៛/, '');
  if (s.startsWith('.')) s = `0${s}`;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new MoneyError('Invalid amount');
  const [whole, frac = ''] = s.split('.');
  if (frac.length > exp && /[1-9]/.test(frac.slice(exp))) {
    throw new MoneyError(`${currency} supports at most ${exp} decimal places`);
  }
  const padded = (frac + '0'.repeat(exp)).slice(0, exp);
  const minor = Number(whole + padded);
  if (!Number.isSafeInteger(minor)) throw new MoneyError('Amount too large');
  return minor;
}

export function toMajorString(minor: number, currency: Currency): string {
  const exp = CURRENCY_EXPONENT[currency];
  const neg = minor < 0;
  const abs = String(Math.abs(minor)).padStart(exp + 1, '0');
  const whole = abs.slice(0, abs.length - exp);
  const frac = exp ? abs.slice(-exp) : '';
  return `${neg ? '-' : ''}${whole}${exp ? `.${frac}` : ''}`;
}

const SYMBOL: Record<Currency, string> = { USD: '$', KHR: '៛' };

export function formatMinor(minor: number, currency: Currency, opts: { sign?: boolean } = {}): string {
  const exp = CURRENCY_EXPONENT[currency];
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** exp);
  const frac = abs % 10 ** exp;
  const wholeStr = new Intl.NumberFormat('en-US').format(whole);
  const body = exp ? `${wholeStr}.${String(frac).padStart(exp, '0')}` : wholeStr;
  const sign = minor < 0 ? '-' : opts.sign && minor > 0 ? '+' : '';
  return `${sign}${SYMBOL[currency]}${body}`;
}

function roundDiv(n: bigint, d: bigint): bigint {
  // half away from zero
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

const RATE_SCALE = 10_000n;

export function assertRate(khrPerUsd: number): void {
  if (!Number.isFinite(khrPerUsd) || khrPerUsd < 1 || khrPerUsd > 1_000_000) {
    throw new MoneyError('Exchange rate out of range');
  }
}

/** Exact integer conversion between currencies at `khrPerUsd`. */
export function convertMinor(amount: number, from: Currency, to: Currency, khrPerUsd: number): number {
  if (from === to) return amount;
  assertRate(khrPerUsd);
  const rate = BigInt(Math.round(khrPerUsd * 10_000));
  const a = BigInt(amount);
  if (from === 'USD') return Number(roundDiv(a * rate, 100n * RATE_SCALE)); // cents -> riel
  return Number(roundDiv(a * 100n * RATE_SCALE, rate)); // riel -> cents
}

/** Canonical "hub" value stored per transaction: USD cents at the rate in effect. */
export function toHubMinor(amount: number, currency: Currency, khrPerUsd: number): number {
  return convertMinor(amount, currency, 'USD', khrPerUsd);
}

export function fromHubMinor(hubMinor: number, to: Currency, khrPerUsd: number): number {
  return convertMinor(hubMinor, 'USD', to, khrPerUsd);
}
