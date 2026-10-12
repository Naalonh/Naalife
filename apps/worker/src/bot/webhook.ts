import type { Context } from 'hono';
import type { AppEnv, Ctx, Env } from '../config/env';
import { ownerTelegramId } from '../config/env';
import { createDb } from '../db/supabase';
import { buildCtx, resolveOwnerId } from '../services/context';
import { sendTelegramMessage, telegramApi } from '../services/telegram';
import { timingSafeEqual } from '../utils/telegramAuth';
import { handleMessage } from './commands';
import { handleCategoryCallback } from './handlers/entry';

interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TgUpdate {
  update_id: number;
  message?: {
    text?: string;
    from?: TgUser;
    chat: { id: number; type: string };
    reply_to_message?: { text?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TgUser;
    message?: { chat: { id: number } };
  };
}

/** Secret-token check, constant time. Telegram sends the value set via setWebhook(secret_token). */
export function webhookSecretValid(env: Env, header: string | undefined): boolean {
  if (!header || !env.TELEGRAM_WEBHOOK_SECRET) return false;
  return timingSafeEqual(header, env.TELEGRAM_WEBHOOK_SECRET);
}

async function toCtx(c: Context<AppEnv>, user: TgUser): Promise<Ctx> {
  const db = createDb(c.env);
  const ownerId = await resolveOwnerId(db, c.env, { first_name: user.first_name, username: user.username });
  const defer = (p: Promise<unknown>) => {
    const safe = p.catch(() => undefined);
    try {
      c.executionCtx.waitUntil(safe);
    } catch {
      /* no execution context */
    }
  };
  return buildCtx(c.env, db, ownerId, defer);
}

export async function handleWebhook(c: Context<AppEnv>): Promise<Response> {
  if (!webhookSecretValid(c.env, c.req.header('X-Telegram-Bot-Api-Secret-Token'))) {
    return c.json({ error: { code: 'unauthorized', message: 'Invalid webhook secret' } }, 401);
  }
  const update = (await c.req.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== 'number') return c.json({ ok: true });

  const owner = ownerTelegramId(c.env);
  const from = update.message?.from ?? update.callback_query?.from;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  try {
    if (!from || !chatId) return c.json({ ok: true });
    if (from.id !== owner) {
      // Private bot: say nothing about the app, and never touch data.
      if (update.message) await sendTelegramMessage(c.env, chatId, '🔒 This is a private assistant.');
      return c.json({ ok: true });
    }

    if (update.message?.text && update.message.chat.type === 'private') {
      const ctx = await toCtx(c, from);
      await handleMessage(ctx, {
        updateId: update.update_id,
        chatId,
        text: update.message.text,
        replyToText: update.message.reply_to_message?.text,
      });
    } else if (update.callback_query?.data) {
      const cq = update.callback_query;
      const ctx = await toCtx(c, from);
      await telegramApi(c.env, 'answerCallbackQuery', { callback_query_id: cq.id });
      const data = cq.data as string;
      const reply = (text: string) => sendTelegramMessage(c.env, chatId, text);
      if (data === 'x') {
        await reply('Cancelled.');
      } else if (data.startsWith('t|')) {
        const id = data.slice(2);
        const { data: rows } = await ctx.db
          .from('task_occurrences')
          .update({ status: 'done', completed_at: new Date().toISOString() })
          .eq('id', id)
          .eq('owner_id', ctx.ownerId)
          .select('id');
        await reply(rows?.length ? '✅ Task completed!' : '⚠️ Task not found.');
      } else {
        await handleCategoryCallback(ctx, data, cq.id, reply);
      }
    }
  } catch (e) {
    console.error('webhook_error', e instanceof Error ? e.name : 'unknown');
    if (chatId && from?.id === owner) {
      await sendTelegramMessage(c.env, chatId, '⚠️ Sorry, something went wrong. Please try again.');
    }
  }
  // Always 200 so Telegram does not endlessly redeliver; handlers are idempotent per update_id.
  return c.json({ ok: true });
}
