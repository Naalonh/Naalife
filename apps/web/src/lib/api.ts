import type { ApiErrorBody } from '@pla/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'pla.session';

let token: string | null = null;
let reauth: (() => Promise<boolean>) | null = null;

function safeStorage<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined; // storage may be blocked in some webviews
  }
}

export function setToken(t: string | null) {
  token = t;
  safeStorage(() => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY)));
}

export function loadStoredToken(): string | null {
  token = token ?? safeStorage(() => sessionStorage.getItem(TOKEN_KEY)) ?? null;
  return token;
}

export function setReauthHandler(fn: () => Promise<boolean>) {
  reauth = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Params;
  signal?: AbortSignal;
}

function url(path: string, params?: Params): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${BASE}/api${path}${s ? `?${s}` : ''}`;
}

async function send(path: string, opts: Options, retry: boolean): Promise<Response> {
  const res = await fetch(url(path, opts.params), {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401 && retry && reauth && path !== '/auth/telegram' && path !== '/auth/dev') {
    if (await reauth()) return send(path, opts, false);
  }
  return res;
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    res.status,
    body?.error?.code ?? 'error',
    body?.error?.message ?? `Request failed (${res.status})`,
    body?.error?.details as ApiError['details'],
  );
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await send(path, opts, true);
  if (!res.ok) throw await toError(res);
  return ((await res.json()) as { data: T }).data;
}

export async function apiPage<T>(
  path: string,
  opts: Options = {},
): Promise<{ data: T[]; meta: { page: number; limit: number; total: number } }> {
  const res = await send(path, opts, true);
  if (!res.ok) throw await toError(res);
  return res.json();
}

/** Authenticated file download (CSV). The bearer token can't ride on a plain <a href>. */
export async function download(path: string, params: Params, filename: string): Promise<void> {
  const res = await send(path, { params }, true);
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
