-- Half days: 'half_am' = work in the morning, off in the afternoon;
-- 'half_pm' = off in the morning, work in the afternoon. Safe to run more than once.

alter table public.day_marks drop constraint if exists day_marks_kind_check;
alter table public.day_marks
  add constraint day_marks_kind_check
  check (kind in ('work', 'half_am', 'half_pm', 'study', 'off', 'holiday'));
