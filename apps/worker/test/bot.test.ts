import { afterEach, describe, expect, it, vi } from 'vitest';
import { guessCategory, parseQuickEntry, uuidFrom } from '../src/bot/parse';
import { createApp } from '../src/app';
import { baseEnv, OWNER_ID } from './helpers';

describe('quick entry parsing', () => {
  it('parses the spec example', () => {
    expect(parseQuickEntry('2.50 lunch', 'USD')).toEqual({ amount_minor: 250, currency: 'USD', description: 'lunch' });
  });

  it('understands currency markers in several forms', () => {
    expect(parseQuickEntry('$5 coffee', 'KHR')).toMatchObject({ amount_minor: 500, currency: 'USD' });
    expect(parseQuickEntry('4000 khr tuk tuk', 'USD')).toMatchObject({ amount_minor: 4000, currency: 'KHR', description: 'tuk tuk' });
    expect(parseQuickEntry('5usd books', 'KHR')).toMatchObject({ amount_minor: 500, currency: 'USD', description: 'books' });
    expect(parseQuickEntry('៛8000 noodles', 'USD')).toMatchObject({ amount_minor: 8000, currency: 'KHR' });
    expect(parseQuickEntry('2.5', 'USD')).toMatchObject({ amount_minor: 250, description: '' });
  });

  it('returns null for unparseable input', () => {
    expect(parseQuickEntry('lunch 2.50', 'USD')).toBeNull();
    expect(parseQuickEntry('', 'USD')).toBeNull();
    expect(parseQuickEntry('1.555 x', 'USD')).toBeNull();
  });

  it('guesses categories and asks when unsure', () => {
    expect(guessCategory('lunch', 'expense')).toBe('food');
    expect(guessCategory('grab to office', 'expense')).toBe('transportation');
    expect(guessCategory('electricity bill', 'expense')).toBe('bills');
    expect(guessCategory('monthly salary', 'income')).toBe('salary');
    expect(guessCategory('zzz', 'expense')).toBeNull();
  });

  it('derives stable idempotency keys per update', async () => {
    const a = await uuidFrom('expense:100');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await uuidFrom('expense:100')).toBe(a);
    expect(await uuidFrom('expense:101')).not.toBe(a);
  });
});

describe('Telegram webhook protection', () => {
  const app = createApp();
  const update = (fromId: number) => ({
    update_id: 1,
    message: { text: '/balance', from: { id: fromId, first_name: 'X' }, chat: { id: fromId, type: 'private' } },
  });
  const post = (headers: Record<string, string>, body: unknown) =>
    app.request(
      'https://api.example.com/telegram/webhook',
      { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      baseEnv,
    );

  afterEach(() => vi.unstubAllGlobals());

  it('rejects requests without or with the wrong secret token', async () => {
    expect((await post({}, update(OWNER_ID))).status).toBe(401);
    expect((await post({ 'X-Telegram-Bot-Api-Secret-Token': 'wrong' }, update(OWNER_ID))).status).toBe(401);
  });

  it('ignores non-owners: replies "private" only and never touches data', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ 'X-Telegram-Bot-Api-Secret-Token': baseEnv.TELEGRAM_WEBHOOK_SECRET }, update(OWNER_ID + 9));
    expect(res.status).toBe(200);
    // exactly one outbound call: the Telegram "private assistant" reply; no Supabase calls
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('api.telegram.org');
    expect(JSON.parse(init.body).text).toContain('private');
  });
});
