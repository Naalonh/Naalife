import type { Currency } from '@pla/shared';
import { formatMinor } from '@pla/shared';
import { useCountUp } from '@/hooks/useCountUp';

/** A money value that counts smoothly to its new amount whenever it changes. */
export function AnimatedMoney({
  minor,
  currency,
  sign,
  className,
}: {
  minor: number;
  currency: Currency;
  sign?: boolean;
  className?: string;
}) {
  const v = useCountUp(minor);
  return <span className={className}>{formatMinor(v, currency, { sign })}</span>;
}
