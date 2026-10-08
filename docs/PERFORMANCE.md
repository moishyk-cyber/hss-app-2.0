# Page and record loading

The fast local preview runs on port 3001 in production mode (`npm run preview`), so opening a route
never requires a development compilation. Rebuild and restart after code edits.

The second performance pass addresses data fetching and drawer navigation:

- Prisma's `relationJoins` client feature fetches nested records using database
  joins instead of one network round trip per related table. This is a generated
  client configuration; no database schema changes or migrations are required.
- Team-directory and court-holder lookups share results within each server render.
  Settings and team members load concurrently. No user or permission data is
  cached across requests.
- Navigation and collection record links prefetch their destination on mouse hover
  or keyboard focus. Next.js owns the cache and server-action invalidation.
- Every intercepted record section has a loading boundary inside its drawer layout,
  so the panel opens with a loading state and remains mounted when content arrives.
- Pipeline record queries select only the company/contact/salesperson fields used
  on the screen, and order their items and linked orders explicitly.

Order records now stream supporting sections behind independent Suspense boundaries.
The header, workflow controls, invoice, and tab navigation wait only for the core
record and its team context. Files, service issues, activity, purchase-order details,
delivery details, and company/contact editor choices complete independently.
Core payment and fulfillment facts still load together so the primary action and
completion checks use the complete workflow state.

Independent supporting reads start alongside the core query. PO documents use IDs
already present in the core record and no longer wait for enriched PO details or
the vendor directory. All data remains fresh per request; mutations keep their
existing refresh and authorization behavior. This streams all sections during the
initial request; it does not introduce fetching when a tab is clicked.

Edit Deal fetches the company's locations in the same joined query as the deal,
alongside the dropdown directories and field requirements. This removes the
location query that previously waited for every directory to finish. A read-only
comparison on the same deal verified identical form defaults and choices: median
database time fell from 1,047 ms to 525 ms across three runs. These timings exclude
compilation and browser rendering.

The Edit Deal button uses hover/focus prefetching in production, and both the full
page and drawer have an edit-form loading boundary. Next.js disables link
prefetching in development, so the first visit on port 3000 can still compile.
The production preview on port 3001 avoids that compilation after a rebuild.

## Read-only verification (October 8, 2026)

Median of three comparisons against the same connected database and query shapes:

| Query | Previous strategy | Joined strategy |
| --- | ---: | ---: |
| Pipeline cards | 999 ms | 385 ms |
| Pipeline record | 2,411 ms | 494 ms |
| Orders and workflow relations | 1,703 ms | 908 ms |
| Tasks and subtasks | 704 ms | 347 ms |
| Customer Service and linked records | 1,268 ms | 425 ms |

These are database-query timings, not total page or browser interaction timings.
Network latency varies. Each comparison verified equivalent relation contents;
Pipeline comparisons also verified ordering. All 22 workflow/filter regression
tests, TypeScript, lint and the production build passed.

Repeat without modifying records:

```bash
node --env-file=.env --import tsx scripts/benchmark-relations.ts
```

The joined strategy is a Prisma 6 preview feature. See
[Prisma relation load strategies](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference#relationloadstrategy-preview).
The benchmark retains explicit `query` and `join` modes to check both performance
and data equivalence when updating Prisma.
