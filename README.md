# Personal Life Assistant — Telegram Mini App

A private, single-owner Telegram Mini App + bot for expenses, income, accounts, budgets,
savings goals, tasks, routines, reminders and reports. Fully serverless:

```
Telegram → Mini App (React, Cloudflare static assets) → Cloudflare Worker (Hono /api) → Supabase PostgreSQL
Telegram Bot API → webhook → Cloudflare Worker → Supabase PostgreSQL
Cloudflare Cron (every 5 min) → Worker → Supabase → Telegram Bot API → reminders
```

No VPS, no always-on Node process, no persistent DB connections (Supabase is called over HTTPS).

## Repository layout

```
apps/web        React + Vite + Tailwind + Radix (shadcn-style) Mini App
apps/worker     Hono API, Telegram webhook, cron handler (Cloudflare Worker)
packages/shared Money/dates/savings/budget/recurrence/schedule logic + Zod schemas + API types
supabase/       SQL migrations (+ optional dev seed)
```

`packages/shared` is the single source of truth for business rules; the web app and the
Worker run the *same* code (and the same tests) for money maths, savings targets, recurrence
and reminder scheduling.

## Key design decisions

| Topic | Decision |
|---|---|
| Money | Integer minor units only (USD cents, KHR riel), `bigint` columns, parsed from strings without floats; conversions use `BigInt` with half-away-from-zero rounding. |
| Currency | Each transaction stores the original amount + currency, the exchange rate in effect (`fx_khr_per_usd`), the amount in the account's currency (this moves the balance) and a USD "hub" value. Reports convert cross-currency rows at their *recorded* rate, so history doesn't shift when you change the rate. |
| Balances | Never stored. `account_balances` view = opening + income − expense − transfers out + transfers in − savings funded from the account. Auditable from the ledger. |
| Transfers | One row (`type='transfer'`, from/to account, both amounts). Never income or expense. |
| Savings | A contribution optionally debits an account (not an expense) and raises the goal total. `add_savings_contribution` / `reverse_savings_contribution` run in one DB transaction, lock the goal row, and are idempotent. Total savings = Σ goals, account balances already exclude the money, so nothing is counted twice. |
| Daily target | `ceil((target − saved) / max(1, days_to_target))` in the smallest unit (cent / riel). |
| Duplicates | Client-generated idempotency keys (`client_request_id`, unique per owner) on transactions and contributions; the bot derives keys from Telegram `update_id` / callback id. |
| Recurring tasks | Occurrences are materialised 14 days ahead into `task_occurrences` with `UNIQUE(task_id, occurrence_date)` + `ON CONFLICT DO NOTHING`; safe to run from API, bot and cron concurrently. |
| Notifications | Cron every 5 min (UTC). Each tick computes local time in the owner's timezone, upserts jobs keyed by `kind:local_date`, **claims** them with `FOR UPDATE SKIP LOCKED`, sends, logs to `notification_delivery_logs`, retries with exponential back-off (max 3), and reclaims jobs from crashed workers. No timers, no memory state. A job stays deliverable for 3 h after its time (delayed cron) and is then dropped. |
| Dates | All "today" logic uses the owner's timezone (default `Asia/Phnom_Penh`) → plain `date` columns; timestamps are `timestamptz` UTC. |

## Security model

* **Single owner.** `OWNER_TELEGRAM_ID` is the only identity that can ever get a session.
* **Auth flow.** The Mini App posts raw `initData` to `POST /api/auth/telegram`. The Worker verifies
  the HMAC signature with the bot token (constant-time), checks `auth_date` freshness (≤ 1 h) and compares the
  user id with the owner. It then issues a 12 h HS256 session token (bearer, kept in `sessionStorage`).
  The user id is never read from request bodies.
* **Every `/api/*` route** except the two login endpoints and `/api/health` requires that token.
* **Webhook** `POST /telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token` (constant-time compare)
  and ignores any sender except the owner.
* **Database.** All 15 tables have RLS enabled with *no* policies, and `anon`/`authenticated` grants and function
  execute rights are revoked → the public Supabase Data API can read/write nothing. Only the Worker, holding the
  secret key, accesses data, and every query is filtered by `owner_id`.
* **Secrets** live in Cloudflare Secrets; nothing sensitive is in `VITE_*` variables.
* **CORS** allows only `APP_URL`. Bearer tokens (no cookies) → no CSRF surface.
* **Errors** are generic; DB messages and financial payloads are never logged or returned.
* **Dev login** (`POST /api/auth/dev`) returns 404 unless `ENVIRONMENT=development` **and**
  `DEV_AUTH_ENABLED=true` **and** the request host is loopback. Production `wrangler.jsonc` pins
  `ENVIRONMENT=production`, `.dev.vars` is never deployed, and the web client only calls it in `import.meta.env.DEV` builds.
* Optional hardening: add a Cloudflare WAF rate-limiting rule for `/api/auth/*`.

## Local development

Prerequisites: Node 20+, a Supabase project (a free dev project is fine) and a Telegram bot token.

```bash
npm install

# 1. database: run supabase/migrations/0001_schema.sql then 0002_functions.sql
#    (SQL editor in the Supabase dashboard, or `supabase db push` with the CLI)

# 2. worker config
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # fill in values

# 3. run both
npm run dev          # web on :5173 (proxies /api), worker on :8787
```

Open <http://localhost:5173> in a normal browser: the dev-only login signs you in as the owner.
Test the bot locally by exposing the worker with a tunnel and calling `setWebhook` (below).
Test reminders locally with `npx wrangler dev --test-scheduled` and
`curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

Quality gates:

```bash
npm run typecheck && npm run lint && npm test && npm run build     # or: npm run check
```

## Deployment

> Nothing here has been deployed from this repository's build environment; follow the steps below
> and use the checks in step 12–15 to verify your own deployment.

1. **Create the bot** – talk to [@BotFather](https://t.me/BotFather): `/newbot` → copy the token.
   Find your numeric id with [@userinfobot](https://t.me/userinfobot).
2. **Create a Supabase project** (free). Note *Project URL* and create a **secret key**
   (Project Settings → API Keys; legacy `service_role` also works). Never expose it to the browser.
3. **Run migrations** – paste `supabase/migrations/0001_schema.sql`, then `0002_functions.sql`
   into the SQL editor (or `supabase link && supabase db push`).
4. **Cloudflare**: `npx wrangler login`.
5. **Configure the Worker** – edit `apps/worker/wrangler.jsonc` `vars` (`APP_URL`, `API_URL`).
   The Worker URL is `https://pla-api.<your-subdomain>.workers.dev`; deploy once first if you don't know it.
6. **Secrets**:
   ```bash
   cd apps/worker
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # e.g. output of: openssl rand -hex 32
   npx wrangler secret put OWNER_TELEGRAM_ID
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SECRET_KEY
   ```
7. **Deploy the API/bot/cron**: `npm run deploy -w @pla/worker`. The cron trigger (`*/5 * * * *`) is
   registered from `wrangler.jsonc` automatically.
8. **Deploy the frontend**:
   ```bash
   echo "VITE_API_URL=https://pla-api.<your-subdomain>.workers.dev" > apps/web/.env.production
   npm run deploy -w @pla/web          # Cloudflare static assets, SPA fallback enabled
   ```
   Then set `APP_URL` in `wrangler.jsonc` to the web URL and redeploy the Worker (CORS + bot buttons use it).
9. **Register the webhook** (HTTPS required):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://pla-api.<your-subdomain>.workers.dev/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     -d 'allowed_updates=["message","callback_query"]'
   ```
10. **Mini App URL** – BotFather → `/mybots` → your bot → *Bot Settings → Menu Button* → set the web URL
    (and optionally `/newapp`). `/start` also shows an "Open My Dashboard" web-app button.
11. **Cron** – verify in Cloudflare → Workers → `pla-api` → *Triggers*.
12. **Test auth** – open the bot in Telegram, send `/start`, tap the button: the dashboard loads.
    From any other Telegram account the bot answers "private assistant" and the API returns 403.
13. **Test finance** – `/expense 2.50 lunch` → "✅ Expense Recorded!"; add income in the app; check the
    dashboard, account balances and a transfer (balances change, income/expense totals don't).
14. **Test savings** – create a $600 goal 100 days out, add $100: the card must show **$5.00 / day**.
    Reverse a contribution and confirm the balance and goal total revert.
15. **Test reminders** – Settings → set "Morning briefing" to 2–3 minutes from now; within ≤ 5 minutes
    you get the message. Check `notification_jobs` / `notification_delivery_logs` in Supabase: one row per
    notification per day, `status = sent`.

### Free-tier notes

* Workers Free allows 100k requests/day and cron triggers; 288 cron runs/day is well within limits.
* Workers Free caps CPU at 10 ms per request. The code is I/O-bound and light, but if you see
  "exceeded CPU" errors on large reports, move to the $5 Workers Paid plan.
* A free Supabase project pauses after a week of inactivity; the 5-minute cron keeps it active.
* Free plans allow 50 subrequests per invocation; the heaviest route (dashboard) uses ~15.

## Bot commands

`/start` `/app` `/expense [amount] [description]` `/income …` `/balance` `/today` `/tasks` `/save` `/report` `/help`

Quick entry understands `2.50 lunch`, `$5 coffee`, `4000 khr tuk tuk`, `៛8000 noodles`. Missing details are
collected with inline category buttons or a reply prompt, and everything is idempotent per update.

## API summary (`/api`, JSON, bearer session)

Success: `{ "data": …, "meta"?: { page, limit, total } }`. Error: `{ "error": { code, message, details? } }`.

`POST /auth/telegram` · `GET /me` · `GET /dashboard` · `GET|POST /accounts`, `PATCH /accounts/:id` ·
`GET|POST /transactions`, `PATCH|DELETE /transactions/:id` · `GET|POST /budgets`, `PATCH|DELETE /budgets/:id`,
`GET /budgets/:id/history` · `GET|POST /savings`, `PATCH|DELETE /savings/:id`, `GET|POST /savings/:id/contributions`,
`POST /savings/:id/contributions/:cid/reverse` · `GET|POST /tasks`, `GET /tasks/stats`, `PATCH|DELETE /tasks/:id`
(PATCH with `completed` + `occurrence_date` completes / reopens) · `GET|POST /routines`, `PATCH /routines/:id`,
`POST /routines/:id/complete` · `GET /reports/{daily,weekly,monthly,categories,export}` · `GET|PATCH /settings`.

## Known limitations

* Calendar shows occurrences materialised within the next 14 days for recurring tasks.
* Deleting a savings goal deletes its contributions, which returns funded cash to the accounts (archive keeps them).
* Goal-completion Telegram messages are best-effort (not retried); reminders and budget alerts are retried.
* Single owner/single user by design; there is no registration flow.
