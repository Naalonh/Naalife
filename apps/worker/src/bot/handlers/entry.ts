import { formatMinor, type Currency } from '@pla/shared';
import type { Ctx } from '../../config/env';
import { enqueueBudgetAlerts } from '../../services/budgetService';
import { getCategories } from '../../services/context';
import { createTransaction } from '../../services/financeService';
import { processDueJobs } from '../../services/notificationService';
import { escapeHtml, type InlineKeyboard } from '../../services/telegram';
import { categoryKeyboard } from '../keyboards';
import { capitalise, guessCategory, parseQuickEntry, uuidFrom } from '../parse';

export const EXPENSE_PROMPT = '💸 Send the expense as <b>amount description</b>, e.g. <code>2.50 lunch</code>';
export const INCOME_PROMPT = '💵 Send the income as <b>amount description</b>, e.g. <code>500 salary</code>';

type Reply = (text: string, markup?: InlineKeyboard | { force_reply: true; input_field_placeholder?: string }) => Promise<unknown>;

async function defaultAccountFor(ctx: Ctx, currency: Currency): Promise<string | null> {
  const { data } = await ctx.db
    .from('financial_accounts')
    .select('id, currency')
    .eq('owner_id', ctx.ownerId)
    .eq('is_archived', false)
    .order('created_at');
  const accounts = (data ?? []) as Array<{ id: string; currency: Currency }>;
  const preferred = accounts.find((a) => a.id === ctx.settings.default_account_id);
  // The configured default if it matches the currency, else any account in that currency,
  // else fall back to the default / first account (amount is converted at the stored rate).
  if (preferred?.currency === currency) return preferred.id;
  return accounts.find((a) => a.currency === currency)?.id ?? preferred?.id ?? accounts[0]?.id ?? null;
}

export async function record(
  ctx: Ctx,
  kind: 'expense' | 'income',
  amountMinor: number,
  currency: Currency,
  description: string,
  slug: string,
  requestSeed: string,
  reply: Reply,
): Promise<void> {
  const cats = await getCategories(ctx);
  const category = cats.find((c) => c.kind === kind && c.slug === slug) ?? cats.find((c) => c.kind === kind && c.slug === 'other');
  const accountId = await defaultAccountFor(ctx, currency);
  if (!accountId) {
    await reply('⚠️ You have no active account. Create one in the app first.');
    return;
  }
  const { transaction, duplicate } = await createTransaction(
    ctx,
    {
      type: kind,
      account_id: accountId,
      amount_minor: amountMinor,
      currency,
      category_id: category?.id,
      description,
      client_request_id: await uuidFrom(requestSeed),
    },
    'bot',
  );
  if (kind === 'expense' && !duplicate) {
    await enqueueBudgetAlerts(ctx, transaction.category_id);
    ctx.defer(processDueJobs(ctx.env, ctx));
  }
  const title = kind === 'expense' ? '✅ <b>Expense Recorded!</b>' : '✅ <b>Income Recorded!</b>';
  await reply(
    [
      title,
      `Amount: ${formatMinor(transaction.amount_minor, transaction.currency)}`,
      `Category: ${escapeHtml(transaction.category?.name ?? 'Other')}`,
      `Description: ${escapeHtml(capitalise(transaction.description) || '—')}`,
      'Date: Today',
    ].join('\n'),
  );
}

/** Handles `/expense ...` and `/income ...` including guided entry for incomplete input. */
export async function handleEntryCommand(
  ctx: Ctx,
  kind: 'expense' | 'income',
  args: string,
  updateId: number,
  reply: Reply,
): Promise<void> {
  if (!args.trim()) {
    await reply(kind === 'expense' ? EXPENSE_PROMPT : INCOME_PROMPT, {
      force_reply: true,
      input_field_placeholder: kind === 'expense' ? '2.50 lunch' : '500 salary',
    });
    return;
  }
  const parsed = parseQuickEntry(args, ctx.settings.preferred_currency);
  if (!parsed || parsed.amount_minor <= 0) {
    await reply(
      `🤔 I couldn't read an amount. Try <code>/${kind} 2.50 lunch</code> (use KHR like <code>/${kind} 4000 khr taxi</code>).`,
    );
    return;
  }
  const slug = guessCategory(parsed.description, kind);
  if (!slug || !parsed.description) {
    const cats = await getCategories(ctx);
    await reply(
      `Which category for <b>${formatMinor(parsed.amount_minor, parsed.currency)}</b>${parsed.description ? ` (${escapeHtml(parsed.description)})` : ''}?`,
      categoryKeyboard(kind, parsed.amount_minor, parsed.currency, cats),
    );
    return;
  }
  await record(ctx, kind, parsed.amount_minor, parsed.currency, parsed.description, slug, `${kind}:${updateId}`, reply);
}

/** callback "e|250|USD|food" — category picked for a guided entry. */
export async function handleCategoryCallback(
  ctx: Ctx,
  data: string,
  callbackId: string,
  reply: Reply,
): Promise<void> {
  const [tag, amount, currency, slug] = data.split('|');
  const kind = tag === 'e' ? 'expense' : 'income';
  const amountMinor = Number(amount);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || (currency !== 'USD' && currency !== 'KHR')) {
    await reply('⚠️ That button has expired. Please start again.');
    return;
  }
  await record(ctx, kind, amountMinor, currency, '', slug, `cb:${callbackId}`, reply);
}
