import { useState } from 'react';
import {
  RECURRENCE_TYPES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type RecurrenceType,
  type TaskCategory,
  type TaskItem,
  type TaskPriority,
} from '@pla/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useOwner } from '@/contexts/AuthContext';
import { useApiMutation } from '@/hooks/queries';
import { api } from '@/lib/api';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { cn, titleCase } from '@/lib/utils';
import { useSubmit } from './useSubmit';
import { t } from '@/i18n';

const RECURRENCE_LABEL: Record<RecurrenceType, string> = {
  none: t('Does not repeat'),
  daily: t('Every day'),
  weekly: t('Weekly on selected days'),
  custom: t('Every N days'),
};

export function TaskForm({ task, defaultDate, onDone }: { task?: TaskItem; defaultDate?: string; onDone: () => void }) {
  const me = useOwner();
  const { busy, errors, run } = useSubmit();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [category, setCategory] = useState<TaskCategory>(task?.category ?? 'personal');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task?.date ?? (defaultDate && defaultDate >= me.today ? defaultDate : me.today));
  const [dueTime, setDueTime] = useState(task?.due_time ?? '');
  const [reminder, setReminder] = useState(task?.reminder_time ?? '');
  const [recType, setRecType] = useState<RecurrenceType>(task?.recurrence_type ?? 'none');
  const [interval, setIntervalN] = useState(task?.recurrence_interval ?? 1);
  const [days, setDays] = useState<number[]>(task?.recurrence_days ?? []);
  const [until, setUntil] = useState(task?.recurrence_until ?? '');

  const save = useApiMutation((v: { id?: string; body: Record<string, unknown> }) =>
    v.id ? api(`/tasks/${v.id}`, { method: 'PATCH', body: v.body }) : api('/tasks', { method: 'POST', body: v.body }),
  );
  const remove = useApiMutation((id: string) => api(`/tasks/${id}`, { method: 'DELETE' }));

  async function submit() {
    const body = {
      title,
      description,
      category,
      priority,
      due_date: dueDate,
      due_time: dueTime || null,
      reminder_time: reminder || null,
      recurrence_type: recType,
      recurrence_interval: interval,
      recurrence_days: recType === 'weekly' ? days : [],
      recurrence_until: recType === 'none' ? null : until || null,
    };
    const r = await run(() => save.mutateAsync({ id: task?.task_id, body }), task ? t('Task updated') : t('Task added'));
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
      <Field label={t('Title')} error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What needs doing?')} maxLength={140} required autoFocus={!task} />
      </Field>
      <Field label={t('Notes')}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder={t('Optional')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Category')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Priority')}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={recType === 'none' ? t('Due date') : t('Starts')} error={errors.due_date}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field label={t('Due time')} error={errors.due_time}>
          <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
      </div>
      <Field label={t('Reminder time')} hint={t('You get a Telegram message at this time on the due date.')} error={errors.reminder_time}>
        <Input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
      </Field>

      <Field label={t('Repeat')}>
        <Select value={recType} onChange={(e) => setRecType(e.target.value as RecurrenceType)}>
          {RECURRENCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>

      {recType === 'weekly' && (
        <div className="flex justify-between gap-1">
          {WEEKDAY_SHORT.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
              className={cn(
                'h-10 flex-1 rounded-xl text-xs font-bold',
                days.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {d.slice(0, 2)}
            </button>
          ))}
        </div>
      )}
      {(recType === 'custom' || recType === 'weekly') && (
        <Field label={recType === 'custom' ? t('Every how many days?') : t('Every how many weeks?')}>
          <Input
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={interval}
            onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      )}
      {recType !== 'none' && (
        <Field label={t('Repeat until')} hint={t('Leave empty to repeat forever.')}>
          <Input type="date" value={until} min={dueDate} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      )}

      <div className="flex gap-2 pt-1">
        {task && (
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={async () => {
              const msg = task.recurrence_type === 'none' ? t('Delete this task?') : t('Delete this task and all its repeats?');
              if (!window.confirm(msg)) return;
              const r = await run(() => remove.mutateAsync(task.task_id), t('Task deleted'));
              if (r) onDone();
            }}
          >
            {t('Delete')}
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          {busy ? t('Saving…') : task ? t('Save task') : t('Add task')}
        </Button>
      </div>
    </form>
  );
}

export function RoutineForm({ onDone }: { onDone: () => void }) {
  const { busy, errors, run } = useSubmit();
  const [title, setTitle] = useState('');
  const create = useApiMutation((body: { title: string }) => api('/routines', { method: 'POST', body }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => create.mutateAsync({ title }), t('Routine added')).then((r) => r && onDone());
      }}
    >
      <Field label={t('Routine')} error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Study English')} maxLength={80} required autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t('Saving…') : t('Add routine')}
      </Button>
    </form>
  );
}
