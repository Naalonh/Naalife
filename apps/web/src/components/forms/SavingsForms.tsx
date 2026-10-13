import { useEffect, useRef, useState } from 'react';
import { Banknote, Check, CircleSlash, Landmark, PiggyBank, QrCode, Smartphone, type LucideIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import {
  buildKhqr,
  khqrMissing,
  scheduleStatus,
  toMajorString,
  type Currency,
  type KhqrAccount,
  type SavingsGoal,
} from '@pla/shared';
import { AmountField, toMinor } from '@/components/AmountField';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { useOwner } from '@/contexts/AuthContext';
import { useAccounts, useApiMutation, useGoals } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/money';
import { addDaysIso } from '@/lib/dates';
import { cn, newRequestId } from '@/lib/utils';
import { useSubmit } from './useSubmit';
import { t } from '@/i18n';

const LAST_ACCOUNT_KEY = 'pla.lastSavingsAccount';
const TYPE_ICON: Record<string, LucideIcon> = { cash: Banknote, bank: Landmark, ewallet: Smartphone, savings: PiggyBank };

function readLastAccount(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}

function QuickFill({ label, onClick, tone }: { label: string; onClick: () => void; tone?: 'warning' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-xs font-bold transition-transform active:scale-95',
        tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary',
      )}
    >
      {label}
    </button>
  );
}

export function ContributionForm({ goal: initial, onDone }: { goal?: SavingsGoal; onDone: () => void }) {
  const me = useOwner();
  const { fmt, convert } = useMoney();
  const goals = useGoals();
  const accounts = useAccounts();
  const { busy, errors, run } = useSubmit();
  const active = (goals.data ?? []).filter((g) => g.status === 'active');
  const [goalId, setGoalId] = useState(initial?.id ?? '');
  const goal = active.find((g) => g.id === goalId) ?? initial;
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? me.settings.preferred_currency);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const touched = useRef(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [requestId] = useState(newRequestId);
  const [qr, setQr] = useState<{ value: string; amount: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  const st = me.settings;
  const khqrAccount: KhqrAccount = {
    account_type: st.bakong_account_type,
    account_id: st.bakong_account_id ?? '',
    merchant_name: st.bakong_merchant_name ?? '',
    merchant_city: st.bakong_merchant_city,
    phone: st.bakong_phone,
    merchant_id: st.bakong_merchant_id,
    acquiring_bank: st.bakong_acquiring_bank,
    store_label: st.bakong_store_label,
  };
  const khqrReady = khqrMissing(khqrAccount).length === 0;

  useEffect(() => {
    if (!qr) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [qr]);

  function showQr() {
    const p = toMinor(amount, currency);
    if ('error' in p) return setError(p.error);
    if (!goal) return setError(t('Choose a goal'));
    setError(undefined);
    try {
      const at = new Date();
      const value = buildKhqr({ account: khqrAccount, currency, amount_minor: p.minor, note: goal.name, now: at });
      setNow(at.getTime());
      setQr({ value, amount: fmt(p.minor, currency), expiresAt: at.getTime() + 15 * 60_000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create the QR'));
    }
  }

  // pre-select the account you used last time (bank or cash), until you pick one yourself
  useEffect(() => {
    if (touched.current || !accounts.data) return;
    const last = readLastAccount();
    if (last && accounts.data.some((a) => a.id === last && !a.is_archived)) setAccountId(last);
  }, [accounts.data]);

  const add = useApiMutation((v: { goalId: string; body: Record<string, unknown> }) =>
    api(`/savings/${v.goalId}/contributions`, { method: 'POST', body: v.body }),
  );

  async function submit() {
    const id = goalId || initial?.id;
    if (!id || !goal) return setError(t('Choose a goal'));
    const p = toMinor(amount, currency);
    if ('error' in p) return setError(p.error);
    setError(undefined);
    // the goal tracks its own currency; convert at the saved exchange rate
    const inGoalCurrency = convert(p.minor, currency, goal.currency);
    const r = await run(
      () =>
        add.mutateAsync({
          goalId: id,
          body: {
            amount_minor: inGoalCurrency,
            account_id: accountId || undefined,
            note,
            client_request_id: requestId,
          },
        }),
      t('Savings added 🎉'),
    );
    if (r) {
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      onDone();
    }
  }

  const suggested = goal?.daily_requirement_minor ?? 0;
  const sched = goal
    ? scheduleStatus(goal.target_minor, goal.saved_minor, goal.start_date, goal.target_date, me.today)
    : null;

  function fill(minorInGoalCurrency: number) {
    if (!goal) return;
    setCurrency(goal.currency);
    setAmount(toMajorString(minorInGoalCurrency, goal.currency));
    setError(undefined);
  }

  // what the entered amount would do to the goal (amount converted into the goal currency)
  const entered = goal ? toMinor(amount, currency) : null;
  const preview =
    goal && entered && 'minor' in entered
      ? (() => {
          const add = convert(entered.minor, currency, goal.currency);
          const after = goal.saved_minor + add;
          return {
            after,
            completes: after >= goal.target_minor,
            over: Math.max(0, after - goal.target_minor),
            left: Math.max(0, goal.target_minor - after),
            pct: Math.min(100, Math.floor((after / goal.target_minor) * 100)),
          };
        })()
      : null;

  if (qr) {
    const left = Math.max(0, Math.round((qr.expiresAt - now) / 1000));
    const expired = left === 0;
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          {t('Scan with any Bakong / bank app to send {0} to {1}', qr.amount, st.bakong_merchant_name ?? '')}
        </p>
        <div className={cn('mx-auto w-fit rounded-3xl bg-white p-4 transition-opacity', expired && 'opacity-30')}>
          <QRCodeSVG value={qr.value} size={224} level="M" />
        </div>
        <p className="text-2xl font-extrabold tabular-nums">{qr.amount}</p>
        <p className={cn('text-xs font-semibold tabular-nums', expired ? 'text-danger' : 'text-muted-foreground')}>
          {expired
            ? t('This QR has expired')
            : t('Expires in {0}', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`)}
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <Button size="lg" className="w-full" disabled={busy || expired} onClick={() => void submit()}>
          {busy ? t('Saving…') : t('I have paid · add to savings')}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setQr(null)}>
          {t('Back')}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!initial && (
        <Field label={t('Goal')} error={errors.goal_id}>
          <Select
            value={goalId}
            onChange={(e) => {
              setGoalId(e.target.value);
              const g = active.find((x) => x.id === e.target.value);
              if (g) setCurrency(g.currency);
            }}
            required
          >
            <option value="" disabled>
              {t('Select a goal…')}
            </option>
            {active.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <AmountField
        value={amount}
        currency={currency}
        autoFocus
        error={error ?? errors.amount_minor}
        onChange={(v, c) => {
          setAmount(v);
          setCurrency(c);
        }}
      />
      {goal && (
        <div className="flex flex-wrap gap-2">
          {suggested > 0 && (
            <QuickFill
              label={t('Today {0}', fmt(suggested, goal.currency))}
              onClick={() => fill(suggested)}
            />
          )}
          {sched && sched.state === 'behind' && (
            <QuickFill
              tone="warning"
              label={t('Catch up {0}', fmt(Math.min(-sched.diff_minor, goal.remaining_minor), goal.currency))}
              onClick={() => fill(Math.min(-sched.diff_minor, goal.remaining_minor))}
            />
          )}
          {goal.remaining_minor > 0 && (
            <QuickFill label={t('Finish {0}', fmt(goal.remaining_minor, goal.currency))} onClick={() => fill(goal.remaining_minor)} />
          )}
        </div>
      )}

      {goal && preview && (
        <div
          className={cn(
            'rounded-2xl px-3.5 py-3 text-sm',
            preview.completes ? 'bg-warning/15 text-warning' : 'bg-foreground/[0.05] text-muted-foreground',
          )}
        >
          {preview.completes ? (
            <p className="font-semibold">
              {preview.over > 0
                ? t('This completes “{0}” and goes {1} over the target. You can reverse it later from the goal.', goal.name, fmt(preview.over, goal.currency))
                : t('This completes “{0}”. You can reverse it later from the goal.', goal.name)}
            </p>
          ) : (
            <p>
              {t('After this: {0} saved ({1}%) · {2} to go', fmt(preview.after, goal.currency), preview.pct, fmt(preview.left, goal.currency))}
            </p>
          )}
        </div>
      )}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Saved from')}</span>
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: '', name: t('Not tracked'), type: 'none', sub: t('No balance change') }, ...(accounts.data ?? [])
            .filter((a) => !a.is_archived)
            .map((a) => ({ id: a.id, name: a.name, type: a.type as string, sub: fmt(a.balance_minor, a.currency) }))].map((o) => {
            const Icon = TYPE_ICON[o.type] ?? CircleSlash;
            const active = accountId === o.id;
            return (
              <button
                key={o.id || 'none'}
                type="button"
                onClick={() => {
                  touched.current = true;
                  setAccountId(o.id);
                }}
                className={cn(
                  'relative flex min-w-[8.5rem] shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all',
                  active ? 'border-primary bg-primary/10' : 'border-foreground/10 bg-foreground/[0.04]',
                )}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.08] text-muted-foreground')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold leading-tight">{o.name}</span>
                  <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{o.sub}</span>
                </span>
                {active && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('Pick where this money was saved (bank, cash…). That account\'s balance drops; it never counts as spending.')}
        </p>
      </div>
      <Field label={t('Note')}>
        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : t('Add to savings')}
      </Button>
      {khqrReady ? (
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled={busy || !amount} onClick={showQr}>
          <QrCode className="mr-2 h-4 w-4" /> {t('Pay with KHQR')}
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/settings" className="font-semibold text-primary" onClick={onDone}>
            {t('Set up Bakong KHQR in Settings')}
          </Link>{' '}
          {t('to pay by QR.')}
        </p>
      )}
    </form>
  );
}

export function GoalForm({ goal, onDone }: { goal?: SavingsGoal; onDone: () => void }) {
  const me = useOwner();
  const { busy, errors, run } = useSubmit();
  const [name, setName] = useState(goal?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? me.settings.preferred_currency);
  const [target, setTarget] = useState(goal ? toMajorString(goal.target_minor, goal.currency) : '');
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? addDaysIso(me.today, 90));
  const [error, setError] = useState<string>();

  const save = useApiMutation((v: { id?: string; body: Record<string, unknown> }) =>
    v.id ? api(`/savings/${v.id}`, { method: 'PATCH', body: v.body }) : api('/savings', { method: 'POST', body: v.body }),
  );
  const remove = useApiMutation((id: string) => api(`/savings/${id}`, { method: 'DELETE' }));
  const archive = useApiMutation((v: { id: string; status: 'active' | 'archived' }) =>
    api(`/savings/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
  );

  async function submit() {
    const p = toMinor(target, currency);
    if ('error' in p) return setError(p.error);
    setError(undefined);
    const body = goal
      ? { name, target_minor: p.minor, target_date: targetDate }
      : { name, target_minor: p.minor, currency, target_date: targetDate };
    const r = await run(() => save.mutateAsync({ id: goal?.id, body }), goal ? t('Goal updated') : t('Goal created'));
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
      <Field label={t('Goal name')} error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. New laptop')} maxLength={80} required autoFocus />
      </Field>
      <Field label={t('Target amount')}>
        <AmountField
          value={target}
          currency={currency}
          error={error ?? errors.target_minor}
          onChange={(v, c) => {
            setTarget(v);
            if (!goal) setCurrency(c);
          }}
        />
      </Field>
      <Field label={t('Target date')} error={errors.target_date}>
        <Input type="date" value={targetDate} min={me.today} onChange={(e) => setTargetDate(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : goal ? t('Save goal') : t('Create goal')}
      </Button>
      {goal && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              const next = goal.status === 'archived' ? 'active' : 'archived';
              const r = await run(() => archive.mutateAsync({ id: goal.id, status: next }), next === 'archived' ? t('Archived') : t('Restored'));
              if (r) onDone();
            }}
          >
            {goal.status === 'archived' ? t('Restore') : t('Archive')}
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(t('Delete this goal and its contributions? Money taken from accounts is returned to them.'))) return;
              const r = await run(() => remove.mutateAsync(goal.id), t('Goal deleted'));
              if (r) onDone();
            }}
          >
            {t('Delete')}
          </Button>
        </div>
      )}
    </form>
  );
}
