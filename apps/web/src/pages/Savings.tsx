import { useMemo, useState } from 'react';
import { Pencil, PiggyBank, Plus, RotateCcw, Sparkles, Target, Trophy } from 'lucide-react';
import type { SavingsGoal } from '@pla/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardTitle, Skeleton } from '@/components/ui/card';
import { AnimatedMoney } from '@/components/ui/animated-money';
import { Ring } from '@/components/ui/ring';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { GoalCard } from '@/components/savings/GoalCard';
import { useSheets } from '@/contexts/SheetContext';
import { useAccounts, useApiMutation, useContributions, useDashboard, useGoals } from '@/hooks/queries';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/money';
import { shortDate } from '@/lib/dates';
import { t } from '@/i18n';

type View = 'active' | 'completed' | 'archived';

function GoalDetail({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  const { fmt } = useMoney();
  const sheets = useSheets();
  const list = useContributions(goal?.id ?? null);
  const accounts = useAccounts(true);

  // where this goal's money is kept: grouped by the account each contribution came from
  const kept = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of list.data ?? []) {
      if (c.reversed_at) continue;
      const key = c.account_id ?? '';
      m.set(key, (m.get(key) ?? 0) + c.amount_minor);
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return [...m.entries()]
      .map(([id, amount]) => ({
        id,
        amount,
        pct: total ? (amount / total) * 100 : 0,
        name: id ? (accounts.data?.find((a) => a.id === id)?.name ?? t('Account')) : t('Not tracked'),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [list.data, accounts.data]);
  const reverse = useApiMutation((v: { goalId: string; id: string }) =>
    api(`/savings/${v.goalId}/contributions/${v.id}/reverse`, { method: 'POST', body: { reversed: true } }),
  );

  return (
    <Sheet open={!!goal} onOpenChange={(o) => !o && onClose()} title={goal?.name ?? ''} description={t('Progress and contribution history')}>
      {goal && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Ring value={goal.progress_pct} size={104} stroke={11} tone={goal.status === 'completed' ? 'primary' : 'info'}>
              <span className="text-xl font-extrabold tabular-nums">{Math.round(goal.progress_pct)}%</span>
            </Ring>
            <div className="grid flex-1 grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-foreground/[0.06] p-2.5">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{t('Saved')}</p>
                <p className="text-sm font-extrabold tabular-nums">{fmt(goal.saved_minor, goal.currency)}</p>
              </div>
              <div className="rounded-2xl bg-foreground/[0.06] p-2.5">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{t('Left')}</p>
                <p className="text-sm font-extrabold tabular-nums">{fmt(goal.remaining_minor, goal.currency)}</p>
              </div>
              <div className="col-span-2 rounded-2xl bg-primary/10 p-2.5">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{t('Save per day')}</p>
                <p className="text-base font-extrabold tabular-nums text-primary">
                  {fmt(goal.daily_requirement_minor, goal.currency)}
                </p>
              </div>
            </div>
          </div>

          {kept.length > 0 && (
            <div className="rounded-2xl bg-foreground/[0.05] p-3.5">
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('Where it\'s kept')}</h4>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                {kept.map((k, idx) => (
                  <div
                    key={k.id || 'none'}
                    className={['bg-primary', 'bg-info', 'bg-accent', 'bg-warning'][idx % 4]}
                    style={{ width: `${k.pct}%` }}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-2">
                {kept.map((k, idx) => (
                  <li key={k.id || 'none'} className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${['bg-primary', 'bg-info', 'bg-accent', 'bg-warning'][idx % 4]}`} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{k.name}</span>
                    <span className="text-xs text-muted-foreground">{Math.round(k.pct)}%</span>
                    <span className="w-24 text-right font-bold tabular-nums">{fmt(k.amount, goal.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            {goal.status === 'active' && (
              <Button
                className="flex-1"
                onClick={() => {
                  onClose();
                  sheets.open({ kind: 'contribution', goal });
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.6} /> {t('Add savings')}
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                onClose();
                sheets.open({ kind: 'goal', goal });
              }}
            >
              <Pencil className="h-4 w-4" /> {t('Edit goal')}
            </Button>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('History')}</h4>
            {list.isLoading && <Skeleton className="h-14 rounded-2xl" />}
            {list.data?.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">{t('No contributions yet.')}</p>}
            <ul className="stagger space-y-2">
              {list.data?.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.05] px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <PiggyBank className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold tabular-nums ${c.reversed_at ? 'text-muted-foreground line-through' : ''}`}>
                      +{fmt(c.amount_minor, goal.currency)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shortDate(c.contributed_on)}
                      {c.note ? ` · ${c.note}` : ''}
                      {c.account_id ? ` · ${accounts.data?.find((a) => a.id === c.account_id)?.name ?? 'account'}` : ''}
                    </p>
                  </div>
                  {c.reversed_at ? (
                    <Badge>{t('Reversed')}</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={reverse.isPending}
                      onClick={() => {
                        if (!window.confirm(t('Reverse this contribution? Money returns to the account it came from.'))) return;
                        reverse.mutate(
                          { goalId: goal.id, id: c.id },
                          { onSuccess: () => toast.success(t('Contribution reversed')), onError: () => toast.error(t('Could not reverse')) },
                        );
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function Savings() {
  const { fmt, cur } = useMoney();
  const sheets = useSheets();
  const [view, setView] = useState<View>('active');
  const [detailId, setDetailId] = useState<string | null>(null);
  const goalsQ = useGoals(true);
  const d = useDashboard().data;

  const all = useMemo(() => goalsQ.data ?? [], [goalsQ.data]);
  const by = useMemo(
    () => ({
      active: all.filter((g) => g.status === 'active'),
      completed: all.filter((g) => g.status === 'completed'),
      archived: all.filter((g) => g.status === 'archived'),
    }),
    [all],
  );
  const shown = by[view];
  const detail = all.find((g) => g.id === detailId) ?? null;
  const todayPct = d && d.saving_target_today_minor > 0 ? (d.saved_today_minor / d.saving_target_today_minor) * 100 : 0;
  const avg = by.active.length ? Math.round(by.active.reduce((s, g) => s + g.progress_pct, 0) / by.active.length) : 0;

  return (
    <div className="stagger space-y-4">
      <header className="flex items-end justify-between pb-1 pt-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t('Small daily amounts, big goals')}</p>
          <h1 className="text-[1.7rem] font-extrabold tracking-tightest">{t('Savings')}</h1>
        </div>
        <Button size="icon" aria-label={t('New goal')} className="shadow-glow" onClick={() => sheets.open({ kind: 'goal' })}>
          <Plus className="h-5 w-5" strokeWidth={2.6} />
        </Button>
      </header>

      {/* hero */}
      {d ? (
        <section className="hero relative overflow-hidden rounded-4xl p-5 text-white">
          <div className="relative z-10 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/75">{t('Total saved')}</p>
              <p className="mt-1 text-[2.3rem] font-extrabold leading-none tracking-tightest tabular-nums">
                <AnimatedMoney minor={d.total_savings_minor} currency={cur} />
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="whitespace-nowrap rounded-full bg-black/25 px-2.5 py-1">{t('{0} active', by.active.length)}</span>
                <span className="whitespace-nowrap rounded-full bg-black/25 px-2.5 py-1">{t('{0} done', by.completed.length)}</span>
                <span className="whitespace-nowrap rounded-full bg-black/25 px-2.5 py-1">{t('{0}% avg', avg)}</span>
              </div>
            </div>
            <Ring value={todayPct} size={92} stroke={10} tone="primary" className="[&_circle:first-child]:stroke-white/25">
              <span className="text-lg font-extrabold tabular-nums">{Math.round(Math.min(todayPct, 999))}%</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-white/70">{t('today')}</span>
            </Ring>
          </div>
          <div className="relative z-10 mt-4 flex items-center justify-between rounded-2xl bg-black/20 px-3.5 py-2.5 backdrop-blur-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">{t('Today\'s target')}</p>
              <p className="text-sm font-extrabold tabular-nums">
                {fmt(d.saved_today_minor)} <span className="font-medium text-white/65">/ {fmt(d.saving_target_today_minor)}</span>
              </p>
            </div>
            <Button
              size="sm"
              className="bg-white text-cyan-950 shadow-none hover:bg-white/90"
              disabled={by.active.length === 0}
              onClick={() => sheets.open({ kind: 'contribution' })}
            >
              <PiggyBank className="h-4 w-4" /> {t('Add savings')}
            </Button>
          </div>
        </section>
      ) : (
        <Skeleton className="h-48 rounded-4xl" />
      )}

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'active', label: by.active.length ? t('Active · {0}', by.active.length) : t('Active') },
          { value: 'completed', label: by.completed.length ? t('Done · {0}', by.completed.length) : t('Done') },
          { value: 'archived', label: t('Archived') },
        ]}
      />

      {goalsQ.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
        </div>
      )}

      {!goalsQ.isLoading && shown.length === 0 && (
        <Card key={view} className="tab-pane flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/15 text-primary">
            {view === 'completed' ? <Trophy className="h-7 w-7" /> : view === 'archived' ? <Sparkles className="h-7 w-7" /> : <Target className="h-7 w-7" />}
          </span>
          <CardTitle>{view === 'active' ? t('No active goals') : view === 'completed' ? t('No finished goals yet') : t('Nothing archived')}</CardTitle>
          <p className="max-w-[17rem] text-sm text-muted-foreground">
            {view === 'active'
              ? t('Pick a target, e.g. a {0} laptop in 100 days. We\'ll work out exactly what to save each day.', fmt(60000, cur))
              : view === 'completed'
                ? t('Reach a goal and it will show up here with a trophy.')
                : t('Archive goals you want to hide without losing their history.')}
          </p>
          {view === 'active' && (
            <Button className="mt-2" onClick={() => sheets.open({ kind: 'goal' })}>
              <Plus className="h-4 w-4" strokeWidth={2.6} /> {t('Create goal')}
            </Button>
          )}
        </Card>
      )}

      <div key={view} className="tab-pane stagger space-y-3">
        {shown.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            onOpen={() => setDetailId(g.id)}
            onAdd={g.status === 'active' ? () => sheets.open({ kind: 'contribution', goal: g }) : undefined}
          />
        ))}
      </div>

      <GoalDetail goal={detail} onClose={() => setDetailId(null)} />
    </div>
  );
}
