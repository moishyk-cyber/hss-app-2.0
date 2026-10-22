# Production and testing in one Supabase project

`MODE` accepts `dev` or `production` (`prod` is also accepted). Unset means production. Restart/redeploy after changing it.

| Behavior | Production/default | `MODE=dev` |
|---|---|---|
| Database | `DATABASE_URL`, `public` schema | `TEST_DATABASE_URL`, `testing` schema, restricted `hss_testing` login |
| Upload bucket | `order-files` | `order-files-testing` |
| Sessions | `SESSION_SECRET` | `DEV_SESSION_SECRET` |
| Email links | `APP_URL` | `TEST_APP_URL` if set, otherwise `APP_URL` |
| UI | Normal app | Testing label |

There is no production-database fallback in dev mode. The testing login has no direct permissions on production tables. Testing is not exposed through Supabase's public Data API. Both schemas still share compute and database resources; avoid heavy concurrent load tests while the client is working.

## Moishy's Vercel setup

The production Vercel project remains on its production Git branch. The new testing Vercel project should deploy `dev` from the same repository and root directory (`hss-app` if the repository contains the parent folder).

Verify that production tracks the approved release branch (normally `main`), rather than `dev`. Both Vercel projects must not automatically publish the same `dev` pushes to production; release only after client approval.

Production variables:

- `MODE=production`, or leave it unset.
- Keep the production `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, Supabase storage credentials, Resend credentials, and `APP_URL=https://hss-app-kappa.vercel.app`.
- `NOTIFICATION_EMAIL_ENABLED=true` to resume normal email notifications.

Testing variables:

- Use the private local `.env.testing` file as the starting point. Do not commit it or paste its secrets into chat.
- `MODE=dev`.
- `TEST_DATABASE_URL` is the restricted testing connection. Use that same connection for `DATABASE_URL`/`DIRECT_URL` in the testing Vercel project if required by Prisma tooling; never give the testing deployment the production database credential.
- `DEV_SESSION_SECRET` and testing `CRON_SECRET` come from `.env.testing`. Sessions are separate even though team sign-in credentials are synchronized.
- Keep `SUPABASE_URL` and its server-only storage key. The bucket changes automatically with MODE.
- Set `APP_URL` to the new testing project's actual HTTPS origin. Remove `TEST_APP_URL` or set it to that same origin. The local HTTP URL in the supplied file deliberately does not produce email links.
- `NOTIFICATION_EMAIL_ENABLED=true` allows ordinary test emails after a valid HTTPS URL is configured. The private Resend key and sender can be reused.
- Keep the existing Anthropic variables if testing custom payment terms.

Vercel configuration and deployment are left for Moishy. These changes have not been pushed, merged, or deployed by this transfer.

## Identity synchronization

Existing team members are copied. Database triggers synchronize name, email and password hash in both directions for existing production users. New production users are mirrored into testing. Deleting/disabling a production user disables that testing sign-in. New testing-only users are not created in production. Roles and ordinary business data remain independent. Updating a real team member's name/email/password in testing changes that same identity in production intentionally; use test-only users for experiments with credentials.

Only narrowly scoped, security-definer trigger functions can write those production identity fields. The testing login cannot query or update production tables directly and cannot alter the schema or these functions. Apply schema migrations through controlled administrator tooling with an explicit schema target; do not run public-qualified SQL migration files blindly against testing.

## Email and volume tests

Normal email notifications can be enabled. Notification kinds `qa_stress` and notices containing `[LOAD TEST]` remain in-app only. Historical copied email jobs are marked skipped, so moving the old stress dataset does not send it again. `BULK_TEST_MODE=true` suppresses email delivery and enqueueing. Fixture/stress scripts also require `MODE=dev`, the restricted testing connection, and their existing paused-email checks where applicable.

## Recovery and transfer evidence

`qa-reports/testing-transfer/` is ignored by Git, with a private recovery archive containing the selected test rows, dependencies and team sign-in hashes, copied-upload backups, and a transfer report. Keep it private. The transfer copies and compares rows/files before removing exact recorded IDs from production. Non-test production rows are fingerprinted before and after cleanup. Real dependencies and team members are copied, not removed. Carrier/trucker cleanup removes only `[LOAD TEST]` entries.

The old isolated notification simulation schema is archived and its records are moved into testing too. No Supabase database branch or paid compute instance is created.

Do not drop/reset the testing schema while the identity-sync triggers exist on production's User table. Remove those triggers deliberately before recreating the environment; otherwise production team edits could fail.
