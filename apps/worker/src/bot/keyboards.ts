import type { Category, Currency, TaskItem } from '@pla/shared';
import type { Env } from '../config/env';
import type { InlineKeyboard } from '../services/telegram';

export function openAppKeyboard(env: Env, label = '🚀 Open My Dashboard'): InlineKeyboard {
  return { inline_keyboard: [[{ text: label, web_app: { url: env.APP_URL } }]] };
}

/** callback_data = "<e|i>|<amount_minor>|<currency>|<category slug>" (always < 64 bytes). */
export function categoryKeyboard(
  kind: 'expense' | 'income',
  amountMinor: number,
  currency: Currency,
  categories: Category[],
): InlineKeyboard {
  const tag = kind === 'expense' ? 'e' : 'i';
  const buttons = categories
    .filter((c) => c.kind === kind)
    .map((c) => ({ text: c.name, callback_data: `${tag}|${amountMinor}|${currency}|${c.slug}` }));
  const rows: InlineKeyboard['inline_keyboard'] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: '✖️ Cancel', callback_data: 'x' }]);
  return { inline_keyboard: rows };
}

/** callback_data = "t|<occurrence id>" */
export function taskKeyboard(items: TaskItem[], env: Env): InlineKeyboard {
  const rows: InlineKeyboard['inline_keyboard'] = items.slice(0, 8).map((t) => [
    { text: `✅ ${t.title.slice(0, 40)}`, callback_data: `t|${t.occurrence_id}` },
  ]);
  rows.push([{ text: '🚀 Open Tasks', web_app: { url: `${env.APP_URL.replace(/\/$/, '')}/tasks` } }]);
  return { inline_keyboard: rows };
}
