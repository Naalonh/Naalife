import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
  Repeat,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { addDays, addMonths, TASK_PRIORITIES, type DayMark, type TaskItem, type TaskPriority } from '@pla/shared';
import { DAY_KIND_META } from '@/lib/dayKinds';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, Skeleton } from '@/components/ui/card';
import { Ring } from '@/components/ui/ring';
import { Segmented } from '@/components/ui/segmented';
import { TaskCard, PRIORITY_STYLE } from '@/components/tasks/TaskCard';
import { useOwner } from '@/contexts/AuthContext';
import { useSheets } from '@/contexts/SheetContext';
import { useApiMutation, useDayMarks, useRoutines, useTaskStats, useTasks } from '@/hooks/queries';
import { api } from '@/lib/api';
import {
  eachDay,
  endOfMonth,
  monthLabel,
  prettyDate,
  shortDate,
  startOfMonth,
  startOfWeek,
  weekday,
  WEEKDAY_SHORT,
} from '@/lib/dates';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/telegram';
import { PRIORITY_RANK } from '@/lib/taskSort';
import { t } from '@/i18n';

type Tab = 'plan' | 'upcoming' | 'calendar' | 'routines';

/** The day chosen in Plan / Calendar; new tasks default to it. */
interface DayState {
  selected: string;
  setSelected: (d: string) => void;
}

function sortItems(items: TaskItem[]): TaskItem[] {
  return [...items].sort(
    (a, b) =>
      (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

function groupByDate(items: TaskItem[]) {
  const m = new Map<string, TaskItem[]>();
  for (const t of items) m.set(t.date, [...(m.get(t.date) ?? []), t]);
  return [...m.entries()];
}

function EmptyDay({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-3xl px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/15 text-primary">
        <Sparkles className="h-7 w-7" />
      </span>
      <p className="text-base font-bold">{title}</p>
      <p className="max-w-[16rem] text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Shows the day type of the selected day and lets you change it. */
function DayTypeBar({ date, mark }: { date: string; mark?: DayMark }) {
  const sheets = useSheets();
  const meta = mark ? DAY_KIND_META[mark.kind] : null;
  return (
    <button
      type="button"
      onClick={() => sheets.open({ kind: 'daymark', date, current: mark })}
      className="glass pressable flex w-full items-center gap-3 rounded-3xl px-3.5 py-3 text-left"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl',
          meta ? meta.tone : 'bg-foreground/[0.07] text-muted-foreground',
        )}
      >
        {meta ? meta.emoji : '📅'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{meta ? meta.label : t('Set day type')}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {mark ? mark.note || (meta?.short ?? '') : t('Work, half day, study, day off or holiday')}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/* ---------------------------------------------------------------- Plan */

function WeekStrip({
  selected,
  today,
  onSelect,
  items,
  marks,
}: {
  selected: string;
  today: string;
  onSelect: (d: string) => void;
  items: TaskItem[];
  marks: Map<string, DayMark>;
}) {
  const start = startOfWeek(selected);
  const days = eachDay(start, addDays(start, 6));
  const counts = useMemo(() => {
    const m = new Map<string, { open: number; done: number }>();
    for (const t of items) {
      const c = m.get(t.date) ?? { open: 0, done: 0 };
      if (t.status === 'done') c.done += 1;
      else c.open += 1;
      m.set(t.date, c);
    }
    return m;
  }, [items]);

  return (
    <div className="glass rounded-3xl p-2">
      <div className="mb-1 flex items-center justify-between px-2 pt-1">
        <button
          type="button"
          aria-label={t('Previous week')}
          className="rounded-full p-1.5 text-muted-foreground active:bg-foreground/10"
          onClick={() => onSelect(addDays(selected, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-bold tracking-wide text-muted-foreground">
          {shortDate(days[0])} – {shortDate(days[6])}
        </span>
        <button
          type="button"
          aria-label={t('Next week')}
          className="rounded-full p-1.5 text-muted-foreground active:bg-foreground/10"
          onClick={() => onSelect(addDays(selected, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const c = counts.get(d);
          const isSel = d === selected;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                haptic('light');
                onSelect(d);
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl py-2 transition-all duration-200',
                isSel
                  ? 'bg-gradient-to-b from-primary to-primary/75 text-primary-foreground shadow-glow'
                  : 'text-foreground active:bg-foreground/10',
              )}
            >
              <span className={cn('text-[10px] font-bold uppercase', isSel ? 'opacity-80' : 'text-muted-foreground')}>
                {WEEKDAY_SHORT[weekday(d)].slice(0, 3)}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold',
                  isToday && !isSel && 'ring-2 ring-primary/70',
                )}
              >
                {Number(d.slice(8))}
              </span>
              <span className="flex h-3 items-center gap-0.5 text-[10px] leading-none">
                {marks.get(d) && <span aria-label={DAY_KIND_META[marks.get(d)!.kind].label}>{DAY_KIND_META[marks.get(d)!.kind].emoji}</span>}
                {c && c.open > 0 && (
                  <i className={cn('h-1.5 w-1.5 rounded-full', isSel ? 'bg-primary-foreground' : 'bg-primary')} />
                )}
                {c && c.done > 0 && (
                  <i className={cn('h-1.5 w-1.5 rounded-full', isSel ? 'bg-primary-foreground/50' : 'bg-muted-foreground/60')} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanTab({ selected, setSelected }: DayState) {
  const { today } = useOwner();
  const sheets = useSheets();
  const [filter, setFilter] = useState<TaskPriority | 'all'>('all');
  const [showDone, setShowDone] = useState(false);

  const weekStart = startOfWeek(selected);
  const week = useTasks({ from: weekStart, to: addDays(weekStart, 6), status: 'all' });
  const backlog = useTasks({ to: addDays(today, -1), status: 'open' });
  const stats = useTaskStats();
  const marksQ = useDayMarks(weekStart, addDays(weekStart, 6));
  const markMap = useMemo(() => new Map((marksQ.data ?? []).map((m) => [m.date, m])), [marksQ.data]);
  const skippedQ = useTasks({ from: weekStart, to: addDays(weekStart, 6), status: 'skipped' });
  const skippedDay = (skippedQ.data ?? []).filter((t) => t.date === selected);
  const [showSkipped, setShowSkipped] = useState(false);

  const dayItems = (week.data ?? []).filter((t) => t.date === selected);
  const visible = dayItems.filter((t) => filter === 'all' || t.priority === filter);
  const open = sortItems(visible.filter((t) => t.status === 'open'));
  const done = sortItems(visible.filter((t) => t.status === 'done'));
  const overdue = (backlog.data ?? []).filter((t) => t.overdue);
  const dayDone = dayItems.filter((t) => t.status === 'done').length;
  const pct = dayItems.length ? (dayDone / dayItems.length) * 100 : 0;
  const s = stats.data;
  const isToday = selected === today;

  return (
    <div className="tab-pane stagger space-y-4">
      {/* hero */}
      <Card className="relative overflow-hidden">
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <Ring value={pct} size={96} stroke={10} tone="primary">
            <span className="text-xl font-extrabold tabular-nums">{Math.round(pct)}%</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <CardTitle>{isToday ? t('Today') : prettyDate(selected, today)}</CardTitle>
            <p className="mt-0.5 text-[1.65rem] font-extrabold leading-tight tracking-tight">
              {dayDone}
              <span className="text-lg font-semibold text-muted-foreground"> {t('/ {0} done', dayItems.length)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dayItems.length === 0
                ? t('A clear day')
                : dayDone === dayItems.length
                  ? t('All done, great job! 🎉')
                  : t('{0} left to go', dayItems.length - dayDone)}
            </p>
          </div>
        </div>
        {s && (
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-foreground/[0.05] py-2">
              <p className="text-base font-extrabold tabular-nums">{s.week_done}/{s.week_total}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('This week')}</p>
            </div>
            <div className="rounded-2xl bg-foreground/[0.05] py-2">
              <p className={cn('text-base font-extrabold tabular-nums', s.overdue > 0 && 'text-danger')}>{s.overdue}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('Overdue')}</p>
            </div>
            <div className="rounded-2xl bg-foreground/[0.05] py-2">
              <p className="text-base font-extrabold tabular-nums">{s.completion_rate_pct}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('Rate')}</p>
            </div>
          </div>
        )}
      </Card>

      <WeekStrip selected={selected} today={today} onSelect={setSelected} items={week.data ?? []} marks={markMap} />
      <DayTypeBar date={selected} mark={markMap.get(selected)} />

      {/* priority filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(['all', ...[...TASK_PRIORITIES].reverse()] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
              filter === p
                ? 'bg-foreground text-background shadow-soft'
                : 'bg-foreground/[0.07] text-muted-foreground',
            )}
          >
            {p === 'all' ? t('All') : PRIORITY_STYLE[p].label}
          </button>
        ))}
      </div>

      {/* overdue backlog */}
      {isToday && overdue.length > 0 && filter === 'all' && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-danger">{t('Overdue · {0}', overdue.length)}</h3>
          <div className="stagger space-y-2">
            {overdue.map((t) => (
              <TaskCard key={t.occurrence_id} task={t} showDate onEdit={() => sheets.open({ kind: 'task', task: t })} />
            ))}
          </div>
        </section>
      )}

      {/* open tasks */}
      {week.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-3xl" />
          <Skeleton className="h-20 rounded-3xl" />
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <EmptyDay
          title={dayItems.length ? t('Nothing matches this filter') : isToday ? t('Nothing planned today') : t('A free day')}
          hint={t('Tap + to add a task or set a reminder.')}
        />
      ) : (
        <div className="stagger space-y-2">
          {open.map((t) => (
            <TaskCard key={t.occurrence_id} task={t} onEdit={() => sheets.open({ kind: 'task', task: t })} />
          ))}
          {open.length === 0 && done.length > 0 && (
            <div className="glass flex items-center gap-3 rounded-3xl p-4">
              <Trophy className="h-6 w-6 text-warning" />
              <p className="text-sm font-bold">{t('Everything done for this day!')}</p>
            </div>
          )}
        </div>
      )}

      {/* skipped (e.g. cancelled class) */}
      {skippedDay.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="flex w-full items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <CircleSlash className="h-4 w-4" /> {t('Skipped · {0}', skippedDay.length)}
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showSkipped && 'rotate-180')} />
          </button>
          {showSkipped && (
            <div className="stagger space-y-2">
              {skippedDay.map((t) => (
                <TaskCard key={t.occurrence_id} task={t} onEdit={() => sheets.open({ kind: 'task', task: t })} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* completed */}
      {done.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" /> {t('Completed · {0}', done.length)}
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showDone && 'rotate-180')} />
          </button>
          {showDone && (
            <div className="stagger space-y-2">
              {done.map((t) => (
                <TaskCard key={t.occurrence_id} task={t} onEdit={() => sheets.open({ kind: 'task', task: t })} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Upcoming */

function UpcomingTab() {
  const { today } = useOwner();
  const sheets = useSheets();
  const tasks = useTasks({ from: addDays(today, 1), to: addDays(today, 14), status: 'open' });
  const groups = useMemo(() => groupByDate(tasks.data ?? []), [tasks.data]);

  if (tasks.isLoading) return <Skeleton className="h-40 rounded-3xl" />;
  if (!groups.length) return <EmptyDay title={t('Nothing coming up')} hint={t('The next two weeks are wide open.')} />;
  return (
    <div className="tab-pane stagger space-y-5">
      {groups.map(([date, items]) => (
        <section key={date} className="space-y-2">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-11 w-11 flex-col items-center justify-center rounded-2xl bg-accent/15 leading-none text-accent">
              <span className="text-[9px] font-bold uppercase">{WEEKDAY_SHORT[weekday(date)]}</span>
              <span className="text-base font-extrabold">{Number(date.slice(8))}</span>
            </span>
            <div>
              <p className="text-sm font-bold">{prettyDate(date, today)}</p>
              <p className="text-xs text-muted-foreground">
                {t(items.length > 1 ? '{0} tasks' : '{0} task', items.length)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {sortItems(items).map((t) => (
              <TaskCard key={t.occurrence_id} task={t} onEdit={() => sheets.open({ kind: 'task', task: t })} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Calendar */

function CalendarTab({ selected, setSelected }: DayState) {
  const { today } = useOwner();
  const sheets = useSheets();
  const [cursor, setCursor] = useState(startOfMonth(selected));
  const from = startOfMonth(cursor);
  const tasks = useTasks({ from, to: endOfMonth(cursor), status: 'all' });
  const marksQ = useDayMarks(from, endOfMonth(cursor));
  const markMap = useMemo(() => new Map((marksQ.data ?? []).map((m) => [m.date, m])), [marksQ.data]);

  const byDate = useMemo(() => new Map(groupByDate(tasks.data ?? [])), [tasks.data]);
  const days = eachDay(from, endOfMonth(cursor));
  const lead = (weekday(from) + 6) % 7; // week starts Monday
  const cells: Array<string | null> = [...Array(lead).fill(null), ...days];
  const dayItems = sortItems(byDate.get(selected) ?? []);

  return (
    <div className="tab-pane stagger space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" aria-label={t('Previous month')} onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <p className="text-base font-extrabold">{monthLabel(cursor.slice(0, 7))}</p>
          <Button variant="ghost" size="icon" aria-label={t('Next month')} onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted-foreground">
          {[...WEEKDAY_SHORT.slice(1), WEEKDAY_SHORT[0]].map((d) => (
            <span key={d}>{d.slice(0, 2)}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const items = byDate.get(d) ?? [];
            const open = items.filter((t) => t.status === 'open').length;
            const isSel = d === selected;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setSelected(d);
                  haptic('light');
                }}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-bold transition-all duration-200',
                  isSel
                    ? 'scale-105 bg-gradient-to-b from-primary to-primary/75 text-primary-foreground shadow-glow'
                    : d === today
                      ? 'bg-primary/15 text-primary'
                      : 'active:bg-foreground/10',
                )}
              >
                {Number(d.slice(8))}
                {markMap.get(d) && (
                  <span className="absolute right-1 top-0.5 text-[9px] leading-none">{DAY_KIND_META[markMap.get(d)!.kind].emoji}</span>
                )}
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {open > 0 && <i className={cn('h-1.5 w-1.5 rounded-full', isSel ? 'bg-primary-foreground' : 'bg-primary')} />}
                  {items.length > open && <i className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <DayTypeBar date={selected} mark={markMap.get(selected)} />

      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold">{prettyDate(selected, today)}</h3>
        <Button variant="ghost" size="sm" onClick={() => sheets.open({ kind: 'task', date: selected })}>
          <Plus className="h-4 w-4" /> {t('Add')}
        </Button>
      </div>
      {dayItems.length === 0 ? (
        <EmptyDay title={t('No tasks on this day')} hint={t('Pick another date or add something new.')} />
      ) : (
        <div className="stagger space-y-2">
          {dayItems.map((t) => (
            <TaskCard key={t.occurrence_id} task={t} onEdit={() => sheets.open({ kind: 'task', task: t })} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Routines */

function RoutinesTab() {
  const sheets = useSheets();
  const { today } = useOwner();
  const q = useRoutines();
  const toggle = useApiMutation((v: { id: string; completed: boolean }) =>
    api(`/routines/${v.id}/complete`, { method: 'POST', body: { completed: v.completed } }),
  );
  const archive = useApiMutation((id: string) => api(`/routines/${id}`, { method: 'PATCH', body: { active: false } }));
  const routines = (q.data ?? []).filter((r) => r.active);
  const doneToday = routines.filter((r) => r.completed_today).length;
  const dayIndex = (weekday(today) + 6) % 7;
  const possible = routines.length * (dayIndex + 1);
  const weekDone = routines.reduce((s, r) => s + r.week.slice(0, dayIndex + 1).filter(Boolean).length, 0);
  const best = routines.reduce((m, r) => Math.max(m, r.streak), 0);
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="tab-pane stagger space-y-4">
      <Card className="relative overflow-hidden">
        <div className="absolute -left-8 -top-10 h-36 w-36 rounded-full bg-warning/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <Ring value={routines.length ? (doneToday / routines.length) * 100 : 0} size={88} tone="warning">
            <span className="text-lg font-extrabold tabular-nums">
              {doneToday}/{routines.length}
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <CardTitle>{t('Daily checklist')}</CardTitle>
            <p className="mt-0.5 flex items-center gap-1.5 text-lg font-extrabold">
              <Flame className="h-5 w-5 text-warning" /> {t('{0}-day best streak', best)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('Week: {0}/{1} check-ins ({2}%)', weekDone, possible, possible ? Math.round((weekDone / possible) * 100) : 0)}
            </p>
          </div>
        </div>
      </Card>

      {q.isLoading && <Skeleton className="h-32 rounded-3xl" />}
      {!q.isLoading && routines.length === 0 && (
        <EmptyDay title={t('Build a daily routine')} hint={t('Wake up early, study English, exercise, plan tomorrow…')} />
      )}

      <div className="stagger space-y-2">
        {routines.map((r) => (
          <div key={r.id} className="glass flex items-center gap-3 rounded-3xl p-3.5">
            <button
              type="button"
              aria-label={r.completed_today ? t('Mark not done') : t('Mark done')}
              onClick={() => {
                haptic('light');
                toggle.mutate({ id: r.id, completed: !r.completed_today });
              }}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-200',
                r.completed_today
                  ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                  : 'border-foreground/20',
              )}
            >
              {r.completed_today ? <CheckCircle2 className="check-pop h-6 w-6" /> : <Repeat className="h-5 w-5 text-muted-foreground" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-[15px] font-bold', r.completed_today && 'text-muted-foreground')}>{r.title}</p>
              <div className="mt-1.5 flex gap-1">
                {r.week.map((on, i) => (
                  <span
                    key={i}
                    className={cn(
                      'flex h-5 flex-1 items-center justify-center rounded-md text-[9px] font-bold',
                      on ? 'bg-primary/80 text-primary-foreground' : 'bg-foreground/[0.07] text-muted-foreground',
                      i === dayIndex && !on && 'ring-1 ring-primary/50',
                    )}
                  >
                    {letters[i]}
                  </span>
                ))}
              </div>
            </div>
            <span className="flex shrink-0 flex-col items-center text-warning">
              <Flame className="h-5 w-5" />
              <span className="text-xs font-extrabold tabular-nums">{r.streak}</span>
            </span>
            <button
              type="button"
              aria-label={t('Remove routine')}
              className="px-1 text-xs text-muted-foreground"
              onClick={() => window.confirm(t('Remove "{0}"?', r.title)) && archive.mutate(r.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <Button variant="secondary" className="w-full" onClick={() => sheets.open({ kind: 'routine' })}>
        <Plus className="h-4 w-4" /> {t('New routine')}
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- Page */

export default function Tasks() {
  const sheets = useSheets();
  const { today } = useOwner();
  const [tab, setTab] = useState<Tab>('plan');
  const [selected, setSelected] = useState(today);
  const usesDay = tab === 'plan' || tab === 'calendar';
  return (
    <div className="stagger space-y-4">
      <header className="flex items-end justify-between pb-1 pt-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> {t('Plan your day')}
          </p>
          <h1 className="text-[1.7rem] font-extrabold tracking-tightest">{t('Tasks')}</h1>
        </div>
        <Button size="icon" aria-label={t('Add task')} className="shadow-glow" onClick={() => sheets.open({ kind: 'task', date: usesDay ? selected : undefined })}>
          <Plus className="h-5 w-5" strokeWidth={2.6} />
        </Button>
      </header>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: t('Plan') },
          { value: 'upcoming', label: t('Upcoming') },
          { value: 'calendar', label: t('Calendar') },
          { value: 'routines', label: t('Routines') },
        ]}
      />
      {tab === 'plan' && <PlanTab selected={selected} setSelected={setSelected} />}
      {tab === 'upcoming' && <UpcomingTab />}
      {tab === 'calendar' && <CalendarTab selected={selected} setSelected={setSelected} />}
      {tab === 'routines' && <RoutinesTab />}
    </div>
  );
}

