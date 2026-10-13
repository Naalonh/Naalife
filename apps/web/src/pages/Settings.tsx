import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarCheck,
  Clock,
  Coins,
  Download,
  Globe2,
  KeyRound,
  Landmark,
  MoonStar,
  Palette,
  QrCode,
  PiggyBank,
  ShieldCheck,
  Smartphone,
  Sun,
  Target,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { CURRENCIES, type Currency, type NotificationKind, type Settings as SettingsT } from '@pla/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useOwner } from '@/contexts/AuthContext';
import { applyTheme } from '@/contexts/ThemeContext';
import { useAccounts, useApiMutation } from '@/hooks/queries';
import { api, ApiError, download } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LANGS, lang, setLang, t } from '@/i18n';

const TIMEZONES = [
  'Asia/Phnom_Penh',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const NOTIFS: Record<NotificationKind, { title: string; hint: string; icon: LucideIcon; tone: string }> = {
  morning: {
    title: t('Morning briefing'),
    hint: t('Tasks for the day and your saving target'),
    icon: Sunrise,
    tone: 'bg-warning/15 text-warning',
  },
  savings: {
    title: t('Savings reminder'),
    hint: t('A nudge if you have not hit today’s target'),
    icon: PiggyBank,
    tone: 'bg-primary/15 text-primary',
  },
  evening: {
    title: t('Evening summary'),
    hint: t('Daily money summary and unfinished tasks'),
    icon: MoonStar,
    tone: 'bg-accent/15 text-accent',
  },
};

/** Grouped section with a small caption, iOS-settings style. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</h2>
      <div className="glass divide-y divide-foreground/[0.06] overflow-hidden rounded-3xl">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  tone = 'bg-foreground/[0.08] text-foreground',
  title,
  hint,
  children,
  stacked,
}: {
  icon?: LucideIcon;
  tone?: string;
  title: string;
  hint?: string;
  children?: ReactNode;
  /** put the control under the text instead of beside it */
  stacked?: boolean;
}) {
  return (
    <div className={cn('flex gap-3 px-4 py-3.5', stacked ? 'flex-col' : 'items-center')}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight">{title}</p>
          {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children && <div className={cn(stacked ? 'w-full' : 'shrink-0')}>{children}</div>}
    </div>
  );
}

const THEMES: Array<{ id: SettingsT['theme']; label: string; icon: LucideIcon; bg: string; fg: string }> = [
  { id: 'dark', label: t('Dark'), icon: MoonStar, bg: 'bg-[#0b1020]', fg: 'bg-white/15' },
  { id: 'light', label: t('Light'), icon: Sun, bg: 'bg-[#f3f6fb]', fg: 'bg-slate-300' },
  { id: 'system', label: t('Telegram'), icon: Smartphone, bg: 'bg-gradient-to-br from-[#0b1020] to-[#f3f6fb]', fg: 'bg-slate-400/60' },
];

const BAKONG_FIELDS = [
  'bakong_account_type',
  'bakong_account_id',
  'bakong_merchant_name',
  'bakong_merchant_city',
  'bakong_phone',
  'bakong_merchant_id',
  'bakong_acquiring_bank',
  'bakong_store_label',
] as const;

/** Receiving Bakong account: everything KHQR needs to build a payment QR. */
function BakongSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsT;
  onSave: (p: Partial<SettingsT>) => Promise<void>;
  saving: boolean;
}) {
  const fromSettings = () =>
    Object.fromEntries(BAKONG_FIELDS.map((k) => [k, settings[k] ?? ''])) as Record<string, string>;
  const [f, setF] = useState(fromSettings);
  useEffect(() => {
    setF(fromSettings());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  const merchant = f.bakong_account_type === 'merchant';
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const missing = [
    !f.bakong_account_id && t('Bakong account ID'),
    !f.bakong_merchant_name && t('Account name'),
    !f.bakong_merchant_city && t('City'),
    merchant && !f.bakong_merchant_id && t('Merchant ID'),
    merchant && !f.bakong_acquiring_bank && t('Acquiring bank'),
  ].filter(Boolean);
  const dirty = BAKONG_FIELDS.some((k) => (f[k] ?? '') !== (settings[k] ?? ''));

  return (
    <Section title={t('Bakong KHQR')}>
      <Row
        icon={QrCode}
        tone="bg-primary/15 text-primary"
        title={t('Receive savings by KHQR')}
        hint={t('Your Bakong account, used to build the payment QR when you add to a goal')}
      />
      <div className="space-y-3 px-4 py-3.5">
        <div className="glass inline-flex rounded-full p-1">
          {(['individual', 'merchant'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setF({ ...f, bakong_account_type: k })}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                f.bakong_account_type === k ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground',
              )}
            >
              {k === 'individual' ? t('Individual') : t('Merchant')}
            </button>
          ))}
        </div>
        <Field label={t('Bakong account ID')} hint={t('Shown in your bank app, like name@bank')}>
          <Input
            value={f.bakong_account_id}
            maxLength={32}
            autoCapitalize="none"
            placeholder="lonhv@aclb"
            onChange={set('bakong_account_id')}
          />
        </Field>
        <Field label={t('Account name')} hint={t('Shown to the payer (max 25 characters)')}>
          <Input value={f.bakong_merchant_name} maxLength={25} onChange={set('bakong_merchant_name')} />
        </Field>
        <Field label={t('City')}>
          <Input value={f.bakong_merchant_city} maxLength={15} onChange={set('bakong_merchant_city')} />
        </Field>
        <Field label={t('Phone (optional)')}>
          <Input
            inputMode="tel"
            value={f.bakong_phone}
            maxLength={25}
            placeholder="85512345678"
            onChange={set('bakong_phone')}
          />
        </Field>
        {merchant && (
          <>
            <Field label={t('Merchant ID')}>
              <Input value={f.bakong_merchant_id} maxLength={32} onChange={set('bakong_merchant_id')} />
            </Field>
            <Field label={t('Acquiring bank')} hint={t('For example: ACLEDA Bank')}>
              <Input value={f.bakong_acquiring_bank} maxLength={32} onChange={set('bakong_acquiring_bank')} />
            </Field>
            <Field label={t('Store label (optional)')}>
              <Input value={f.bakong_store_label} maxLength={25} onChange={set('bakong_store_label')} />
            </Field>
          </>
        )}
        {missing.length > 0 && <p className="text-xs text-warning">{t('Still needed: {0}', missing.join(', '))}</p>}
        <Button
          className="w-full"
          variant={dirty ? 'primary' : 'secondary'}
          disabled={saving || !dirty}
          onClick={() =>
            void onSave({
              bakong_account_type: f.bakong_account_type as SettingsT['bakong_account_type'],
              bakong_account_id: f.bakong_account_id.trim() || null,
              bakong_merchant_name: f.bakong_merchant_name.trim() || null,
              bakong_merchant_city: f.bakong_merchant_city.trim() || 'Phnom Penh',
              bakong_phone: f.bakong_phone.trim() || null,
              bakong_merchant_id: merchant ? f.bakong_merchant_id.trim() || null : null,
              bakong_acquiring_bank: f.bakong_acquiring_bank.trim() || null,
              bakong_store_label: merchant ? f.bakong_store_label.trim() || null : null,
            })
          }
        >
          {t('Save')}
        </Button>
      </div>
    </Section>
  );
}

export default function Settings() {
  const me = useOwner();
  const accounts = useAccounts();
  const [s, setS] = useState<SettingsT>(me.settings);
  const [rate, setRate] = useState(String(me.settings.fx_khr_per_usd));
  const save = useApiMutation((patch: Partial<SettingsT>) => api<SettingsT>('/settings', { method: 'PATCH', body: patch }), {
    refreshMe: true,
  });

  useEffect(() => {
    setS(me.settings);
    setRate(String(me.settings.fx_khr_per_usd));
  }, [me.settings]);

  async function patch(p: Partial<SettingsT>, message = t('Saved')) {
    try {
      await save.mutateAsync(p);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not save'));
      setS(me.settings);
    }
  }

  const tzOptions = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
  const initial = (me.first_name ?? 'O').charAt(0).toUpperCase();
  const rateChanged = Number(rate) > 0 && Number(rate) !== s.fx_khr_per_usd;

  return (
    <div className="stagger space-y-5">
      <header className="pb-1 pt-5">
        <p className="text-xs font-semibold text-muted-foreground">{t('Make it yours')}</p>
        <h1 className="text-[1.7rem] font-extrabold tracking-tightest">{t('Settings')}</h1>
      </header>

      {/* profile */}
      <section className="hero relative overflow-hidden rounded-4xl p-5 text-white">
        <div className="relative z-10 flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/20 text-2xl font-extrabold backdrop-blur-sm">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-extrabold tracking-tight">{me.first_name ?? t('Owner')}</p>
            <p className="truncate text-sm text-white/75">{me.username ? `@${me.username}` : t('Telegram account')}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold">
              <ShieldCheck className="h-3.5 w-3.5" /> {t('Verified owner · ID {0}', me.telegram_id)}
            </span>
          </div>
        </div>
      </section>

      {/* money */}
      <Section title={t('Money')}>
        <Row icon={Coins} tone="bg-primary/15 text-primary" title={t('Currency')} hint={t('For totals and reports')}>
          <div className="glass inline-flex rounded-full p-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  const secondary = CURRENCIES.find((x) => x !== c) as Currency;
                  setS({ ...s, preferred_currency: c, secondary_currency: secondary });
                  void patch({ preferred_currency: c, secondary_currency: secondary });
                }}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                  s.preferred_currency === c ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Row>
        <Row
          icon={Landmark}
          tone="bg-info/15 text-info"
          title={t('Exchange rate')}
          hint={t('KHR per 1 USD. Past transactions keep the rate they were recorded with.')}
          stacked
        >
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
              aria-label={t('Exchange rate')}
            />
            <Button
              variant={rateChanged ? 'primary' : 'secondary'}
              disabled={save.isPending || !rateChanged}
              onClick={() => void patch({ fx_khr_per_usd: Number(rate) }, t('Exchange rate updated'))}
            >
              {t('Save')}
            </Button>
          </div>
        </Row>
        <Row icon={Target} tone="bg-accent/15 text-accent" title={t('Default account')} hint={t('Used by forms and quick entry from the bot')} stacked>
          <Select
            value={s.default_account_id ?? ''}
            aria-label={t('Default account')}
            onChange={(e) => {
              const v = e.target.value || null;
              setS({ ...s, default_account_id: v });
              void patch({ default_account_id: v });
            }}
          >
            <option value="">{t('None')}</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      <BakongSection settings={s} saving={save.isPending} onSave={(p) => patch(p, t('Bakong account saved'))} />

      {/* appearance */}
      <section className="space-y-2">
        <h2 className="px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('Appearance')}</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {THEMES.map((th) => {
            const active = s.theme === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => {
                  setS({ ...s, theme: th.id });
                  applyTheme(th.id);
                  void patch({ theme: th.id }, t('Theme updated'));
                }}
                className={cn(
                  'glass pressable relative rounded-3xl p-2.5 text-center transition-all',
                  active && 'ring-2 ring-primary',
                )}
              >
                <span className={cn('flex h-16 flex-col justify-end gap-1 rounded-2xl p-2', th.bg)}>
                  <i className={cn('h-1.5 w-8 rounded-full', th.fg)} />
                  <i className={cn('h-1.5 w-5 rounded-full', th.fg)} />
                </span>
                <span className="mt-2 flex items-center justify-center gap-1 text-xs font-bold">
                  <th.icon className="h-3.5 w-3.5" /> {th.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* language */}
      <Section title={t('Language')}>
        <Row icon={Globe2} tone="bg-primary/15 text-primary" title={t('Language')} hint={t('Choose the language of the app')}>
          <div className="glass inline-flex rounded-full p-1">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                  lang === l.id ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* time */}
      <Section title={t('Region')}>
        <Row icon={Globe2} tone="bg-info/15 text-info" title={t('Timezone')} hint={t('Daily totals, budgets and reminders follow this')} stacked>
          <Select
            value={s.timezone}
            aria-label={t('Timezone')}
            onChange={(e) => {
              setS({ ...s, timezone: e.target.value });
              void patch({ timezone: e.target.value }, 'Timezone updated');
            }}
          >
            {tzOptions.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      {/* notifications */}
      <Section title={t('Notifications')}>
        {s.notifications.map((n) => {
          const meta = NOTIFS[n.kind];
          return (
            <div key={n.kind} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', meta.tone)}>
                  <meta.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight">{meta.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{meta.hint}</p>
                </div>
                <Switch
                  label={t('{0} enabled', meta.title)}
                  checked={n.enabled}
                  onCheckedChange={(enabled) => {
                    const next = { ...n, enabled };
                    setS({ ...s, notifications: s.notifications.map((x) => (x.kind === n.kind ? next : x)) });
                    void patch({ notifications: [next] });
                  }}
                />
              </div>
              {n.enabled && (
                <div className="tab-pane mt-3 flex items-center gap-2 pl-12">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={n.local_time}
                    className="h-10 w-40"
                    aria-label={t('{0} time', meta.title)}
                    onChange={(e) =>
                      setS({
                        ...s,
                        notifications: s.notifications.map((x) => (x.kind === n.kind ? { ...x, local_time: e.target.value } : x)),
                      })
                    }
                    onBlur={() => {
                      const cur = s.notifications.find((x) => x.kind === n.kind);
                      const orig = me.settings.notifications.find((x) => x.kind === n.kind);
                      if (cur && cur.local_time && cur.local_time !== orig?.local_time) {
                        void patch({ notifications: [cur] }, 'Reminder time saved');
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{t('every day')}</span>
                </div>
              )}
            </div>
          );
        })}
        <Row icon={CalendarCheck} tone="bg-danger/15 text-danger" title={t('Task reminders')} hint={t('At each task’s reminder time')}>
          <Switch
            label={t('Task reminders')}
            checked={s.task_reminders_enabled}
            onCheckedChange={(v) => {
              setS({ ...s, task_reminders_enabled: v });
              void patch({ task_reminders_enabled: v });
            }}
          />
        </Row>
        <Row icon={Bell} tone="bg-warning/15 text-warning" title={t('Budget alerts')} hint={t('When a budget hits its warning level or is exceeded')}>
          <Switch
            label={t('Budget alerts')}
            checked={s.budget_alerts_enabled}
            onCheckedChange={(v) => {
              setS({ ...s, budget_alerts_enabled: v });
              void patch({ budget_alerts_enabled: v });
            }}
          />
        </Row>
      </Section>

      {/* data */}
      <Section title={t('Data')}>
        <Row icon={Download} tone="bg-primary/15 text-primary" title={t('Export transactions')} hint={t('All your transactions as a CSV file')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              download('/reports/export', {}, 'life-assistant-transactions.csv').then(
                () => toast.success(t('CSV exported')),
                () => toast.error(t('Export failed')),
              )
            }
          >
            {t('Export')}
          </Button>
        </Row>
      </Section>

      {/* security */}
      <Section title={t('Security')}>
        <Row icon={ShieldCheck} tone="bg-primary/15 text-primary" title={t('Private to you')} hint={t('Only Telegram ID {0} can sign in.', me.telegram_id)} />
        <Row icon={KeyRound} tone="bg-accent/15 text-accent" title={t('No passwords')} hint={t('Each session is verified with Telegram’s signature.')} />
        <Row icon={Palette} tone="bg-info/15 text-info" title={t('Your own database')} hint={t('Data lives in your Supabase project and is only reachable through the API.')} />
      </Section>

      <p className="pb-2 text-center text-[11px] text-muted-foreground">{t('Personal Life Assistant · built for one')}</p>
    </div>
  );
}
