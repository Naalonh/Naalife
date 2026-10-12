/** Telegram Mini App initData verification + stateless owner session tokens (WebCrypto only). */

const enc = new TextEncoder();

async function hmac(key: BufferSource, data: string | BufferSource): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, typeof data === 'string' ? enc.encode(data) : data);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export class InitDataError extends Error {}

export interface VerifyOptions {
  /** Max age of auth_date in seconds (default 1 hour). */
  maxAgeSeconds?: number;
  nowSeconds?: number;
}

/**
 * Validates Telegram Mini App initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  opts: VerifyOptions = {},
): Promise<{ user: TelegramUser; authDate: number }> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('missing hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!timingSafeEqual(expected, hash.toLowerCase())) throw new InitDataError('bad signature');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) throw new InitDataError('missing auth_date');
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSeconds ?? 3600;
  if (now - authDate > maxAge) throw new InitDataError('initData expired');
  if (authDate - now > 60) throw new InitDataError('auth_date in the future');

  let user: TelegramUser;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    throw new InitDataError('missing user');
  }
  if (!user || typeof user.id !== 'number') throw new InitDataError('invalid user');
  return { user, authDate };
}

// ---- session tokens (compact HS256 JWT) -------------------------------------

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function sessionKey(botToken: string, sessionSecret?: string): Promise<ArrayBuffer> {
  return hmac(enc.encode(sessionSecret || botToken), 'pla-session-v1');
}

export const SESSION_TTL_SECONDS = 12 * 3600;

export async function signSession(
  telegramId: number,
  botToken: string,
  sessionSecret?: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; expiresAt: number }> {
  const exp = nowSeconds + SESSION_TTL_SECONDS;
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ sub: String(telegramId), iat: nowSeconds, exp })));
  const sig = b64url(await hmac(await sessionKey(botToken, sessionSecret), `${header}.${body}`));
  return { token: `${header}.${body}.${sig}`, expiresAt: exp };
}

export async function verifySession(
  token: string,
  botToken: string,
  sessionSecret?: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ telegramId: number } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  try {
    const expected = b64url(await hmac(await sessionKey(botToken, sessionSecret), `${h}.${b}`));
    if (!timingSafeEqual(expected, s)) return null;
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(b)));
    if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) ? { telegramId: id } : null;
  } catch {
    return null;
  }
}
