import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the REAL migrations against an in-process PostgreSQL (PGlite) and verifies the
 * ledger invariants: balances, transfers, savings contributions, constraints and the
 * notification-job claiming that prevents duplicate delivery.
 */
const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

let db: PGlite;
let owner: string;
let usd: string;
let khr: string;
let foodCat: string;
let salaryCat: string;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}

async function balance(accountId: string): Promise<number> {
  const r = await one<{ balance_minor: string }>('select balance_minor from account_balances where account_id = $1', [accountId]);
  return Number(r.balance_minor);
}

async function tx(
  type: 'income' | 'expense' | 'transfer',
  fields: { account: string; to?: string; amount: number; accountAmount?: number; toAmount?: number; cat?: string; currency?: string; on?: string },
) {
  return one<{ id: string }>(
    `insert into transactions (owner_id, type, account_id, to_account_id, category_id, amount_minor, currency,
       fx_khr_per_usd, account_amount_minor, to_amount_minor, base_usd_minor, occurred_on)
     values ($1,$2,$3,$4,$5,$6,$7,4100,$8,$9,$6,$10) returning id`,
    [
      owner,
      type,
      fields.account,
      fields.to ?? null,
      fields.cat ?? null,
      fields.amount,
      fields.currency ?? 'USD',
      fields.accountAmount ?? fields.amount,
      fields.toAmount ?? null,
      fields.on ?? '2026-03-18',
    ],
  );
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  owner = (await one<{ bootstrap_owner: string }>('select bootstrap_owner(424242, $1, $2) as bootstrap_owner', ['Owner', 'owner'])).bootstrap_owner;
  usd = (await one<{ id: string }>("select id from financial_accounts where owner_id=$1 and currency='USD'", [owner])).id;
  khr = (await one<{ id: string }>("select id from financial_accounts where owner_id=$1 and currency='KHR'", [owner])).id;
  foodCat = (await one<{ id: string }>("select id from categories where owner_id=$1 and kind='expense' and slug='food'", [owner])).id;
  salaryCat = (await one<{ id: string }>("select id from categories where owner_id=$1 and kind='income' and slug='salary'", [owner])).id;
});

describe('bootstrap', () => {
  it('seeds categories, accounts, settings and notification defaults, idempotently', async () => {
    const again = await one<{ bootstrap_owner: string }>('select bootstrap_owner(424242, null, null) as bootstrap_owner');
    expect(again.bootstrap_owner).toBe(owner);
    expect((await one<{ n: string }>('select count(*) n from categories where owner_id=$1', [owner])).n).toBe(16);
    expect((await one<{ n: string }>('select count(*) n from financial_accounts where owner_id=$1', [owner])).n).toBe(2);
    expect((await one<{ n: string }>('select count(*) n from notification_preferences where owner_id=$1', [owner])).n).toBe(3);
    const s = await one<{ timezone: string; preferred_currency: string; theme: string }>('select * from user_settings where user_id=$1', [owner]);
    expect(s).toMatchObject({ timezone: 'Asia/Phnom_Penh', preferred_currency: 'USD', theme: 'dark' });
  });
});

describe('account balances and transfers', () => {
  it('derives balances from the ledger (opening + income - expense)', async () => {
    await db.query('update financial_accounts set opening_balance_minor = 10000 where id = $1', [usd]);
    await tx('income', { account: usd, amount: 5000, cat: salaryCat });
    await tx('expense', { account: usd, amount: 250, cat: foodCat });
    expect(await balance(usd)).toBe(10000 + 5000 - 250);
  });

  it('transfers move money between accounts without being income or expense', async () => {
    const before = { usd: await balance(usd), khr: await balance(khr) };
    // $20 -> riel at 4100 = 82,000
    await tx('transfer', { account: usd, to: khr, amount: 2000, accountAmount: 2000, toAmount: 82000 });
    expect(await balance(usd)).toBe(before.usd - 2000);
    expect(await balance(khr)).toBe(before.khr + 82000);

    const sums = await one<{ inc: string; exp: string }>(
      `select coalesce(sum(amount_minor) filter (where type='income'),0) inc,
              coalesce(sum(amount_minor) filter (where type='expense'),0) exp
       from transactions where owner_id=$1`,
      [owner],
    );
    expect(Number(sums.inc)).toBe(5000);
    expect(Number(sums.exp)).toBe(250);
  });

  it('a KHR expense in a KHR account reduces only that account', async () => {
    const before = await balance(khr);
    await tx('expense', { account: khr, amount: 8000, currency: 'KHR', cat: foodCat });
    expect(await balance(khr)).toBe(before - 8000);
  });

  it('enforces ledger constraints', async () => {
    await expect(tx('transfer', { account: usd, amount: 100 })).rejects.toThrow(); // no destination
    await expect(tx('transfer', { account: usd, to: usd, amount: 100, toAmount: 100 })).rejects.toThrow(); // same account
    await expect(tx('expense', { account: usd, amount: 0 })).rejects.toThrow(); // non-positive
    await expect(tx('expense', { account: usd, amount: 100, to: khr, toAmount: 5 })).rejects.toThrow(); // dest on expense
  });

  it('prevents duplicate submissions via the idempotency key', async () => {
    const req = '8b0c5b30-2f0f-4f55-9d5a-1f9c9d1e0a11';
    const insert = () =>
      db.query(
        `insert into transactions (owner_id,type,account_id,amount_minor,currency,fx_khr_per_usd,account_amount_minor,base_usd_minor,occurred_on,client_request_id)
         values ($1,'expense',$2,100,'USD',4100,100,100,'2026-03-18',$3)`,
        [owner, usd, req],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('savings contributions', () => {
  let goal: string;

  beforeAll(async () => {
    goal = (
      await one<{ id: string }>(
        `insert into savings_goals (owner_id,name,target_minor,currency,start_date,target_date)
         values ($1,'Laptop',60000,'USD','2026-01-01','2026-12-31') returning id`,
        [owner],
      )
    ).id;
  });

  const contribute = (amount: number, account: string | null, request: string | null = null) =>
    one<{ add_savings_contribution: { contribution_id: string; saved_minor: number; goal_completed: boolean; duplicate: boolean } }>(
      'select add_savings_contribution($1,$2,$3,$4,$5,$6,$7,$8) as add_savings_contribution',
      [owner, goal, amount, account, account ? amount : null, '2026-03-18', '', request],
    ).then((r) => r.add_savings_contribution);

  it('moves money out of the account (not an expense) and into the goal', async () => {
    const before = await balance(usd);
    const expensesBefore = (await one<{ s: string }>("select coalesce(sum(amount_minor),0) s from transactions where owner_id=$1 and type='expense'", [owner])).s;
    const r = await contribute(1000, usd);
    expect(r.saved_minor).toBe(1000);
    expect(await balance(usd)).toBe(before - 1000);
    const expensesAfter = (await one<{ s: string }>("select coalesce(sum(amount_minor),0) s from transactions where owner_id=$1 and type='expense'", [owner])).s;
    expect(expensesAfter).toBe(expensesBefore); // savings are not spending
  });

  it('is idempotent per client request id', async () => {
    const req = '11111111-2222-4333-8444-555555555555';
    const first = await contribute(500, null, req);
    const second = await contribute(500, null, req);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.contribution_id).toBe(first.contribution_id);
    expect(second.saved_minor).toBe(first.saved_minor);
  });

  it('reversal restores the account balance and goal total', async () => {
    const before = await balance(usd);
    const r = await contribute(700, usd);
    expect(await balance(usd)).toBe(before - 700);
    const rev = await one<{ reverse_savings_contribution: { saved_minor: number } }>(
      'select reverse_savings_contribution($1,$2) as reverse_savings_contribution',
      [owner, r.contribution_id],
    );
    expect(rev.reverse_savings_contribution.saved_minor).toBe(r.saved_minor - 700);
    expect(await balance(usd)).toBe(before);
    await expect(
      db.query('select reverse_savings_contribution($1,$2)', [owner, r.contribution_id]),
    ).rejects.toThrow(/already_reversed/);
  });

  it('completes the goal at the target and re-opens it when a contribution is reversed', async () => {
    const totals = await one<{ saved_minor: string }>('select saved_minor from savings_goal_totals where goal_id=$1', [goal]);
    const remaining = 60000 - Number(totals.saved_minor);
    const done = await contribute(remaining, null);
    expect(done.goal_completed).toBe(true);
    expect((await one<{ status: string }>('select status from savings_goals where id=$1', [goal])).status).toBe('completed');
    await expect(contribute(100, null)).rejects.toThrow(/goal_not_active/);

    await db.query('select reverse_savings_contribution($1,$2)', [owner, done.contribution_id]);
    const g = await one<{ status: string; completed_at: string | null }>('select status, completed_at from savings_goals where id=$1', [goal]);
    expect(g.status).toBe('active');
    expect(g.completed_at).toBeNull();
  });

  it("refuses another owner's goal", async () => {
    await expect(
      db.query('select add_savings_contribution($1,$2,100,null,null,$3,$4,null)', [
        '00000000-0000-4000-8000-0000000000aa',
        goal,
        '2026-03-18',
        '',
      ]),
    ).rejects.toThrow(/goal_not_found/);
  });
});

describe('recurring tasks', () => {
  it('cannot create duplicate occurrences for the same task and date', async () => {
    const { id } = await one<{ id: string }>(
      `insert into tasks (owner_id,title,due_date,recurrence_type) values ($1,'Study English','2026-03-18','daily') returning id`,
      [owner],
    );
    const ins = (on: string) =>
      db.query(
        `insert into task_occurrences (task_id,owner_id,occurrence_date) values ($1,$2,$3)
         on conflict (task_id, occurrence_date) do nothing`,
        [id, owner, on],
      );
    await ins('2026-03-19');
    await ins('2026-03-19');
    await ins('2026-03-19');
    expect((await one<{ n: string }>('select count(*) n from task_occurrences where task_id=$1', [id])).n).toBe(1);
    await expect(
      db.query('insert into task_occurrences (task_id,owner_id,occurrence_date) values ($1,$2,$3)', [id, owner, '2026-03-19']),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe('notification jobs', () => {
  const enqueue = (key: string, due = '2026-03-18T00:00:00Z') =>
    db.query(
      `insert into notification_jobs (owner_id,kind,dedupe_key,due_at) values ($1,'morning',$2,$3)
       on conflict (owner_id, dedupe_key) do nothing`,
      [owner, key, due],
    );
  const claim = (now: string, limit = 10) =>
    db.query<{ id: string; attempts: number; status: string }>('select * from claim_notification_jobs($1, $2)', [limit, now]);

  it('enqueueing the same logical notification twice yields one job', async () => {
    await enqueue('morning:2026-03-18');
    await enqueue('morning:2026-03-18');
    expect((await one<{ n: string }>("select count(*) n from notification_jobs where dedupe_key='morning:2026-03-18'")).n).toBe(1);
  });

  it('claims each due job exactly once; not-yet-due jobs are left alone', async () => {
    await enqueue('morning:2026-03-19', '2026-03-19T00:00:00Z');
    const first = await claim('2026-03-18T00:05:00Z');
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ attempts: 1, status: 'processing' });
    const second = await claim('2026-03-18T00:05:30Z');
    expect(second.rows).toHaveLength(0); // already claimed => no duplicate delivery
  });

  it('reclaims a job whose worker died, up to max attempts, then marks it failed', async () => {
    const t1 = await claim('2026-03-18T00:20:00Z'); // 15 min later: lock considered stale
    expect(t1.rows).toHaveLength(1);
    expect(t1.rows[0].attempts).toBe(2);
    const t2 = await claim('2026-03-18T00:40:00Z');
    expect(t2.rows[0].attempts).toBe(3);
    const t3 = await claim('2026-03-18T01:00:00Z');
    expect(t3.rows).toHaveLength(0);
    const row = await one<{ status: string }>("select status from notification_jobs where dedupe_key='morning:2026-03-18'");
    expect(row.status).toBe('failed');
  });

  it('respects retry back-off (next_attempt_at)', async () => {
    await db.query('delete from notification_jobs');
    await enqueue('morning:2026-03-20', '2026-03-20T00:00:00Z');
    await db.query("update notification_jobs set next_attempt_at='2026-03-20T00:10:00Z' where dedupe_key='morning:2026-03-20'");
    expect((await claim('2026-03-20T00:05:00Z')).rows).toHaveLength(0);
    expect((await claim('2026-03-20T00:11:00Z')).rows).toHaveLength(1);
  });
});

describe('skipped task occurrences', () => {
  it('accepts a skipped status and rejects unknown ones', async () => {
    const { id } = await one<{ id: string }>(
      "insert into tasks (owner_id,title,due_date,recurrence_type,category) values ($1,'School','2026-03-18','daily','study') returning id",
      [owner],
    );
    await db.query("insert into task_occurrences (task_id,owner_id,occurrence_date,status) values ($1,$2,'2026-03-20','skipped')", [id, owner]);
    await expect(
      db.query("insert into task_occurrences (task_id,owner_id,occurrence_date,status) values ($1,$2,'2026-03-21','cancelled')", [id, owner]),
    ).rejects.toThrow();
  });
});

describe('day types', () => {
  it('keeps one kind per owner and date, so re-tagging a day replaces it', async () => {
    const upsert = (kind: string) =>
      db.query(
        `insert into day_marks (owner_id, mark_date, kind, note) values ($1, '2026-04-14', $2, '')
         on conflict (owner_id, mark_date) do update set kind = excluded.kind`,
        [owner, kind],
      );
    await upsert('holiday');
    await upsert('off');
    const rows = await db.query<{ kind: string }>('select kind from day_marks where owner_id = $1', [owner]);
    expect(rows.rows).toEqual([{ kind: 'off' }]);
  });

  it('accepts half-day kinds', async () => {
    for (const [i, kind] of ['half_am', 'half_pm'].entries()) {
      await db.query('insert into day_marks (owner_id, mark_date, kind) values ($1, $2, $3)', [owner, `2026-05-0${i + 1}`, kind]);
    }
    const r = await db.query<{ n: string }>("select count(*) n from day_marks where kind like 'half_%'");
    expect(Number(r.rows[0].n)).toBe(2);
  });

  it('rejects unknown kinds', async () => {
    await expect(
      db.query("insert into day_marks (owner_id, mark_date, kind) values ($1, '2026-04-15', 'vacation')", [owner]),
    ).rejects.toThrow();
  });
});

describe('row level security posture', () => {
  it('has RLS enabled on every application table', async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });
});
