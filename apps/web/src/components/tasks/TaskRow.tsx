import { Bell, Check, Repeat } from 'lucide-react';
import type { TaskItem } from '@pla/shared';
import { Badge } from '@/components/ui/card';
import { cn, titleCase } from '@/lib/utils';
import { prettyDate } from '@/lib/dates';
import { useOwner } from '@/contexts/AuthContext';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { haptic } from '@/lib/telegram';
import { toast } from 'sonner';
import { t } from '@/i18n';

const PRIORITY_TONE = { urgent: 'danger', high: 'warning', medium: 'info', low: 'muted' } as const;

export function useToggleTask() {
  return useApiMutation((t: TaskItem) =>
    api(`/tasks/${t.task_id}`, {
      method: 'PATCH',
      body: { completed: t.status !== 'done', occurrence_date: t.date },
    }),
  );
}

export function TaskRow({
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
  const done = task.status === 'done';
  return (
    <div className="flex items-start gap-3 rounded-2xl py-2.5">
      <button
        type="button"
        aria-label={done ? t('Reopen task') : t('Complete task')}
        disabled={toggle.isPending}
        onClick={() =>
          toggle.mutate(task, {
            onSuccess: () => {
              haptic('success');
              if (!done) toast.success(t('Task completed'));
            },
            onError: () => toast.error(t('Could not update task')),
          })
        }
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
          done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
        )}
      >
        {done && <Check className="check-pop h-4 w-4" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-sm font-semibold', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {task.overdue && <Badge tone="danger">{t('Overdue')}</Badge>}
          {showDate && !task.overdue && <Badge>{prettyDate(task.date, today)}</Badge>}
          {task.due_time && <Badge>{task.due_time}</Badge>}
          <Badge tone={PRIORITY_TONE[task.priority]}>{titleCase(task.priority)}</Badge>
          <Badge>{titleCase(task.category)}</Badge>
          {task.reminder_time && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Bell className="h-3 w-3" />
              {task.reminder_time}
            </span>
          )}
          {task.recurrence_type !== 'none' && <Repeat className="h-3 w-3 text-muted-foreground" />}
        </span>
      </button>
    </div>
  );
}
