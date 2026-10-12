import {
  convertMinor,
  toHubMinor,
  type Account,
  type AccountCreate,
  type Currency,
  type Transaction,
  type TransactionCreate,
  type TransactionUpdate,
} from '@pla/shared';
import type { z } from 'zod';
import type { transactionsQuery } from '@pla/shared';
import type { Ctx } from '../config/env';
import { fetchAll, isUniqueViolation, likePattern, unwrap } from '../db/supabase';
import { AppError, notFound } from '../utils/errors';
import type { LedgerRow } from './aggregate';
import { getCategories } from './context';

export const TX_SELECT = '*, category:categories(id, slug, name, icon, color)';

interface AccountRow {
  id: string;
  name: string;
  type: Account['type'];
  currency: Currency;
  opening_balance_minor: number;
  is_archived: boolean;
  created_at: string;
}

// ---- accounts ---------------------------------------------------------------

export async function listAccounts(ctx: Ctx, includeArchived = false): Promise<Account[]> {
  let q = ctx.db
    .from('financial_accounts')
    .select('id, name, type, currency, opening_balance_minor, is_archived, created_at')
    .eq('owner_id', ctx.ownerId)
    .order('created_at');
  if (!includeArchived) q = q.eq('is_archived', false);
  const [accounts, balances] = await Promise.all([
    q,
    ctx.db.from('account_balances').select('account_id, balance_minor').eq('owner_id', ctx.ownerId),
  ]);
  const rows = unwrap(accounts, 'accounts') as AccountRow[];
  const bal = new Map(
    (unwrap(balances, 'balances') as Array<{ account_id: string; balance_minor: number }>).map((b) => [
      b.account_id,
      Number(b.balance_minor),
    ]),
  );
  return rows.map((a) => ({
    ...a,
    opening_balance_minor: Number(a.opening_balance_minor),
    balance_minor: bal.get(a.id) ?? Number(a.opening_balance_minor),
  }));
}

export async function createAccount(ctx: Ctx, input: AccountCreate): Promise<Account> {
  const res = await ctx.db
    .from('financial_accounts')
    .insert({ ...input, owner_id: ctx.ownerId })
    .select('id')
    .single();
  if (isUniqueViolation(res.error)) throw new AppError(409, 'duplicate', 'An account with that name already exists');
  const { id } = unwrap(res, 'create account') as { id: string };
  const all = await listAccounts(ctx, true);
  return all.find((a) => a.id === id) as Account;
}

export async function updateAccount(
  ctx: Ctx,
  id: string,
  patch: Partial<Pick<Account, 'name' | 'type' | 'opening_balance_minor' | 'is_archived'>>,
): Promise<Account> {
  const res = await ctx.db
    .from('financial_accounts')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', ctx.ownerId)
    .select('id');
  if (isUniqueViolation(res.error)) throw new AppError(409, 'duplicate', 'An account with that name already exists');
  const rows = unwrap(res, 'update account') as Array<{ id: string }>;
  if (!rows.length) throw notFound('Account');
  if (patch.is_archived) {
    // an archived account must not stay the default
    await ctx.db
      .from('user_settings')
      .update({ default_account_id: null })
      .eq('user_id', ctx.ownerId)
      .eq('default_account_id', id);
  }
  const all = await listAccounts(ctx, true);
  return all.find((a) => a.id === id) as Account;
}

// ---- transactions -----------------------------------------------------------

async function accountMap(ctx: Ctx): Promise<Map<string, AccountRow>> {
  const rows = unwrap(
    await ctx.db
      .from('financial_accounts')
      .select('id, name, type, currency, opening_balance_minor, is_archived, created_at')
      .eq('owner_id', ctx.ownerId),
    'accounts',
  ) as AccountRow[];
  return new Map(rows.map((a) => [a.id, a]));
}

async function resolveCategory(ctx: Ctx, kind: 'income' | 'expense', id: string | null | undefined): Promise<string> {
  const cats = await getCategories(ctx);
  if (id) {
    const c = cats.find((x) => x.id === id);
    if (!c) throw new AppError(400, 'invalid_category', 'Unknown category');
    if (c.kind !== kind) throw new AppError(400, 'invalid_category', `Category is not an ${kind} category`);
    return c.id;
  }
  const fallback = cats.find((x) => x.kind === kind && x.slug === 'other') ?? cats.find((x) => x.kind === kind);
  if (!fallback) throw new AppError(500, 'no_category', 'No categories configured');
  return fallback.id;
}

function derive(
  amount: number,
  currency: Currency,
  account: AccountRow,
  rate: number,
  dest?: AccountRow,
  explicitTo?: number,
) {
  const accountAmount = convertMinor(amount, currency, account.currency, rate);
  if (accountAmount <= 0) throw new AppError(400, 'amount_too_small', 'Amount is too small for this account currency');
  let toAmount: number | null = null;
  if (dest) {
    toAmount = explicitTo ?? convertMinor(accountAmount, account.currency, dest.currency, rate);
    if (toAmount <= 0) throw new AppError(400, 'amount_too_small', 'Amount is too small for the destination account');
  }
  return { account_amount_minor: accountAmount, to_amount_minor: toAmount, base_usd_minor: toHubMinor(amount, currency, rate) };
}

export interface CreateResult {
  transaction: Transaction;
  duplicate: boolean;
}

export async function createTransaction(
  ctx: Ctx,
  input: TransactionCreate,
  source: 'app' | 'bot' = 'app',
): Promise<CreateResult> {
  const accounts = await accountMap(ctx);
  const account = accounts.get(input.account_id);
  if (!account || account.is_archived) throw notFound('Account');
  let dest: AccountRow | undefined;
  if (input.type === 'transfer') {
    dest = accounts.get(input.to_account_id as string);
    if (!dest || dest.is_archived) throw notFound('Destination account');
  }
  const rate = input.fx_khr_per_usd ?? ctx.settings.fx_khr_per_usd;
  const categoryId =
    input.type === 'transfer' ? null : await resolveCategory(ctx, input.type, input.category_id ?? null);
  const d = derive(input.amount_minor, input.currency, account, rate, dest, input.to_amount_minor);

  const row = {
    owner_id: ctx.ownerId,
    type: input.type,
    account_id: account.id,
    to_account_id: dest?.id ?? null,
    category_id: categoryId,
    amount_minor: input.amount_minor,
    currency: input.currency,
    fx_khr_per_usd: rate,
    ...d,
    description: input.description,
    occurred_on: input.occurred_on ?? ctx.today,
    source,
    client_request_id: input.client_request_id ?? null,
  };

  const res = await ctx.db.from('transactions').insert(row).select(TX_SELECT).single();
  if (isUniqueViolation(res.error) && input.client_request_id) {
    const existing = unwrap(
      await ctx.db
        .from('transactions')
        .select(TX_SELECT)
        .eq('owner_id', ctx.ownerId)
        .eq('client_request_id', input.client_request_id)
        .single(),
      'tx idempotency',
    );
    return { transaction: existing as unknown as Transaction, duplicate: true };
  }
  return { transaction: unwrap(res, 'create transaction') as unknown as Transaction, duplicate: false };
}

export async function updateTransaction(ctx: Ctx, id: string, patch: TransactionUpdate): Promise<Transaction> {
  const existing = unwrap(
    await ctx.db.from('transactions').select('*').eq('id', id).eq('owner_id', ctx.ownerId).maybeSingle(),
    'tx load',
  ) as (Transaction & { owner_id: string }) | null;
  if (!existing) throw notFound('Transaction');

  const accounts = await accountMap(ctx);
  const accountId = patch.account_id ?? existing.account_id;
  const account = accounts.get(accountId);
  if (!account || (account.is_archived && accountId !== existing.account_id)) throw notFound('Account');

  const update: Record<string, unknown> = {};
  const amount = patch.amount_minor ?? Number(existing.amount_minor);
  const currency = patch.currency ?? existing.currency;
  const rate = patch.fx_khr_per_usd ?? Number(existing.fx_khr_per_usd);

  let dest: AccountRow | undefined;
  if (existing.type === 'transfer') {
    const destId = patch.to_account_id ?? (existing.to_account_id as string);
    dest = accounts.get(destId);
    if (!dest) throw notFound('Destination account');
    if (dest.id === account.id) throw new AppError(400, 'bad_request', 'Source and destination must differ');
    if (patch.category_id) throw new AppError(400, 'bad_request', 'Transfers have no category');
    update.to_account_id = dest.id;
  } else {
    if (patch.to_account_id || patch.to_amount_minor)
      throw new AppError(400, 'bad_request', 'Only transfers have a destination account');
    if (patch.category_id !== undefined) {
      update.category_id = await resolveCategory(ctx, existing.type as 'income' | 'expense', patch.category_id);
    }
  }

  // Only recompute money fields when something financial changed, so e.g. editing a
  // description never silently re-prices a transfer.
  const financialChange =
    patch.amount_minor !== undefined ||
    patch.currency !== undefined ||
    patch.account_id !== undefined ||
    patch.to_account_id !== undefined ||
    patch.to_amount_minor !== undefined ||
    patch.fx_khr_per_usd !== undefined;
  if (financialChange) {
    const d = derive(amount, currency, account, rate, dest, patch.to_amount_minor);
    Object.assign(update, {
      account_id: account.id,
      amount_minor: amount,
      currency,
      fx_khr_per_usd: rate,
      ...d,
    });
  } else {
    delete update.to_account_id;
  }
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.occurred_on !== undefined) update.occurred_on = patch.occurred_on;

  const res = await ctx.db
    .from('transactions')
    .update(update)
    .eq('id', id)
    .eq('owner_id', ctx.ownerId)
    .select(TX_SELECT)
    .single();
  return unwrap(res, 'update transaction') as unknown as Transaction;
}

export async function deleteTransaction(ctx: Ctx, id: string): Promise<void> {
  const rows = unwrap(
    await ctx.db.from('transactions').delete().eq('id', id).eq('owner_id', ctx.ownerId).select('id'),
    'delete transaction',
  ) as Array<{ id: string }>;
  if (!rows.length) throw notFound('Transaction');
}

export async function listTransactions(
  ctx: Ctx,
  f: z.infer<typeof transactionsQuery>,
): Promise<{ rows: Transaction[]; total: number }> {
  let q = ctx.db.from('transactions').select(TX_SELECT, { count: 'exact' }).eq('owner_id', ctx.ownerId);
  if (f.type) q = q.eq('type', f.type);
  if (f.category_id) q = q.eq('category_id', f.category_id);
  // account_id is a validated UUID, so interpolating into the or() filter is safe
  if (f.account_id) q = q.or(`account_id.eq.${f.account_id},to_account_id.eq.${f.account_id}`);
  if (f.from) q = q.gte('occurred_on', f.from);
  if (f.to) q = q.lte('occurred_on', f.to);
  if (f.q) q = q.ilike('description', likePattern(f.q));
  const from = (f.page - 1) * f.limit;
  const res = await q
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + f.limit - 1);
  const rows = unwrap(res, 'list transactions') as unknown as Transaction[];
  return { rows, total: res.count ?? rows.length };
}

/** Income/expense rows in [from, to] as a light projection for reporting. */
export async function fetchLedger(ctx: Ctx, from: string, to: string): Promise<LedgerRow[]> {
  return fetchAll<LedgerRow>((a, b) =>
    ctx.db
      .from('transactions')
      .select('type, occurred_on, amount_minor, currency, fx_khr_per_usd, category_id')
      .eq('owner_id', ctx.ownerId)
      .in('type', ['income', 'expense'])
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on')
      .order('id')
      .range(a, b) as unknown as PromiseLike<{ data: LedgerRow[] | null; error: { message: string } | null }>,
  );
}

/** Convert a sum of account balances into one display currency at the CURRENT rate. */
export function totalBalance(accounts: Account[], display: Currency, rate: number): number {
  return accounts.reduce((s, a) => s + convertMinor(a.balance_minor, a.currency, display, rate), 0);
}
