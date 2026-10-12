import { useMemo, useState } from 'react';
import { convertMinor, toMajorString, type Currency, type Transaction, type TransactionType } from '@pla/shared';
import { AmountField, toMinor } from '@/components/AmountField';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { useOwner } from '@/contexts/AuthContext';
import { useAccounts, useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/money';
import { cn, newRequestId } from '@/lib/utils';
import { useSubmit } from './useSubmit';
import { t } from '@/i18n';

export function TransactionForm({
  initialType = 'expense',
  tx,
  onDone,
}: {
  initialType?: TransactionType;
  tx?: Transaction;
  onDone: () => void;
}) {
  const me = useOwner();
  const { fmt, rate } = useMoney();
  const accounts = useAccounts();
  const { busy, errors, run } = useSubmit();
  const editing = !!tx;

  const [type, setType] = useState<TransactionType>(tx?.type ?? initialType);
  const [currency, setCurrency] = useState<Currency>(tx?.currency ?? me.settings.preferred_currency);
  const [amount, setAmount] = useState(tx ? toMajorString(tx.amount_minor, tx.currency) : '');
  const [categoryId, setCategoryId] = useState<string | null>(tx?.category_id ?? null);
  const [accountId, setAccountId] = useState(tx?.account_id ?? me.settings.default_account_id ?? '');
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id ?? '');
  const [date, setDate] = useState(tx?.occurred_on ?? me.today);
  const [description, setDescription] = useState(tx?.description ?? '');
  const [amountError, setAmountError] = useState<string>();
  // one key per form instance: a double tap or flaky network can never post the money twice
  const [requestId] = useState(newRequestId);

  const create = useApiMutation((body: Record<string, unknown>) =>
    api<Transaction>('/transactions', { method: 'POST', body }),
  );
  const update = useApiMutation((v: { id: string; body: Record<string, unknown> }) =>
    api<Transaction>(`/transactions/${v.id}`, { method: 'PATCH', body: v.body }),
  );
  const remove = useApiMutation((id: string) => api(`/transactions/${id}`, { method: 'DELETE' }));

  const list = accounts.data ?? [];
  const account = list.find((a) => a.id === accountId);
  const toAccount = list.find((a) => a.id === toAccountId);
  const cats = me.categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));

  const parsed = toMinor(amount, currency);
  const preview = useMemo(() => {
    if (!('minor' in parsed) || !account) return null;
    const lines: string[] = [];
    if (account.currency !== currency) {
      lines.push(`${fmt(convertMinor(parsed.minor, currency, account.currency, rate), account.currency)} from ${account.name}`);
    }
    if (type === 'transfer' && toAccount && toAccount.currency !== account.currency) {
      const acct = convertMinor(parsed.minor, currency, account.currency, rate);
      lines.push(`${fmt(convertMinor(acct, account.currency, toAccount.currency, rate), toAccount.currency)} to ${toAccount.name}`);
    }
    return lines.length ? `≈ ${lines.join(' → ')} (rate ${rate.toLocaleString()} KHR/USD)` : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, currency, accountId, toAccountId, type, rate, account?.currency, toAccount?.currency]);

  async function submit() {
    const p = toMinor(amount, currency);
    if ('error' in p) return setAmountError(p.error);
    setAmountError(undefined);
    if (!accountId) return;

    const base = {
      account_id: accountId,
      amount_minor: p.minor,
      currency,
      description,
      occurred_on: date,
      ...(type === 'transfer' ? { to_account_id: toAccountId || undefined } : { category_id: categoryId ?? undefined }),
    };
    const r = await run(
      () =>
        editing
          ? update.mutateAsync({ id: tx.id, body: base })
          : create.mutateAsync({ ...base, type, client_request_id: requestId }),
      editing ? t('Transaction updated') : type === 'expense' ? t('Expense added') : type === 'income' ? t('Income added') : t('Transfer recorded'),
    );
    if (r) onDone();
  }

  async function del() {
    if (!tx || !window.confirm(t('Delete this transaction? Balances and reports will update.'))) return;
    const r = await run(() => remove.mutateAsync(tx.id), t('Deleted'));
    if (r) onDone();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!editing && (
        <Segmented
          value={type}
          onChange={(v) => {
            setType(v);
            setCategoryId(null);
          }}
          options={[
            { value: 'expense', label: t('Expense') },
            { value: 'income', label: t('Income') },
            { value: 'transfer', label: t('Transfer') },
          ]}
        />
      )}

      <AmountField
        value={amount}
        currency={currency}
        autoFocus={!editing}
        error={amountError ?? errors.amount_minor}
        onChange={(v, c) => {
          setAmount(v);
          setCurrency(c);
        }}
      />
      {preview ? <p className="text-xs text-muted-foreground">{preview}</p> : null}

      {type !== 'transfer' && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Category')}</span>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border p-2 text-[11px] font-medium transition-colors',
                  categoryId === c.id ? 'border-primary bg-primary/10' : 'border-transparent bg-muted/50',
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-1">{t(c.name)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === 'transfer' ? t('From') : t('Account')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="" disabled>
              {t('Select…')}
            </option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'transfer' ? (
          <Field label={t('To')} error={errors.to_account_id}>
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
              <option value="" disabled>
                {t('Select…')}
              </option>
              {list
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label={t('Date')}>
            <Input type="date" value={date} max="2999-12-31" onChange={(e) => setDate(e.target.value)} required />
          </Field>
        )}
      </div>

      {type === 'transfer' && (
        <Field label={t('Date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      )}

      <Field label={t('Description')} error={errors.description}>
        <Input
          value={description}
          maxLength={200}
          placeholder={type === 'expense' ? t('e.g. Lunch') : type === 'income' ? t('e.g. March salary') : t('Optional note')}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="flex gap-2 pt-1">
        {editing && (
          <Button type="button" variant="danger" onClick={del} disabled={busy}>
            {t('Delete')}
          </Button>
        )}
        <Button type="submit" className="flex-1" size="lg" disabled={busy || !accountId || (type === 'transfer' && !toAccountId)}>
          {busy ? t('Saving…') : editing ? t('Save changes') : type === 'transfer' ? t('Transfer') : t(type === 'expense' ? 'Add expense' : type === 'income' ? 'Add income' : 'Add transfer')}
        </Button>
      </div>
    </form>
  );
}
