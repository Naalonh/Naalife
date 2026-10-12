-- Views and transactional functions. Called only by the Worker with the service key.

-- ---------------------------------------------------------------------------
-- Account balances (single source of truth, always derived from the ledger)
--   opening
--   + income            (account_amount)
--   - expense           (account_amount)
--   - transfers out     (account_amount of source)
--   + transfers in      (to_amount of destination)
--   - savings contributions funded from the account (not an expense)
-- ---------------------------------------------------------------------------
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.owner_id,
  a.opening_balance_minor
    + coalesce((
        select sum(case t.type when 'income' then t.account_amount_minor else -t.account_amount_minor end)
        from public.transactions t where t.account_id = a.id
      ), 0)
    + coalesce((select sum(t.to_amount_minor) from public.transactions t where t.to_account_id = a.id), 0)
    - coalesce((
        select sum(c.account_amount_minor)
        from public.savings_contributions c
        where c.account_id = a.id and c.reversed_at is null
      ), 0)
    as balance_minor
from public.financial_accounts a;

create or replace view public.savings_goal_totals with (security_invoker = true) as
select
  g.id as goal_id,
  g.owner_id,
  coalesce(sum(c.amount_minor) filter (where c.reversed_at is null), 0)::bigint as saved_minor
from public.savings_goals g
left join public.savings_contributions c on c.goal_id = g.id
group by g.id, g.owner_id;

-- ---------------------------------------------------------------------------
-- First-run bootstrap for the single owner. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_owner(p_telegram_id bigint, p_first_name text, p_username text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_cash uuid;
begin
  insert into public.users (telegram_id, first_name, username)
  values (p_telegram_id, p_first_name, p_username)
  on conflict (telegram_id) do update
    set first_name = coalesce(excluded.first_name, public.users.first_name),
        username = coalesce(excluded.username, public.users.username)
  returning id into v_id;

  insert into public.user_settings (user_id) values (v_id) on conflict do nothing;

  insert into public.categories (owner_id, kind, slug, name, icon, color, sort_order) values
    (v_id, 'expense', 'food', 'Food', 'utensils', '#f59e0b', 1),
    (v_id, 'expense', 'transportation', 'Transportation', 'bus', '#38bdf8', 2),
    (v_id, 'expense', 'shopping', 'Shopping', 'shopping-bag', '#f472b6', 3),
    (v_id, 'expense', 'education', 'Education', 'graduation-cap', '#a78bfa', 4),
    (v_id, 'expense', 'bills', 'Bills', 'receipt', '#fb7185', 5),
    (v_id, 'expense', 'entertainment', 'Entertainment', 'clapperboard', '#facc15', 6),
    (v_id, 'expense', 'health', 'Health', 'heart-pulse', '#34d399', 7),
    (v_id, 'expense', 'family', 'Family', 'users', '#fb923c', 8),
    (v_id, 'expense', 'business', 'Business', 'briefcase', '#60a5fa', 9),
    (v_id, 'expense', 'other', 'Other', 'ellipsis', '#94a3b8', 10),
    (v_id, 'income', 'salary', 'Salary', 'banknote', '#10b981', 1),
    (v_id, 'income', 'business', 'Business', 'briefcase', '#60a5fa', 2),
    (v_id, 'income', 'freelance', 'Freelance', 'laptop', '#a78bfa', 3),
    (v_id, 'income', 'gifts', 'Gifts', 'gift', '#f472b6', 4),
    (v_id, 'income', 'allowance', 'Allowance', 'wallet', '#facc15', 5),
    (v_id, 'income', 'other', 'Other', 'ellipsis', '#94a3b8', 6)
  on conflict do nothing;

  insert into public.notification_preferences (owner_id, kind, enabled, local_time) values
    (v_id, 'morning', true, '07:00'),
    (v_id, 'savings', true, '20:00'),
    (v_id, 'evening', true, '21:00')
  on conflict do nothing;

  if not exists (select 1 from public.financial_accounts where owner_id = v_id) then
    insert into public.financial_accounts (owner_id, name, type, currency)
    values (v_id, 'Cash (USD)', 'cash', 'USD')
    returning id into v_cash;
    insert into public.financial_accounts (owner_id, name, type, currency)
    values (v_id, 'Cash (KHR)', 'cash', 'KHR');
    update public.user_settings set default_account_id = v_cash where user_id = v_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Savings contributions: insert + goal completion in ONE transaction.
-- Idempotent on (owner, client_request_id).
-- ---------------------------------------------------------------------------
create or replace function public.add_savings_contribution(
  p_owner uuid,
  p_goal uuid,
  p_amount bigint,
  p_account uuid,
  p_account_amount bigint,
  p_on date,
  p_note text,
  p_request uuid
) returns jsonb
language plpgsql
as $$
declare
  v_goal public.savings_goals%rowtype;
  v_existing public.savings_contributions%rowtype;
  v_id uuid;
  v_saved bigint;
  v_completed boolean := false;
begin
  select * into v_goal from public.savings_goals
  where id = p_goal and owner_id = p_owner for update;
  if not found then
    raise exception 'goal_not_found' using errcode = 'P0002';
  end if;

  if p_request is not null then
    select * into v_existing from public.savings_contributions
    where owner_id = p_owner and client_request_id = p_request;
    if found then
      select saved_minor into v_saved from public.savings_goal_totals where goal_id = p_goal;
      return jsonb_build_object('contribution_id', v_existing.id, 'saved_minor', v_saved,
                                'goal_completed', v_goal.status = 'completed', 'duplicate', true);
    end if;
  end if;

  if v_goal.status <> 'active' then
    raise exception 'goal_not_active' using errcode = 'P0001';
  end if;

  if p_account is not null and not exists (
    select 1 from public.financial_accounts where id = p_account and owner_id = p_owner and not is_archived
  ) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  insert into public.savings_contributions
    (owner_id, goal_id, amount_minor, account_id, account_amount_minor, contributed_on, note, client_request_id)
  values (p_owner, p_goal, p_amount, p_account, case when p_account is null then null else p_account_amount end,
          p_on, coalesce(p_note, ''), p_request)
  returning id into v_id;

  select saved_minor into v_saved from public.savings_goal_totals where goal_id = p_goal;

  if v_saved >= v_goal.target_minor then
    update public.savings_goals set status = 'completed', completed_at = now() where id = p_goal;
    v_completed := true;
  end if;

  return jsonb_build_object('contribution_id', v_id, 'saved_minor', v_saved,
                            'goal_completed', v_completed, 'duplicate', false);
end;
$$;

create or replace function public.reverse_savings_contribution(p_owner uuid, p_contribution uuid)
returns jsonb
language plpgsql
as $$
declare
  v_c public.savings_contributions%rowtype;
  v_goal public.savings_goals%rowtype;
  v_saved bigint;
begin
  select * into v_c from public.savings_contributions
  where id = p_contribution and owner_id = p_owner for update;
  if not found then
    raise exception 'contribution_not_found' using errcode = 'P0002';
  end if;
  if v_c.reversed_at is not null then
    raise exception 'already_reversed' using errcode = 'P0001';
  end if;

  select * into v_goal from public.savings_goals where id = v_c.goal_id for update;
  update public.savings_contributions set reversed_at = now() where id = p_contribution;
  select saved_minor into v_saved from public.savings_goal_totals where goal_id = v_c.goal_id;

  if v_goal.status = 'completed' and v_saved < v_goal.target_minor then
    update public.savings_goals set status = 'active', completed_at = null where id = v_goal.id;
  end if;

  return jsonb_build_object('goal_id', v_goal.id, 'saved_minor', v_saved);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification job claiming. FOR UPDATE SKIP LOCKED makes concurrent cron
-- invocations safe: each job is handed to exactly one worker.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_jobs(p_limit int, p_now timestamptz)
returns setof public.notification_jobs
language plpgsql
as $$
begin
  -- jobs whose worker died after exhausting retries are closed out
  update public.notification_jobs
     set status = 'failed', last_error = coalesce(last_error, 'worker lost')
   where status = 'processing' and locked_at < p_now - interval '10 minutes' and attempts >= max_attempts;

  return query
  with picked as (
    select id from public.notification_jobs
    where attempts < max_attempts
      and (
        (status = 'pending' and due_at <= p_now and (next_attempt_at is null or next_attempt_at <= p_now))
        or (status = 'processing' and locked_at < p_now - interval '10 minutes')
      )
    order by due_at
    limit p_limit
    for update skip locked
  )
  update public.notification_jobs j
     set status = 'processing', attempts = j.attempts + 1, locked_at = p_now
    from picked
   where j.id = picked.id
  returning j.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Least privilege: nothing is reachable through the public Data API.
-- Guarded so the migration also runs on a plain Postgres (tests).
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on all tables in schema public to service_role;
    grant execute on all functions in schema public to service_role;
  end if;
end;
$$;

revoke execute on function public.bootstrap_owner(bigint, text, text) from public;
revoke execute on function public.add_savings_contribution(uuid, uuid, bigint, uuid, bigint, date, text, uuid) from public;
revoke execute on function public.reverse_savings_contribution(uuid, uuid) from public;
revoke execute on function public.claim_notification_jobs(int, timestamptz) from public;
