# Automatic workflow assignments

Each deal/order has one current `courtAssigneeId` and `courtStep`. These are separate from the deal's salesperson and the order's owner. My Items and dashboard counts use the current assignment; sales ownership remains intact.

Admin → Settings → Ball in court configures one active person per stage. Defaults are Herman Freund for Intake; Chaim Schwartz for Supplier Quotes, Client Quote, Purchase and Close Out; Mrs Golderberger (the existing account spelling) for Payment; Sam Freund for Delivery. Confirm Deal uses the per-deal salesperson, initially the authenticated intake creator. Reassign the salesperson on the deal to change who closes it. Anyone with intake permission can still create intakes.

Settings use `court.<step>.assigneeId`. Legacy role and comma-separated person settings are ignored. Supplier Quotes is also the default for newly created RFQ items; existing item assignments are preserved. A configured user becoming inactive leaves the stage unassigned until an administrator selects an active teammate.

Ordinary record edits synchronously reconcile assignment, notification state and in-app notification in a serializable transaction before returning. Email dispatch remains asynchronous with its existing durable outbox/retry behavior. Failed processing retains the activity-log retry job. Changes to the stage settings bulk-transfer existing cards in that stage after the settings response. Repeated saves of the same facts do not generate duplicate notices. Linked won intakes mirror their order's assignment. Completed/lost work has no current assignee; removing a payment recomputes the assignment from actual prerequisites.

## Deployment (Moishy)

The SQL migration has been applied **only in `testing`**. Production is unchanged. Before deploying this code against `public`:

1. Apply `prisma/sql/20261022_stage_assignments.sql` with an administrative connection and the intended schema's search path. It adds three nullable fields and an assignment index to Opportunity and Order, and recovers immutable intake creator IDs from intake audit records where available.
2. Generate Prisma Client (`npx prisma generate`).
3. With writes briefly paused in the target environment, run `node --env-file=.env --import tsx scripts/initialize-stage-assignments.ts` with the appropriate MODE/connection. This preserves existing configured single-person settings, persists the requested defaults for unset stages, baselines current assignments and notification snapshots, and sends no historical alerts. Do not run this maintenance baseline concurrently with live mutations: it intentionally replaces current notification snapshots.
4. Deploy/restart the app, then resume writes. Do not deploy before the schema migration and baseline; My Items requires the new assignment fields and data.

No Vercel settings have been changed.

## Verification

`npm test` includes defaults, active-user validation, all eight handoffs, salesperson reassignment, linked records, payment reversal, complete/reopen, snapshot deduplication, retry rollback and silent rollout baseline coverage.

`node --env-file=.env --import tsx scripts/verify-stage-assignments.ts` requires MODE=dev and the restricted testing connection. It creates labeled review fixtures, exercises all stage transitions plus the authenticated RFQ endpoint, checks persisted assignment and recipient state, verifies no QA email jobs, and leaves the order in Close Out. Results are written to ignored `qa-reports/stage-assignments/verification.json`. It does not delete existing test records.
