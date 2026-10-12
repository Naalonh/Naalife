import { describe, expect, it } from 'vitest';
import { InitDataError, signSession, timingSafeEqual, verifyInitData, verifySession } from '../src/utils/telegramAuth';
import { BOT_TOKEN, OWNER_ID, signedInitData } from './helpers';

describe('Telegram initData verification', () => {
  it('accepts correctly signed, fresh data and extracts the user', async () => {
    const { user } = await verifyInitData(signedInitData({ id: OWNER_ID }), BOT_TOKEN);
    expect(user.id).toBe(OWNER_ID);
  });

  it('rejects a tampered payload', async () => {
    await expect(verifyInitData(signedInitData({ id: OWNER_ID }, { tamper: true }), BOT_TOKEN)).rejects.toThrow(
      InitDataError,
    );
  });

  it('rejects data signed with a different bot token', async () => {
    const forged = signedInitData({ id: OWNER_ID }, { token: '999:other-token' });
    await expect(verifyInitData(forged, BOT_TOKEN)).rejects.toThrow('bad signature');
  });

  it('rejects stale data (replay) and future-dated data', async () => {
    const old = signedInitData({ id: OWNER_ID }, { authDate: Math.floor(Date.now() / 1000) - 7200 });
    await expect(verifyInitData(old, BOT_TOKEN, { maxAgeSeconds: 3600 })).rejects.toThrow('expired');
    const future = signedInitData({ id: OWNER_ID }, { authDate: Math.floor(Date.now() / 1000) + 3600 });
    await expect(verifyInitData(future, BOT_TOKEN)).rejects.toThrow('future');
  });

  it('rejects a missing hash', async () => {
    await expect(verifyInitData('auth_date=1&user=%7B%22id%22%3A1%7D', BOT_TOKEN)).rejects.toThrow('missing hash');
  });
});

describe('session tokens', () => {
  it('round-trips and carries the telegram id', async () => {
    const { token } = await signSession(OWNER_ID, BOT_TOKEN);
    expect(await verifySession(token, BOT_TOKEN)).toEqual({ telegramId: OWNER_ID });
  });

  it('rejects expired, forged and cross-secret tokens', async () => {
    const { token } = await signSession(OWNER_ID, BOT_TOKEN, undefined, 1000);
    expect(await verifySession(token, BOT_TOKEN, undefined, 1000 + 13 * 3600)).toBeNull();

    const fresh = (await signSession(OWNER_ID, BOT_TOKEN)).token;
    const [h, , s] = fresh.split('.');
    const forgedBody = btoa(JSON.stringify({ sub: '1', exp: 9999999999 })).replace(/=+$/, '');
    expect(await verifySession(`${h}.${forgedBody}.${s}`, BOT_TOKEN)).toBeNull();
    expect(await verifySession(fresh, 'other:token')).toBeNull();
    expect(await verifySession('garbage', BOT_TOKEN)).toBeNull();
  });

  it('compares secrets in constant-time style', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
