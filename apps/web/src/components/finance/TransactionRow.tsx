import type { Account, Transaction } from '@pla/shared';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useMoney } from '@/lib/money';
import { prettyDate } from '@/lib/dates';
import { useOwner } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

export function TransactionRow({
  tx,
  accounts,
  onClick,
  showDate = true,
}: {
  tx: Transaction;
  accounts?: Account[];
  onClick?: () => void;
  showDate?: boolean;
}) {
  const { fmt, cur, convert } = useMoney();
  const { today } = useOwner();
  const acct = accounts?.find((a) => a.id === tx.account_id);
  const dest = accounts?.find((a) => a.id === tx.to_account_id);
  const isTransfer = tx.type === 'transfer';
  const title = tx.description || (isTransfer ? t('Transfer') : tx.category?.name ? t(tx.category.name) : t('Transaction'));
  const sub = [
    isTransfer ? `${acct?.name ?? '…'} → ${dest?.name ?? '…'}` : tx.category?.name ? t(tx.category.name) : undefined,
    showDate ? prettyDate(tx.occurred_on, today) : undefined,
    !isTransfer && acct ? acct.name : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  // show the converted value when the entry was made in the other currency
  const converted = tx.currency !== cur && !isTransfer ? convert(tx.amount_minor, tx.currency, cur) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left"
    >
      <CategoryIcon icon={isTransfer ? 'transfer' : tx.category?.icon} color={isTransfer ? '#38bdf8' : tx.category?.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={cn(
            'block text-[15px] font-extrabold tabular-nums',
            tx.type === 'income' && 'text-primary',
            isTransfer && 'text-info',
          )}
        >
          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
          {fmt(tx.amount_minor, tx.currency)}
        </span>
        {converted !== null && (
          <span className="block text-[11px] tabular-nums text-muted-foreground">≈ {fmt(converted)}</span>
        )}
      </span>
    </button>
  );
}
