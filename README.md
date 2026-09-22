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

## Environment

Create `.env` with:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (pooled) used by the app |
| `DIRECT_URL` | Direct Postgres connection used by Prisma for schema work |
| `SUPABASE_URL` | Supabase project URL, for file uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key, for file uploads |

The Supabase pair is optional. Without it the app runs normally and the file
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
