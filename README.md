# HSS App

The internal sales-to-service system for HSS: intake, pipeline, RFQ pricing,
orders, purchase orders, deliveries, customer service, and tasks.

Next.js 16 (App Router) · React 19 · Prisma 6 · PostgreSQL (Supabase) · Tailwind 4.

## Getting started

```bash
npm install
npx prisma generate
npm run dev
```

The app runs at http://localhost:3000 and redirects to the dashboard.

`npx prisma generate` is required before the first `dev` or `tsc` run, and again
after any change to `prisma/schema.prisma`. It is already part of `npm run build`.

## Fast local preview

For everyday use, run `npm run preview` instead of `npm run dev`. This builds
all pages once, then serves the production app at http://localhost:3001.
The separate port lets the development server keep running on port 3000.

Development mode compiles routes on demand, which is why opening a record can
show “Compiling” and pause. Production mode removes that compilation delay.
After code changes, stop the preview and run `npm run preview` again to rebuild.
Both development and production builds use Turbopack. In the restricted desktop
environment, run them with permission to bind local ports; Turbopack's CSS helper
also needs a local port during compilation.

## Environment

Create `.env` with:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (pooled) used by the app |
| `DIRECT_URL` | Direct Postgres connection used by Prisma for schema work |
| `SUPABASE_URL` | Supabase project URL, for file uploads |
| `SUPABASE_SECRET_KEY` | Supabase secret API key (`sb_secret_...`), for server-side file storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional legacy fallback when `SUPABASE_SECRET_KEY` is not set |

The Supabase URL and one server key are optional. Prefer the modern `SUPABASE_SECRET_KEY`; an existing legacy service-role key remains supported. Without it the app runs normally and the file
upload panels report that uploads are not configured; link-only documents still
work.

## Login protection

`src/lib/loginThrottle.ts` throttles login attempts in-memory, keyed by
lowercase email and by client IP. After 5 failed attempts for a key within 15
minutes, further attempts for that key are refused with a friendly message
until the block cools down; each additional failure doubles the wait, capped
at 1 hour. A successful login clears the counters, and `src/app/login/actions.ts`
also compares against a fixed dummy password hash for unknown emails so a
guesser can't tell a missing account from a wrong password by timing.

This state is per-instance and best-effort - on Vercel (or any multi-instance
deployment) it does not survive a cold start and is not shared across
instances. The robust complement is a Vercel Firewall rate-limit rule on
`POST /login`, enforced at the edge regardless of which instance handles a
given request.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then a production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run seed:demo` | Add a demo dataset. Every row is tagged `[demo]` |
| `npm run seed:demo:remove` | Remove exactly those `[demo]` rows |

The demo seed is additive and reversible: it never touches real records, and the
remover refuses to delete a demo parent that has since gained real children.

## Checks before pushing

```bash
npx prisma generate && npx tsc --noEmit && npx eslint src prisma scripts
```

`npx tsc --noEmit` needs `.next/types` to exist, because the root layout uses
Next 16's generated `LayoutProps` type. On a fresh clone, run `npm run build` (or
start `npm run dev` once) before the first type-check.

`npx tsx scripts/verify-flow.ts` exercises the payment-gate and order-status
rules end to end. It writes `ZZ-KLYNE-FLOW-TEST` records to whichever database
`DATABASE_URL` points at and deletes them afterwards, so point it at a
development database, not production.

## Schema changes

`prisma/sql/` is the schema's migration history, applied by hand to Supabase
by the orchestrator (there is no CI/CD pipeline that runs these). The numbered,
dated files (`00000000_baseline_schema_2026-09-22.sql`, `20260903_...`, and so
on) are that history - each one is idempotent (`IF NOT EXISTS` / `DO $$`
constraint-name guards) and safe to re-run, but only ever applied in order, by
hand, against the real database.

**Never run `prisma db push` or `prisma migrate dev` / `migrate deploy` against
production.** Both compare the live database to `prisma/schema.prisma` and
"fix" the difference - and the live database intentionally still carries
columns the schema no longer maps (`LineItem.leadTimeDays` and ten deprecated
`PurchaseOrder` logistics columns; see the model comments in
`prisma/schema.prisma`). Either command would drop them.

`prisma/sql/OPTIONAL_drop_deprecated_columns.sql` is not part of the numbered
history - it is an optional, destructive script that finally drops those
deprecated columns, meant to be run by hand, once, only after confirming
nobody needs the old values anymore.

## Layout

| Path | Contents |
| --- | --- |
| `src/app/` | Routes, page components, and their server actions |
| `src/lib/` | Shared rules, formatters, and UI primitives |
| `prisma/schema.prisma` | The data model. See `docs/DATA_MODEL.md` |
| `prisma/sql/` | SQL applied by hand to production, kept as migration history |
| `scripts/` | Maintenance and verification scripts |
| `docs/` | Data model, UX flow, design and build notes |

### In-app notifications

For each database/environment, apply the additive `prisma/sql/20261015_notifications.sql` manually, run `npx prisma generate`, then run `npm run notifications:init` **before starting the updated app**. Initialization is idempotent and baselines existing workflow records so deployment does not send historical handoff alerts. It leaves existing inbox messages untouched. The command uses `.env` when present, or the environment's existing database variables.

Notifications are private to the signed-in user. Workflow changes are delivered through the activity log; unprocessed entries are retried when the app polls. Task reminders are generated once per due date and assignee for tasks due today or overdue, using the app's UTC date-only convention. While an authenticated app is visible, it polls every 30 seconds and on focus. Email, browser push, and closed-app/background scheduling are outside this initial in-app version. Sound is opt-in for the current browser session.


### Email notifications with Resend

Set `NOTIFICATION_EMAIL_ENABLED=false` to pause email sending and enqueueing while preserving in-app notifications. This is set locally during app load testing. Existing pending deliveries are retained; review them before re-enabling email. Apply the same setting and redeploy any deployment that should also pause email.

Email uses the same per-user routing as the in-app inbox: new-deal quote checks, pricing-ready salesperson handoffs, ball-in-court changes, due tasks, and billing deposit/payment alerts. Each recipient receives a separate email with a link to the record. Existing inbox history is never backfilled.

1. Apply `prisma/sql/20261020_notification_emails.sql` manually and run `npx prisma generate`.
2. Set these **server-only Production** environment variables in the Vercel project serving the app (local `.env` values do not sync to Vercel):
   - `RESEND_API_KEY`: a Resend key with Sending access to the verified domain.
   - `NOTIFICATION_EMAIL_FROM`: `HSS Kitchens <notifications.hss@apps.klyneandco.com>`.
   - `APP_URL`: `https://hss-app-kappa.vercel.app` (HTTPS origin only).
   - `CRON_SECRET`: a random secret of at least 32 characters. Vercel sends this as the cron Bearer credential.
3. Run `npm run notifications:email:init` with that database and configuration, then deploy. Initialization is idempotent, enables future alerts only, and leaves old inbox records untouched. Keep the Resend key out of client code and version control. Do not configure live email credentials on unrelated preview/test deployments sharing the production database.

New workflow alerts are sent after their business actions commit. Retries also run during inbox polling. `vercel.json` schedules `/api/cron/notifications` daily at 15:00 UTC (09:00 Guatemala time), which generates due/overdue task reminders for active assignees and drains queued email even if nobody has the app open. The daily schedule works on Vercel Hobby; a plan supporting more frequent cron can run this same secured endpoint more often. Cron configuration takes effect after deployment. `npm run notifications:email:send` drains up to 25 pending jobs for maintenance.

`NotificationEmail` is a durable outbox with an atomic worker lease and a frozen payload. Transient failures retry using the same Resend idempotency key; expired uncertain deliveries stop before Resend's 24-hour deduplication window to avoid duplicates. Permanent failures are retained with a sanitized error code for diagnosis. Inactive or changed email recipients and unsent notices older than 24 hours are skipped. `sent` means Resend accepted the email; delivery/bounce details remain available in the Resend dashboard. No old notifications are emailed when enabling this feature.

### Opt-in app volume test

`scripts/stress-app.ts` creates labeled, synthetic fixtures and saves exact run IDs and results in ignored `qa-reports/`. It requires `NOTIFICATION_EMAIL_ENABLED=false`, uses the existing Joseph Castillo review account, and never deletes fixtures automatically. Do not run it against another database without confirming that test data belongs there.

Run using `node --env-file-if-exists=.env --import tsx scripts/stress-app.ts <mode>`:

- `setup`: initial linked customers, intakes, orders, invoices, POs, deliveries, tasks and service issues.
- `volume`: expand that run to 5,000 intakes and 25,000 intake items; safe to resume an interrupted expansion.
- `workflow`: real database checks for RFQs, payment gates, sales-order confirmation, POs, delivery, service notes and in-app reminders. Run once per setup.
- `http`: read-only local production-build tests at 5, 20 and 50 concurrent requests, with global search/sort checks. This uses a signed test session for the review account and never prints its token. It does not measure deployed Vercel capacity or simulate provider email throughput.

Leave fixtures and manifests intact until the user has reviewed them and authorizes cleanup. Any later cleanup must use the exact run IDs, including browser-created record IDs and upload storage paths, rather than deleting all records that happen to contain a generic test label.

### Approved eight-step workflow

Before deploying the October 21 workflow changes, run `node --env-file=.env --import tsx scripts/apply-approved-workflow.ts` against the target database. The additive, repeatable migration adds client quote evidence to deals and preserves historical order quote/sales-order fields. Client Quote now records creation and sending before Confirm Deal; obsolete order quote, agreed-terms and sales-order gates no longer control purchasing or closeout.

### Automatic custom payment terms (October 22)

Set server-only `ANTHROPIC_API_KEY` and `SESSION_SECRET` locally and on the serving Vercel project. `ANTHROPIC_TERMS_MODEL` defaults to `claude-haiku-5-5`; set it to a supported structured-output model if your Anthropic account requires a different model. No key is exposed to the browser.

Apply `prisma/sql/20261022_structured_payment_terms.sql`, generate Prisma, then run `node --env-file=.env --import tsx scripts/apply-payment-terms.ts --apply` once before starting the updated app. This reconciles derived workflow statuses with the corrected deposit rule, preserving payments, invoices, original terms, manual stuck/complete states and concurrent edits. Running without `--apply` reports proposed status changes (and ensures the additive column exists).

Custom terms convert automatically after a brief typing pause in intake, deal confirmation, and the Payment editor. The interpreted schedule appears inline; existing submit/save applies it. Ambiguous terms, failed conversions, stale or unsigned interpretations cannot be applied. The original wording is retained and applying an order edit is audited with the acting user/date/model. Conversion has no direct write access, creates no invoices, and never sends emails. Blank terms use the account deposit percentage for **both standard orders and projects**; custom terms override that default, including full upfront or explicitly deferred payment. Existing free-text notes are not silently interpreted or applied in bulk.

Before purchasing, the shared gate calculates the agreed pre-purchase milestones in integer cents and checks actual paid invoices; it does not require the balance merely because the record is a standard order. Remaining milestones are retained as the payment schedule; invoice entry and payment reconciliation remain manual.

Invoice editing uses the same pencil control on records, billing tables and billing kanban cards. Amount/date edits and confirmed deletion require `payments.edit`, reject stale snapshots, and reconcile the order’s payment gate in the same transaction. Editing a paid amount changes the received total. **Mark unpaid removes the paid invoice itself**, including when moving a paid billing card to an unpaid status; its confirmation explains the removal. These actions affect the HSS record, not the invoice in QuickBooks. The activity log retains the prior invoice values. No records are deleted merely by opening an editor or confirmation.
# Account payment terms prerequisite

Before either direct intake or Confirm Deal creates an order, the customer account must have explicitly saved payment terms. In Phone Book → customer → Edit, choose Account payment terms and save. Missing terms block order creation even when the deal has custom terms; intake opportunities can still be captured. Once the account is configured, deal-specific terms override its default.

Apply `prisma/sql/20261022_account_payment_terms.sql` before deploying this change. Existing accounts remain unconfirmed because the former automatic 30% default does not establish that terms were agreed. No invoices, payments, or email notifications are created by this migration. The payment gate shows a setup requirement instead of inventing an amount when an existing order has neither agreed deal terms nor confirmed account terms.

### Production/testing mode

`MODE` defaults to `production`. Set `MODE=dev` to select the restricted `TEST_DATABASE_URL` and `testing` schema automatically, use the testing upload bucket and session secret, and show a testing label. Team names, emails and passwords are synchronized; business records and roles stay separate. Normal email can be enabled, while labeled load-test notifications never create email jobs. Seed, verification and maintenance scripts also honor mode; QA fixture writers refuse production. See [Testing environment and Moishy's Vercel handoff](docs/TESTING_ENVIRONMENT.md) before deploying or running database migrations.
