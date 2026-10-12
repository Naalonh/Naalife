-- Let a single occurrence of a repeating task be skipped (e.g. school cancelled today).
-- A skipped occurrence is hidden, never overdue and sends no reminders; it can be restored.
-- Safe to run more than once.

alter table public.task_occurrences drop constraint if exists task_occurrences_status_check;
alter table public.task_occurrences
  add constraint task_occurrences_status_check check (status in ('open', 'done', 'skipped'));
