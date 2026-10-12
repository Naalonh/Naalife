-- Day types: tag any date as work / study / off / holiday.
-- Repeating work & business tasks are paused (hidden, no reminders, never overdue)
-- on study / off / holiday days. Safe to run more than once.

create table if not exists public.day_marks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  mark_date date not null,
  kind text not null check (kind in ('work', 'study', 'off', 'holiday')),
  note text not null default '' check (char_length(note) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, mark_date)
);

drop trigger if exists day_marks_updated on public.day_marks;
create trigger day_marks_updated before update on public.day_marks
  for each row execute function public.set_updated_at();

create index if not exists day_marks_owner_date_idx on public.day_marks (owner_id, mark_date);

-- same lock-down as every other table: no access through the public Data API
alter table public.day_marks enable row level security;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.day_marks from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.day_marks to service_role;
  end if;
end;
$$;
