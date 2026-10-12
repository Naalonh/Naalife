import { describe, expect, it } from 'vitest';
import {
  budgetCreateSchema,
  contributionCreateSchema,
  goalCreateSchema,
  settingsUpdateSchema,
  taskCreateSchema,
  transactionCreateSchema,
  transactionsQuery,
} from '../src';

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const uuid2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('API payload schemas', () => {
  it('accepts a valid expense and applies defaults', () => {
    const r = transactionCreateSchema.parse({ type: 'expense', account_id: uuid, amount_minor: 250, currency: 'USD' });
    expect(r.description).toBe('');
  });

  it('rejects non-integer, zero and negative amounts', () => {
    for (const amount_minor of [2.5, 0, -1]) {
      expect(
        transactionCreateSchema.safeParse({ type: 'expense', account_id: uuid, amount_minor, currency: 'USD' }).success,
      ).toBe(false);
    }
  });

  it('rejects unknown currencies and bad ids', () => {
    expect(
      transactionCreateSchema.safeParse({ type: 'expense', account_id: uuid, amount_minor: 1, currency: 'EUR' }).success,
    ).toBe(false);
    expect(
      transactionCreateSchema.safeParse({ type: 'expense', account_id: 'nope', amount_minor: 1, currency: 'USD' }).success,
    ).toBe(false);
  });

  it('validates transfer shape', () => {
    const base = { type: 'transfer', account_id: uuid, amount_minor: 100, currency: 'USD' };
    expect(transactionCreateSchema.safeParse(base).success).toBe(false); // no destination
    expect(transactionCreateSchema.safeParse({ ...base, to_account_id: uuid }).success).toBe(false); // same account
    expect(transactionCreateSchema.safeParse({ ...base, to_account_id: uuid2 }).success).toBe(true);
    expect(
      transactionCreateSchema.safeParse({ ...base, to_account_id: uuid2, category_id: uuid }).success,
    ).toBe(false); // transfers are not categorised
  });

  it('validates dates, pagination and filters', () => {
    expect(transactionsQuery.parse({}).limit).toBe(30);
    expect(transactionsQuery.safeParse({ limit: '1000' }).success).toBe(false);
    expect(transactionsQuery.safeParse({ from: '2026-13-40' }).success).toBe(false);
  });

  it('validates goals, contributions, budgets, tasks and settings', () => {
    expect(
      goalCreateSchema.safeParse({ name: 'Laptop', target_minor: 60000, currency: 'USD', target_date: '2026-12-31' })
        .success,
    ).toBe(true);
    expect(
      goalCreateSchema.safeParse({
        name: 'x',
        target_minor: 1,
        currency: 'USD',
        start_date: '2026-02-01',
        target_date: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(contributionCreateSchema.safeParse({ amount_minor: -5 }).success).toBe(false);
    expect(budgetCreateSchema.safeParse({ period: 'yearly', amount_minor: 100, currency: 'USD' }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: '' }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: 'Study', reminder_time: '25:00' }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ timezone: 'Asia/Phnom_Penh', fx_khr_per_usd: 4100 }).success).toBe(true);
  });
});
