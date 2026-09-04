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

## Layout

| Path | Contents |
| --- | --- |
| `src/app/` | Routes, page components, and their server actions |
| `src/lib/` | Shared rules, formatters, and UI primitives |
| `prisma/schema.prisma` | The data model. See `docs/DATA_MODEL.md` |
| `prisma/sql/` | SQL applied by hand to production, kept as migration history |
| `scripts/` | Maintenance and verification scripts |
| `docs/` | Data model, UX flow, design and build notes |
