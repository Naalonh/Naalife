import type { Env } from '../config/env';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface SendResult {
  ok: boolean;
  status: number;
  messageId?: number;
  error?: string;
  /** True when retrying cannot help (bot blocked, chat gone). */
  permanent?: boolean;
}

export type InlineKeyboard = {
  inline_keyboard: Array<
    Array<{ text: string; callback_data?: string; web_app?: { url: string }; url?: string }>
  >;
};

export interface SendOptions {
  reply_markup?: InlineKeyboard | { force_reply: true; input_field_placeholder?: string; selective?: boolean };
  disable_web_page_preview?: boolean;
}

/** Thin Bot API call. Never logs the token or message bodies (they contain financial data). */
export async function telegramApi<T = unknown>(
  env: Env,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; result?: T; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    return { ok: Boolean(json.ok), status: res.status, result: json.result, description: json.description };
  } catch {
    return { ok: false, status: 0, description: 'network error' };
  }
}

export async function sendTelegramMessage(
  env: Env,
  chatId: number,
  text: string,
  opts: SendOptions = {},
): Promise<SendResult> {
  const r = await telegramApi<{ message_id: number }>(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
  return {
    ok: r.ok,
    status: r.status,
    messageId: r.result?.message_id,
    error: r.ok ? undefined : r.description,
    permanent: r.status === 403 || r.status === 400,
  };
}
