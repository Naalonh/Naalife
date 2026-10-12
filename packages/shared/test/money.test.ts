import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  convertMinor,
  formatMinor,
  fromHubMinor,
  parseAmount,
  toHubMinor,
  toMajorString,
} from '../src';

describe('parseAmount (exact decimal parsing)', () => {
  it('parses USD into cents without float error', () => {
    expect(parseAmount('2.50', 'USD')).toBe(250);
    expect(parseAmount('0.1', 'USD')).toBe(10);
    expect(parseAmount('19.99', 'USD')).toBe(1999);
    expect(parseAmount('$1,234.5', 'USD')).toBe(123450);
    expect(parseAmount(0.07, 'USD')).toBe(7);
  });

  it('adds up exactly where floats would not', () => {
    expect(parseAmount('0.10', 'USD') + parseAmount('0.20', 'USD')).toBe(parseAmount('0.30', 'USD'));
  });

  it('parses KHR as whole riel', () => {
    expect(parseAmount('4100', 'KHR')).toBe(4100);
    expect(parseAmount('៛8,000', 'KHR')).toBe(8000);
    expect(parseAmount('4100.0', 'KHR')).toBe(4100);
  });

  it('rejects invalid or over-precise input', () => {
    expect(() => parseAmount('abc', 'USD')).toThrow(MoneyError);
    expect(() => parseAmount('-5', 'USD')).toThrow(MoneyError);
    expect(() => parseAmount('1.005', 'USD')).toThrow(MoneyError);
    expect(() => parseAmount('1.5', 'KHR')).toThrow(MoneyError);
    expect(() => parseAmount('', 'USD')).toThrow(MoneyError);
  });
});

describe('formatting', () => {
  it('formats minor units', () => {
    expect(formatMinor(250, 'USD')).toBe('$2.50');
    expect(formatMinor(5, 'USD')).toBe('$0.05');
    expect(formatMinor(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMinor(4100, 'KHR')).toBe('៛4,100');
    expect(formatMinor(-250, 'USD')).toBe('-$2.50');
    expect(formatMinor(250, 'USD', { sign: true })).toBe('+$2.50');
    expect(toMajorString(250, 'USD')).toBe('2.50');
    expect(toMajorString(7, 'USD')).toBe('0.07');
    expect(toMajorString(4100, 'KHR')).toBe('4100');
  });
});

describe('currency conversion', () => {
  it('converts USD <-> KHR exactly at the given rate', () => {
    expect(convertMinor(100, 'USD', 'KHR', 4100)).toBe(4100); // $1 -> ៛4100
    expect(convertMinor(250, 'USD', 'KHR', 4100)).toBe(10250); // $2.50
    expect(convertMinor(4100, 'KHR', 'USD', 4100)).toBe(100);
    expect(convertMinor(2050, 'KHR', 'USD', 4100)).toBe(50);
  });

  it('rounds half away from zero to the smallest unit', () => {
    expect(convertMinor(1, 'KHR', 'USD', 4100)).toBe(0); // 0.0244 cents
    expect(convertMinor(21, 'KHR', 'USD', 4100)).toBe(1); // 0.512 cents
    expect(convertMinor(1, 'USD', 'KHR', 4012.5)).toBe(40); // 40.125 riel
  });

  it('is identity for the same currency and rejects bad rates', () => {
    expect(convertMinor(123, 'USD', 'USD', 4100)).toBe(123);
    expect(() => convertMinor(100, 'USD', 'KHR', 0)).toThrow(MoneyError);
  });

  it('hub conversion round-trips within one unit', () => {
    const hub = toHubMinor(8000, 'KHR', 4100);
    expect(hub).toBe(195);
    expect(Math.abs(fromHubMinor(hub, 'KHR', 4100) - 8000)).toBeLessThanOrEqual(20);
  });

  it('handles very large amounts without precision loss', () => {
    expect(convertMinor(10_000_000_000_00, 'USD', 'KHR', 4100)).toBe(41_000_000_000_000);
  });
});
