import {
  Bell,
  Briefcase,
  Check,
  Clock,
  GraduationCap,
  HeartPulse,
  CircleSlash,
  Repeat,
  RotateCcw,
  Sparkles,
  Store,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { TaskCategory, TaskItem, TaskPriority } from '@pla/shared';
import { useOwner } from '@/contexts/AuthContext';
import { haptic } from '@/lib/telegram';
import { prettyDate } from '@/lib/dates';
import { cn, titleCase } from '@/lib/utils';
import { useToggleTask } from './TaskRow';
import { t } from '@/i18n';

export const CATEGORY_ICON: Record<TaskCategory, LucideIcon> = {
  personal: User,
  study: GraduationCap,
  work: Briefcase,
  business: Store,
  finance: Wallet,
  health: HeartPulse,
  other: Sparkles,
};

export const PRIORITY_STYLE: Record<TaskPriority, { bar: string; chip: string; label: string }> = {
  urgent: { bar: 'bg-danger', chip: 'bg-danger/15 text-danger', label: t('Urgent') },
  high: { bar: 'bg-warning', chip: 'bg-warning/15 text-warning', label: t('High') },
  medium: { bar: 'bg-info', chip: 'bg-info/15 text-info', label: t('Medium') },
  low: { bar: 'bg-muted-foreground/50', chip: 'bg-foreground/[0.07] text-muted-foreground', label: t('Low') },
};

function useSkipTask() {
  return useApiMutation((v: { task: TaskItem; skipped: boolean }) =>
    api(`/tasks/${v.task.task_id}`, {
      method: 'PATCH',
      body: { skipped: v.skipped, occurrence_date: v.task.date },
    }),
  );
}

/** Modern task card: priority accent bar, big tap-target check, meta chips. */
export function TaskCard({
  task,
  onEdit,
  showDate,
}: {
  task: TaskItem;
  onEdit?: () => void;
  showDate?: boolean;
}) {
  const { today } = useOwner();
  const toggle = useToggleTask();
  const skip = useSkipTask();
  const done = task.status === 'done';
  const skipped = task.status === 'skipped';
  const canSkip = task.recurrence_type !== 'none' && task.status === 'open';

  function skipThisDay() {
    skip.mutate(
      { task, skipped: true },
      {
        onSuccess: () =>
          toast(t('Skipped for this day'), {
            action: { label: t('Undo'), onClick: () => skip.mutate({ task, skipped: false }) },
          }),
        onError: () => toast.error(t('Could not skip')),
      },
    );
  }
  const Icon = CATEGORY_ICON[task.category];
  const p = PRIORITY_STYLE[task.priority];

  return (
    <div
      className={cn(
        'glass pressable relative flex items-stretch gap-3 overflow-hidden rounded-3xl py-3 pl-5 pr-3 transition-opacity',
        (done || skipped) && 'opacity-60',
      )}
    >
      <span className={cn('absolute inset-y-3 left-2 w-1 rounded-full', done ? 'bg-primary/60' : p.bar)} aria-hidden />

      {skipped ? (
        <button
          type="button"
          aria-label={t('Restore this day')}
          disabled={skip.isPending}
          onClick={() => skip.mutate({ task, skipped: false }, { onSuccess: () => toast.success(t('Restored')) })}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-foreground/25 text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : (
      <button
        type="button"
        aria-label={done ? t('Reopen task') : t('Complete task')}
        disabled={toggle.isPending}
        onClick={() =>
          toggle.mutate(task, {
            onSuccess: () => {
              haptic('success');
              if (!done) toast.success(t('Task completed 🎉'));
            },
            onError: () => toast.error(t('Could not update task')),
          })
        }
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
          done
            ? 'border-primary bg-primary text-primary-foreground shadow-glow'
            : 'border-foreground/25 hover:border-primary',
        )}
      >
        {done && <Check className="check-pop h-4 w-4" strokeWidth={3.2} />}
      </button>
      )}

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className={cn('block text-[15px] font-bold leading-snug', (done || skipped) && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        {task.description ? (
          <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{task.description}</span>
        ) : null}
        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          {skipped && <span className="rounded-full bg-foreground/[0.1] px-2 py-0.5 text-muted-foreground">{t('Skipped')}</span>}
          {task.overdue && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">{t('Overdue')}</span>}
          {showDate && !task.overdue && (
            <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">
              {prettyDate(task.date, today)}
            </span>
          )}
          {task.due_time && (
            <span className="flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.due_time}
            </span>
          )}
          <span className={cn('rounded-full px-2 py-0.5', p.chip)}>{p.label}</span>
          <span className="flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">
            <Icon className="h-3 w-3" />
            {titleCase(task.category)}
          </span>
          {task.reminder_time && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Bell className="h-3 w-3" />
              {task.reminder_time}
            </span>
          )}
          {task.recurrence_type !== 'none' && <Repeat className="h-3 w-3 text-muted-foreground" />}
        </span>
      </button>

      {canSkip && (
        <button
          type="button"
          aria-label={t('Skip this day (e.g. no class)')}
          title={t('Skip this day')}
          disabled={skip.isPending}
          onClick={skipThisDay}
          className="self-start rounded-full p-2 text-muted-foreground active:bg-foreground/10"
        >
          <CircleSlash className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
