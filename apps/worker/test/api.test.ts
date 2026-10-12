import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseEnv, BOT_TOKEN, OWNER_ID, signedInitData } from './helpers';
import { signSession } from '../src/utils/telegramAuth';

// The API layer is exercised without a real database: owner resolution + context are stubbed,
// and every test below must be rejected (or validated) BEFORE any query would run.
vi.mock('../src/services/context', async (orig) => {
  const actual = await orig<typeof import('../src/services/context')>();
  return {
    ...actual,
    resolveOwnerId: vi.fn(async () => '00000000-0000-4000-8000-000000000001'),
    buildCtx: vi.fn(async (env: unknown, db: unknown, ownerId: string) => ({
      env,
      db,
      ownerId,
      today: '2026-03-18',
      defer: () => undefined,
      settings: {
        preferred_currency: 'USD',
        secondary_currency: 'KHR',
        fx_khr_per_usd: 4100,
        timezone: 'Asia/Phnom_Penh',
        theme: 'dark',
        default_account_id: null,
        task_reminders_enabled: true,
        budget_alerts_enabled: true,
        notifications: [],
      },
    })),
  };
});

import { createApp } from '../src/app';

const app = createApp();
const call = (path: string, init: RequestInit = {}, env = baseEnv) =>
  app.request(`https://api.example.com${path}`, init, env);

async function ownerToken(id = OWNER_ID) {
  return (await signSession(id, BOT_TOKEN)).token;
}

const PROTECTED: Array<[string, string]> = [
  ['GET', '/api/me'],
  ['GET', '/api/dashboard'],
  ['GET', '/api/accounts'],
  ['POST', '/api/accounts'],
  ['GET', '/api/transactions'],
  ['POST', '/api/transactions'],
  ['PATCH', '/api/transactions/3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
  ['DELETE', '/api/transactions/3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
  ['GET', '/api/budgets'],
  ['GET', '/api/savings'],
  ['POST', '/api/savings'],
  ['GET', '/api/tasks'],
  ['GET', '/api/routines'],
  ['GET', '/api/reports/monthly'],
  ['GET', '/api/reports/export'],
  ['GET', '/api/day-marks'],
  ['POST', '/api/day-marks'],
  ['DELETE', '/api/day-marks/2026-04-14'],
  ['GET', '/api/settings'],
  ['PATCH', '/api/settings'],
];

describe('authentication & authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(PROTECTED)('%s %s requires authentication', async (method, path) => {
    const res = await call(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });

  it('rejects garbage and forged bearer tokens', async () => {
    expect((await call('/api/me', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    const forged = (await signSession(OWNER_ID, 'wrong:bot-token')).token;
    expect((await call('/api/me', { headers: { Authorization: `Bearer ${forged}` } })).status).toBe(401);
  });

  it('rejects a validly signed session for a non-owner (403)', async () => {
    const token = await ownerToken(OWNER_ID + 1);
    const res = await call('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/telegram: rejects invalid, tampered and non-owner initData', async () => {
    const post = (initData: string) =>
      call('/api/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
    expect((await post('hash=abc&auth_date=1&user=%7B%7D')).status).toBe(401);
    expect((await post(signedInitData({ id: OWNER_ID }, { tamper: true }))).status).toBe(401);
    expect((await post(signedInitData({ id: OWNER_ID + 5 }))).status).toBe(403);
  });

  it('POST /api/auth/telegram: owner receives a session token that works', async () => {
    const res = await call('/api/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signedInitData({ id: OWNER_ID }) }),
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(typeof data.token).toBe('string');
    expect(data.expires_at).toBeGreaterThan(Date.now() / 1000);
  });

  it('dev login is a 404 in production, off by default, and loopback-only', async () => {
    const post = (url: string, env = baseEnv) =>
      app.request(url, { method: 'POST' }, env);
    expect((await post('https://api.example.com/api/auth/dev')).status).toBe(404);
    const dev = { ...baseEnv, ENVIRONMENT: 'development' };
    expect((await post('http://localhost:8787/api/auth/dev', dev)).status).toBe(404); // flag not set
    const enabled = { ...dev, DEV_AUTH_ENABLED: 'true' };
    expect((await post('https://api.example.com/api/auth/dev', enabled)).status).toBe(404); // non-loopback host
    expect((await post('http://localhost:8787/api/auth/dev', { ...enabled, ENVIRONMENT: 'production' })).status).toBe(404);
    expect((await post('http://localhost:8787/api/auth/dev', enabled)).status).toBe(200);
  });
});

describe('request validation', () => {
  const authed = async () => ({
    Authorization: `Bearer ${await ownerToken()}`,
    'content-type': 'application/json',
  });
  const post = async (path: string, body: unknown, method = 'POST') =>
    call(path, { method, headers: await authed(), body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('rejects invalid JSON', async () => {
    const res = await post('/api/transactions', '{not json');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
  });

  it('returns field-level validation errors in the standard envelope', async () => {
    const res = await post('/api/transactions', { type: 'expense', amount_minor: -5, currency: 'EUR' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    const paths = body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['account_id', 'amount_minor', 'currency']));
  });

  it('rejects malformed identifiers and query params', async () => {
    expect((await post('/api/transactions/not-a-uuid', { description: 'x' }, 'PATCH')).status).toBe(400);
    const res = await call('/api/transactions?limit=5000&from=2026-99-99', { headers: await authed() });
    expect(res.status).toBe(400);
  });

  it('validates skip requests', async () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect((await post(`/api/tasks/${id}`, { skipped: 'yes' }, 'PATCH')).status).toBe(400);
    expect((await post(`/api/tasks/${id}`, { skipped: true, completed: true }, 'PATCH')).status).toBe(400);
  });

  it('validates day type payloads and dates', async () => {
    expect((await post('/api/day-marks', { from: '2026-04-14', kind: 'vacation' })).status).toBe(400);
    expect((await post('/api/day-marks', { from: '2026-04-14', to: '2026-04-01', kind: 'off' })).status).toBe(400);
    const res = await call('/api/day-marks?from=nope&to=2026-04-30', { headers: await authed() });
    expect(res.status).toBe(400);
    const del = await call('/api/day-marks/not-a-date', { method: 'DELETE', headers: await authed() });
    expect(del.status).toBe(400);
  });

  it('validates savings, tasks and settings payloads', async () => {
    expect((await post('/api/savings', { name: '', target_minor: 0, currency: 'USD' })).status).toBe(400);
    expect((await post('/api/tasks', { title: 'x', recurrence_type: 'hourly' })).status).toBe(400);
    expect((await post('/api/settings', { fx_khr_per_usd: -1 }, 'PATCH')).status).toBe(400);
  });
});

describe('CORS and unknown routes', () => {
  it('only allows the configured app origin', async () => {
    const ok = await call('/api/health', { headers: { Origin: 'https://app.example.com' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    const bad = await call('/api/health', { headers: { Origin: 'https://evil.example.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns a JSON 404', async () => {
    const res = await call('/api/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });
});
