-- OPTIONAL, development only. Not run in production.
--
-- The app seeds itself on first login (bootstrap_owner creates categories, two cash
-- accounts, notification defaults). This file adds a few sample rows so a fresh
-- *local/test* project is not empty. It does nothing until the owner exists, and it is
-- idempotent. Run it manually in the SQL editor of a throwaway/dev Supabase project.

do $$
declare
  v_owner uuid;
  v_usd uuid;
  v_food uuid;
  v_salary uuid;
begin
  select id into v_owner from public.users limit 1;
  if v_owner is null then
    raise notice 'No owner yet: open the app once (or call bootstrap_owner) and re-run.';
    return;
  end if;
  if exists (select 1 from public.transactions where owner_id = v_owner) then
    return;
  end if;

  select id into v_usd from public.financial_accounts where owner_id = v_owner and currency = 'USD' limit 1;
  select id into v_food from public.categories where owner_id = v_owner and kind = 'expense' and slug = 'food';
  select id into v_salary from public.categories where owner_id = v_owner and kind = 'income' and slug = 'salary';

  insert into public.transactions
    (owner_id, type, account_id, category_id, amount_minor, currency, fx_khr_per_usd,
     account_amount_minor, base_usd_minor, description, occurred_on)
  values
    (v_owner, 'income',  v_usd, v_salary, 50000, 'USD', 4100, 50000, 50000, 'Sample salary', current_date),
    (v_owner, 'expense', v_usd, v_food,     250, 'USD', 4100,   250,   250, 'Sample lunch',  current_date);

  insert into public.savings_goals (owner_id, name, target_minor, currency, start_date, target_date)
  values (v_owner, 'Sample: new laptop', 60000, 'USD', current_date, current_date + 100);
end;
$$;
