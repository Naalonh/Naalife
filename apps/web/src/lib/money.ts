import { convertMinor, formatMinor, type Currency } from '@pla/shared';
import { useOwner } from '@/contexts/AuthContext';

/** Formatting + conversion helpers bound to the owner's saved currency and exchange rate. */
export function useMoney() {
  const { settings } = useOwner();
  const cur = settings.preferred_currency;
  const rate = settings.fx_khr_per_usd;
  return {
    cur,
    rate,
    secondary: settings.secondary_currency,
    fmt: (minor: number, currency: Currency = cur, opts?: { sign?: boolean }) => formatMinor(minor, currency, opts),
    convert: (minor: number, from: Currency, to: Currency) => convertMinor(minor, from, to, rate),
  };
}
