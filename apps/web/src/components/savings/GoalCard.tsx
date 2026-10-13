import { CalendarClock, CheckCircle2, Flag, Plus, QrCode, Trophy } from 'lucide-react';
import { scheduleStatus, type SavingsGoal } from '@pla/shared';
import { useOwner } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Ring } from '@/components/ui/ring';
import { useMoney } from '@/lib/money';
import { shortDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

const TONES = ['primary', 'info', 'accent', 'warning'] as const;
type Tone = (typeof TONES)[number];

/** Stable accent per goal so each card keeps its colour between renders. */
export function goalTone(id: string): Tone {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  info: 'text-info',
  accent: 'text-accent',
  warning: 'text-warning',
};
const TONE_BG: Record<Tone, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  accent: 'bg-accent',
  warning: 'bg-warning',
};
const TONE_GLOW: Record<Tone, string> = {
  primary: 'bg-primary/25',
  info: 'bg-info/25',
  accent: 'bg-accent/25',
  warning: 'bg-warning/25',
};

export function GoalCard({
  goal,
  onAdd,
  onOpen,
  onQr,
}: {
  goal: SavingsGoal;
  onAdd?: () => void;
  onOpen?: () => void;
  /** show the KHQR for today's amount; omitted when Bakong isn't set up */
  onQr?: () => void;
}) {
  const { fmt } = useMoney();
  const { today } = useOwner();
  const sched = scheduleStatus(goal.target_minor, goal.saved_minor, goal.start_date, goal.target_date, today);
  const done = goal.status === 'completed';
  const archived = goal.status === 'archived';
  const tone: Tone = done ? 'primary' : goalTone(goal.id);
  const milestones = [25, 50, 75];

  return (
    <div className={cn('glass pressable relative overflow-hidden rounded-3xl p-4', archived && 'opacity-60')}>
      <span className={cn('absolute -right-8 -top-10 h-32 w-32 rounded-full blur-3xl', TONE_GLOW[tone])} aria-hidden />

      <button type="button" className="relative flex w-full items-center gap-4 text-left" onClick={onOpen}>
        <Ring value={goal.progress_pct} size={84} stroke={9} tone={goal.overdue ? 'warning' : tone}>
          {done ? (
            <Trophy className="h-7 w-7 text-primary" />
          ) : (
            <span className="text-base font-extrabold tabular-nums">{Math.round(goal.progress_pct)}%</span>
          )}
        </Ring>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold leading-tight tracking-tight">{goal.name}</p>
          <p className="mt-1 text-sm tabular-nums">
            <span className="font-bold">{fmt(goal.saved_minor, goal.currency)}</span>
            <span className="text-muted-foreground"> {t('of {0}', fmt(goal.target_minor, goal.currency))}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            {done ? (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                <CheckCircle2 className="h-3 w-3" /> {t('Completed')}
              </span>
            ) : archived ? (
              <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">{t('Archived')}</span>
            ) : (
              <>
                <span className="flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  {goal.overdue ? t('Past due') : t('{0}d left', goal.days_remaining)} · {shortDate(goal.target_date)}
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      {/* milestone bar */}
      {!archived && (
        <div className="relative mt-4">
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div
              className={cn('h-full rounded-full transition-all duration-700', TONE_BG[tone])}
              style={{ width: `${Math.min(100, goal.progress_pct)}%` }}
            />
            {milestones.map((m) => (
              <span key={m} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${m}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>{t('Start')}</span>
            <span className="flex items-center gap-1">
              <Flag className="h-3 w-3" /> {t('Goal')}
            </span>
          </div>
        </div>
      )}

      {goal.status === 'active' && (
        <div className="relative mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1 rounded-2xl bg-foreground/[0.05] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('Save daily')}</p>
            <p className={cn('text-base font-extrabold tabular-nums', TONE_TEXT[tone])}>
              {fmt(goal.daily_requirement_minor, goal.currency)}
            </p>
            {sched.state === 'behind' && (
              <p className="text-[11px] font-bold text-warning">
                {t('Behind by {0} · catch-up included', fmt(-sched.diff_minor, goal.currency))}
              </p>
            )}
            {sched.state === 'ahead' && (
              <p className="text-[11px] font-bold text-primary">{t('Ahead by {0}', fmt(sched.diff_minor, goal.currency))}</p>
            )}
            {sched.state === 'on_track' && <p className="text-[11px] font-bold text-muted-foreground">{t('On track')}</p>}
          </div>
          {onQr && goal.daily_requirement_minor > 0 && (
            <Button size="md" variant="secondary" className="shrink-0" onClick={onQr} aria-label={t('Show KHQR')}>
              <QrCode className="h-4 w-4" />
            </Button>
          )}
          {onAdd && (
            <Button size="md" className="shrink-0" onClick={onAdd}>
              <Plus className="h-4 w-4" strokeWidth={2.6} /> {t('Add')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
