-- Personal Life Assistant — core schema
-- Money is always stored as integer minor units (USD cents, KHR riel) in bigint columns.
-- All timestamps are timestamptz (UTC). "Local" calendar dates use plain `date` columns that
-- the API derives from the owner's timezone (default Asia/Phnom_Penh).

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users / settings
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  first_name text,
  username text,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  preferred_currency text not null default 'USD' check (preferred_currency in ('USD', 'KHR')),
  secondary_currency text not null default 'KHR' check (secondary_currency in ('USD', 'KHR')),
  fx_khr_per_usd numeric(14, 4) not null default 4100 check (fx_khr_per_usd >= 1 and fx_khr_per_usd <= 1000000),
  timezone text not null default 'Asia/Phnom_Penh',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  default_account_id uuid,
  task_reminders_enabled boolean not null default true,
  budget_alerts_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts / categories
-- ---------------------------------------------------------------------------
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('cash', 'bank', 'ewallet', 'savings')),
  currency text not null check (currency in ('USD', 'KHR')),
  opening_balance_minor bigint not null default 0 check (opening_balance_minor >= 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);
create trigger financial_accounts_updated before update on public.financial_accounts
  for each row execute function public.set_updated_at();

alter table public.user_settings
  add constraint user_settings_default_account_fk
  foreign key (default_account_id) references public.financial_accounts(id) on delete set null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  slug text not null,
  name text not null,
  icon text not null default 'ellipsis',
  color text not null default '#94a3b8',
  sort_order int not null default 0,
  unique (owner_id, kind, slug)
);

-- ---------------------------------------------------------------------------
-- transactions (income, expense, transfer)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  to_account_id uuid references public.financial_accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  -- original amount exactly as entered
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  -- rate (KHR per 1 USD) in effect when the row was written; kept for historical conversion
  fx_khr_per_usd numeric(14, 4) not null check (fx_khr_per_usd >= 1),
  -- amount in the (source) account's currency; this is what moves the balance
  account_amount_minor bigint not null check (account_amount_minor > 0),
  -- transfers only: amount credited to the destination account, in its currency
  to_amount_minor bigint check (to_amount_minor is null or to_amount_minor > 0),
  -- USD-cent "hub" value used for cross-currency reporting
  base_usd_minor bigint not null check (base_usd_minor >= 0),
  description text not null default '' check (char_length(description) <= 200),
  occurred_on date not null,
  source text not null default 'app' check (source in ('app', 'bot')),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfer_shape check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id
      and to_amount_minor is not null and category_id is null)
    or
    (type <> 'transfer' and to_account_id is null and to_amount_minor is null)
  )
);
create trigger transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();
create index transactions_owner_date_idx on public.transactions (owner_id, occurred_on desc, created_at desc);
create index transactions_owner_type_date_idx on public.transactions (owner_id, type, occurred_on);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_category_idx on public.transactions (category_id);
create unique index transactions_idempotency_idx on public.transactions (owner_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  category_id uuid references public.categories(id) on delete cascade, -- null = all spending
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  alert_threshold_pct smallint not null default 80 check (alert_threshold_pct between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();
create unique index budgets_unique_scope_idx on public.budgets
  (owner_id, period, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where active;

-- ---------------------------------------------------------------------------
-- savings
-- ---------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_minor bigint not null check (target_minor > 0),
  currency text not null check (currency in ('USD', 'KHR')),
  start_date date not null,
  target_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_date >= start_date)
);
create trigger savings_goals_updated before update on public.savings_goals
  for each row execute function public.set_updated_at();
create index savings_goals_owner_idx on public.savings_goals (owner_id, status);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  -- amount in the goal's currency
  amount_minor bigint not null check (amount_minor > 0),
  -- optional funding account; when set the account balance drops by account_amount_minor
  account_id uuid references public.financial_accounts(id) on delete restrict,
  account_amount_minor bigint check (account_amount_minor is null or account_amount_minor > 0),
  contributed_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  reversed_at timestamptz,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  check ((account_id is null) = (account_amount_minor is null))
);
create index savings_contributions_goal_idx on public.savings_contributions (goal_id, contributed_on desc);
create index savings_contributions_owner_date_idx on public.savings_contributions (owner_id, contributed_on);
create index savings_contributions_account_idx on public.savings_contributions (account_id) where account_id is not null;
create unique index savings_contributions_idempotency_idx on public.savings_contributions (owner_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  description text not null default '',
  category text not null default 'personal'
    check (category in ('personal', 'study', 'work', 'business', 'finance', 'health', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date not null,
  due_time time,
  reminder_time time,
  recurrence_type text not null default 'none' check (recurrence_type in ('none', 'daily', 'weekly', 'custom')),
  recurrence_interval int not null default 1 check (recurrence_interval >= 1),
  recurrence_days smallint[] not null default '{}',
  recurrence_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();
create index tasks_owner_idx on public.tasks (owner_id, recurrence_type);

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- guarantees recurring tasks can never produce duplicate instances
  unique (task_id, occurrence_date)
);
create index task_occurrences_owner_date_idx on public.task_occurrences (owner_id, occurrence_date, status);

-- ---------------------------------------------------------------------------
-- routines
-- ---------------------------------------------------------------------------
create table public.daily_routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  icon text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index daily_routines_owner_idx on public.daily_routines (owner_id, active);

create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.daily_routines(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  unique (routine_id, completed_on)
);
create index routine_completions_owner_idx on public.routine_completions (owner_id, completed_on);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  owner_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('morning', 'savings', 'evening')),
  enabled boolean not null default true,
  local_time time not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind)
);
create trigger notification_preferences_updated before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('morning', 'savings', 'evening', 'task_reminder', 'budget_alert')),
  -- one job per logical notification; makes enqueueing idempotent
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_attempt_at timestamptz, -- null = eligible immediately; set only when backing off after a failure
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);
create index notification_jobs_claim_idx on public.notification_jobs (status, due_at);

create table public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notification_jobs(id) on delete cascade,
  attempt int not null,
  status text not null check (status in ('sent', 'failed')),
  http_status int,
  error text,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);
create index notification_delivery_logs_job_idx on public.notification_delivery_logs (job_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Every table is locked down: RLS is enabled with NO policies for the anon /
-- authenticated roles, so the public PostgREST endpoint can read or write nothing.
-- Only the Cloudflare Worker, holding the secret (service role) key, which bypasses
-- RLS, touches data — always filtered by the verified owner id.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.user_settings enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.daily_routines enable row level security;
alter table public.routine_completions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_delivery_logs enable row level security;
