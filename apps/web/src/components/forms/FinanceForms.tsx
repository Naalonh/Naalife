import { useState } from 'react';
import {
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CURRENCIES,
  toMajorString,
  type Account,
  type AccountType,
  type Budget,
  type BudgetPeriod,
  type Currency,
} from '@pla/shared';
import { AmountField, toMinor } from '@/components/AmountField';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useOwner } from '@/contexts/AuthContext';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/utils';
import { useSubmit } from './useSubmit';
import { t } from '@/i18n';

const TYPE_LABEL: Record<AccountType, string> = {
  cash: t('Cash'),
  bank: t('Bank'),
  ewallet: t('E-wallet'),
  savings: t('Savings account'),
};

export function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const { busy, errors, run } = useSubmit();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash');
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? 'USD');
  const [opening, setOpening] = useState(account ? toMajorString(account.opening_balance_minor, account.currency) : '');
  const [error, setError] = useState<string>();

  const save = useApiMutation((v: { id?: string; body: Record<string, unknown> }) =>
    v.id ? api(`/accounts/${v.id}`, { method: 'PATCH', body: v.body }) : api('/accounts', { method: 'POST', body: v.body }),
  );

  async function submit(archive?: boolean) {
    let openingMinor = 0;
    if (opening.trim()) {
      const p = toMinor(opening, currency);
      if ('error' in p) return setError(p.error);
      openingMinor = p.minor;
    }
    setError(undefined);
    const body =
      archive !== undefined
        ? { is_archived: archive }
        : account
          ? { name, type, opening_balance_minor: openingMinor }
          : { name, type, currency, opening_balance_minor: openingMinor };
    const r = await run(
      () => save.mutateAsync({ id: account?.id, body }),
      archive !== undefined ? (archive ? t('Account archived') : t('Account restored')) : account ? t('Account updated') : t('Account created'),
    );
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
      <Field label={t('Name')} error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. ABA Bank')} maxLength={60} required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Type')}>
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Currency')}>
          <Select value={currency} disabled={!!account} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('Opening balance')} hint={t('What the account held before you started tracking.')}>
        <AmountField value={opening} currency={currency} error={error} onChange={(v) => setOpening(v)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : account ? t('Save account') : t('Create account')}
      </Button>
      {account && (
        <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => void submit(!account.is_archived)}>
          {account.is_archived ? t('Restore account') : t('Archive account')}
        </Button>
      )}
    </form>
  );
}

export function BudgetForm({ budget, onDone }: { budget?: Budget; onDone: () => void }) {
  const me = useOwner();
  const { busy, errors, run } = useSubmit();
  const editing = !!budget;
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'daily');
  const [categoryId, setCategoryId] = useState(budget?.category_id ?? '');
  const [currency, setCurrency] = useState<Currency>(budget?.currency ?? me.settings.preferred_currency);
  const [amount, setAmount] = useState(budget ? toMajorString(budget.amount_minor, budget.currency) : '');
  const [threshold, setThreshold] = useState(budget?.alert_threshold_pct ?? 80);
  const [active, setActive] = useState(budget?.active ?? true);
  const [error, setError] = useState<string>();

  const save = useApiMutation((v: { id?: string; body: Record<string, unknown> }) =>
    v.id ? api(`/budgets/${v.id}`, { method: 'PATCH', body: v.body }) : api('/budgets', { method: 'POST', body: v.body }),
  );
  const remove = useApiMutation((id: string) => api(`/budgets/${id}`, { method: 'DELETE' }));

  async function submit() {
    const p = toMinor(amount, currency);
    if ('error' in p) return setError(p.error);
    setError(undefined);
    // period, category and currency are fixed once a budget exists; only limit, warning and on/off change
    const body = budget
      ? { amount_minor: p.minor, alert_threshold_pct: threshold, active }
      : { period, category_id: categoryId || null, amount_minor: p.minor, currency, alert_threshold_pct: threshold };
    const r = await run(() => save.mutateAsync({ id: budget?.id, body }), budget ? t('Budget updated') : t('Budget created'));
    if (r) onDone();
  }

  const scopeCat = me.categories.find((c) => c.id === categoryId)?.name;
  const scopeName = scopeCat ? t(scopeCat) : t('All spending');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {editing ? (
        <div className="rounded-2xl bg-foreground/[0.05] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Budget for')}</p>
          <p className="mt-0.5 text-base font-extrabold">
            {scopeName} <span className="font-semibold text-muted-foreground">· {titleCase(period)}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Period and category are fixed. To change them, create a new budget.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Period')}>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
              {BUDGET_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {titleCase(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Category')} error={errors.category_id}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('All spending')}</option>
              {me.categories
                .filter((c) => c.kind === 'expense')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {t(c.name)}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      )}

      <AmountField
        value={amount}
        currency={currency}
        autoFocus
        error={error ?? errors.amount_minor}
        onChange={(v, c) => {
          setAmount(v);
          if (!editing) setCurrency(c);
        }}
      />
      {editing && <p className="-mt-2 text-center text-xs text-muted-foreground">{t('Currency stays {0} for this budget.', currency)}</p>}

      <Field label={t('Warn me at {0}%', threshold)}>
        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-[hsl(var(--primary))]"
        />
      </Field>
      {errors.alert_threshold_pct ? <p className="text-xs text-danger">{errors.alert_threshold_pct}</p> : null}

      {editing && (
        <div className="flex items-center justify-between rounded-2xl bg-foreground/[0.05] px-4 py-3">
          <div>
            <p className="text-sm font-bold">{t('Active')}</p>
            <p className="text-xs text-muted-foreground">{t('Paused budgets show no warnings')}</p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} label={t('Budget active')} />
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : editing ? t('Save changes') : t('Create budget')}
      </Button>

      {editing && budget && (
        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(t('Delete this budget? Your transactions are not affected.'))) return;
            const r = await run(() => remove.mutateAsync(budget.id), t('Budget deleted'));
            if (r) onDone();
          }}
        >
          {t('Delete budget')}
        </Button>
      )}
    </form>
  );
}
