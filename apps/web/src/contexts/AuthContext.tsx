import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '@pla/shared';
import { api, loadStoredToken, setReauthHandler, setToken } from '@/lib/api';
import { initTelegram } from '@/lib/telegram';
import { useMe } from '@/hooks/queries';
import { t } from '@/i18n';

type Phase = 'booting' | 'authenticating' | 'ready' | 'denied' | 'not-telegram' | 'error';

interface AuthState {
  phase: Phase;
  message?: string;
  me: Me | undefined;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function login(): Promise<{ ok: true } | { ok: false; phase: Phase; message: string }> {
  const env = initTelegram();
  try {
    if (env.initData) {
      const { token } = await api<{ token: string }>('/auth/telegram', {
        method: 'POST',
        body: { initData: env.initData },
      });
      setToken(token);
      return { ok: true };
    }
    if (import.meta.env.DEV) {
      // Development-only: tree-shaken out of production builds. The Worker also enforces
      // ENVIRONMENT=development + loopback host, so this can never work in production.
      const { token } = await api<{ token: string }>('/auth/dev', { method: 'POST' });
      setToken(token);
      return { ok: true };
    }
    return { ok: false, phase: 'not-telegram', message: t('Open this app from your Telegram bot.') };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 403) return { ok: false, phase: 'denied', message: t('This assistant is private.') };
    if (status === 401) return { ok: false, phase: 'error', message: t('Telegram session could not be verified. Reopen the app.') };
    return { ok: false, phase: 'error', message: (e as Error).message || t('Could not reach the server.') };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [message, setMessage] = useState<string>();
  const started = useRef(false);

  const run = useCallback(async () => {
    setPhase('authenticating');
    const r = await login();
    if (r.ok) setPhase('ready');
    else {
      setPhase(r.phase);
      setMessage(r.message);
    }
  }, []);

  useEffect(() => {
    setReauthHandler(async () => (await login()).ok);
    if (started.current) return;
    started.current = true;
    // A reload within the same Telegram session can reuse the stored token; the first API
    // call transparently re-authenticates if it has expired.
    if (loadStoredToken()) setPhase('ready');
    else void run();
  }, [run]);

  const meQuery = useMe(phase === 'ready');

  const value = useMemo<AuthState>(
    () => ({ phase, message, me: meQuery.data, retry: () => void run() }),
    [phase, message, meQuery.data, run],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The authenticated owner's profile + settings. Only call below the auth gate. */
export function useOwner(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Owner not loaded');
  return me;
}
