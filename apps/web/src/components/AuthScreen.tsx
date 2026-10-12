import { Check, Lock, Loader2, Send, ShieldCheck, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

export type AuthScreenState = 'loading' | 'not-telegram' | 'denied' | 'error';

export interface AuthSteps {
  /** Telegram signature verified and session issued */
  session: boolean;
  /** profile + settings loaded */
  profile: boolean;
}

function Logo() {
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-primary/25 blur-3xl" aria-hidden />
      <span
        className="auth-orbit absolute inset-1 rounded-full border border-primary/30"
        style={{ borderTopColor: 'hsl(var(--primary))' }}
        aria-hidden
      />
      <span
        className="auth-orbit-rev absolute inset-6 rounded-full border border-accent/30"
        style={{ borderBottomColor: 'hsl(var(--accent))' }}
        aria-hidden
      />
      <div className="auth-float relative flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-primary via-info to-accent shadow-fab">
        <svg viewBox="0 0 64 64" className="h-11 w-11" aria-hidden>
          <path d="M16 34l10 10 22-24" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function Step({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300',
          state === 'done' && 'bg-primary text-primary-foreground',
          state === 'active' && 'bg-primary/15 text-primary',
          state === 'pending' && 'bg-foreground/[0.07] text-muted-foreground',
        )}
      >
        {state === 'done' ? (
          <Check className="check-pop h-4 w-4" strokeWidth={3} />
        ) : state === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className={cn('text-sm font-semibold', state === 'pending' && 'text-muted-foreground')}>{label}</span>
    </li>
  );
}

export function AuthScreen({
  state,
  message,
  steps,
  onRetry,
}: {
  state: AuthScreenState;
  message?: string;
  steps?: AuthSteps;
  onRetry?: () => void;
}) {
  const s = steps ?? { session: false, profile: false };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-between px-6 pb-8 pt-[calc(4rem+var(--tg-viewport-safe-area-inset-top,0px)+var(--tg-viewport-content-safe-area-inset-top,0px))] text-center">
      <div className="flex w-full flex-col items-center">
        <Logo />
        <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tightest">
          {t('Life')} <span className="text-gradient">{t('Assistant')}</span>
        </h1>
        <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground">
          {t('Money, savings and tasks in one private place.')}
        </p>

        <div className="stagger mt-8 w-full">
          {state === 'loading' && (
            <div className="glass rounded-3xl p-5 text-left">
              <ul className="space-y-3.5">
                <Step label={t('Verifying with Telegram')} state={s.session ? 'done' : 'active'} />
                <Step label={t('Opening your secure session')} state={s.session ? 'done' : 'pending'} />
                <Step label={t('Loading your dashboard')} state={s.profile ? 'done' : s.session ? 'active' : 'pending'} />
              </ul>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
                <div className="auth-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-accent" />
              </div>
            </div>
          )}

          {state === 'not-telegram' && (
            <div className="glass rounded-3xl p-5 text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-info/15 text-info">
                  <Send className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-extrabold">{t('Open from Telegram')}</p>
                  <p className="text-xs text-muted-foreground">{message ?? t('This app runs inside Telegram.')}</p>
                </div>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm">
                {['Open Telegram', 'Go to your assistant bot', 'Tap “Open My Dashboard”'].map((step, i) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-xs font-extrabold">
                      {i + 1}
                    </span>
                    <span className="font-medium">{t(step)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {state === 'denied' && (
            <div className="glass rounded-3xl p-6">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-danger/15 text-danger">
                <Lock className="h-7 w-7" />
              </span>
              <p className="mt-4 text-lg font-extrabold">{t('Private assistant')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {message ?? t('This assistant belongs to someone else.')} {t('Only its owner can sign in.')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="glass rounded-3xl p-6">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-warning/15 text-warning">
                <WifiOff className="h-7 w-7" />
              </span>
              <p className="mt-4 text-lg font-extrabold">{t('Can\'t connect')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{message ?? t('Check your connection and try again.')}</p>
              {onRetry && (
                <Button className="mt-5 w-full" size="lg" onClick={onRetry}>
                  {t('Try again')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-10 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> {t('Secured by Telegram · no passwords')}
      </p>
    </main>
  );
}
