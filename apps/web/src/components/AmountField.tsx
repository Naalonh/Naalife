import type React from 'react';
import { CURRENCIES, MoneyError, parseAmount, type Currency } from '@pla/shared';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

const SYMBOL: Record<Currency, string> = { USD: '$', KHR: '៛' };

/** Large centred amount entry with a currency pill switch. */
export function AmountField({
  value,
  currency,
  onChange,
  autoFocus,
  error,
}: {
  value: string;
  currency: Currency;
  onChange: (value: string, currency: Currency) => void;
  autoFocus?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-baseline justify-center gap-1.5 rounded-3xl bg-foreground/[0.05] px-4 py-5 ring-1 ring-foreground/10 transition-shadow focus-within:ring-2 focus-within:ring-primary/60',
          error && 'ring-danger/60',
        )}
      >
        <span className="text-3xl font-bold text-muted-foreground">{SYMBOL[currency]}</span>
        <input
          inputMode="decimal"
          autoFocus={autoFocus}
          placeholder={currency === 'USD' ? '0.00' : '0'}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''), currency)}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="min-w-[3ch] max-w-full bg-transparent text-center text-5xl font-extrabold tracking-tightest tabular-nums outline-none placeholder:text-muted-foreground/40"
          aria-label={t('Amount')}
        />
      </div>
      <div className="flex justify-center">
        <div className="glass inline-flex rounded-full p-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(value, c)}
              className={cn(
                'rounded-full px-5 py-1.5 text-xs font-bold transition-all',
                currency === c ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-center text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Returns minor units, or an error string suitable for display. */
export function toMinor(value: string, currency: Currency): { minor: number } | { error: string } {
  if (!value.trim()) return { error: t('Enter an amount') };
  try {
    const minor = parseAmount(value, currency);
    if (minor <= 0) return { error: t('Amount must be greater than zero') };
    return { minor };
  } catch (e) {
    return { error: e instanceof MoneyError ? e.message : t('Invalid amount') };
  }
}
