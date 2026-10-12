import type { Ctx } from '../config/env';
import { sendTelegramMessage, type SendOptions } from '../services/telegram';
import { handleEntryCommand, EXPENSE_PROMPT, INCOME_PROMPT } from './handlers/entry';
import {
  HELP_TEXT,
  balanceText,
  monthlyReportText,
  savingsText,
  todayTasks,
  todayText,
} from './handlers/queries';
import { openAppKeyboard, taskKeyboard } from './keyboards';

export const WELCOME_TEXT =
  '👋 Welcome to Personal Life Assistant!\nManage your finances, savings, tasks, and daily routines in one place.';

export interface BotMessage {
  updateId: number;
  chatId: number;
  text: string;
  /** text of the message this one replies to (guided entry) */
  replyToText?: string;
}

/** Dispatches a slash command or a reply to a guided-entry prompt. */
export async function handleMessage(ctx: Ctx, msg: BotMessage): Promise<void> {
  const reply = (text: string, markup?: SendOptions['reply_markup']) =>
    sendTelegramMessage(ctx.env, msg.chatId, text, markup ? { reply_markup: markup } : {});

  const text = msg.text.trim();

  // Reply to a guided-entry prompt, e.g. "2.50 lunch" in answer to the /expense prompt.
  if (!text.startsWith('/') && msg.replyToText) {
    if (msg.replyToText.includes(EXPENSE_PROMPT.replace(/<[^>]+>/g, ''))) {
      return handleEntryCommand(ctx, 'expense', text, msg.updateId, reply);
    }
    if (msg.replyToText.includes(INCOME_PROMPT.replace(/<[^>]+>/g, ''))) {
      return handleEntryCommand(ctx, 'income', text, msg.updateId, reply);
    }
  }

  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  if (!match) {
    await reply('Send /help to see what I can do. Quick entry: <code>/expense 2.50 lunch</code>');
    return;
  }
  const command = match[1].toLowerCase();
  const args = (match[2] ?? '').trim();

  switch (command) {
    case 'start':
      await reply(WELCOME_TEXT, openAppKeyboard(ctx.env));
      return;
    case 'app':
      await reply('Open your dashboard:', openAppKeyboard(ctx.env));
      return;
    case 'expense':
      return handleEntryCommand(ctx, 'expense', args, msg.updateId, reply);
    case 'income':
      return handleEntryCommand(ctx, 'income', args, msg.updateId, reply);
    case 'balance':
      await reply(await balanceText(ctx));
      return;
    case 'today':
      await reply(await todayText(ctx));
      return;
    case 'tasks': {
      const { text: body, items } = await todayTasks(ctx);
      await reply(body, items.length ? taskKeyboard(items, ctx.env) : undefined);
      return;
    }
    case 'save':
      await reply(await savingsText(ctx));
      return;
    case 'report':
      await reply(await monthlyReportText(ctx), openAppKeyboard(ctx.env, '📊 Full reports'));
      return;
    case 'help':
      await reply(HELP_TEXT);
      return;
    default:
      await reply('Unknown command. Send /help for the list.');
  }
}
