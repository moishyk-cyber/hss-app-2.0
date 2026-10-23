# Live in-app notifications

Notifications now use a continuous, authenticated server-sent event stream at `/api/notifications/stream`. Supabase Postgres Changes delivers committed Notification INSERT/UPDATE events to the app server over a shared server-only WebSocket. The server forwards only the signed-in user's updates. No Supabase key is shipped to the browser, no client-supplied recipient is trusted, and notification tables remain unavailable to browser roles.

The browser no longer polls `/api/notifications` every 30 seconds, refetches on focus, or refreshes the page automatically when a notification arrives. The live stream pushes the row and authoritative counts; the badge, inbox rows and new-notification pop-ups update locally. Search/filter navigation, scrolling to load older records and the explicit Refresh button still perform their normal user-requested reads.

Pop-ups appear at the bottom center with the app's charcoal surface, red notification bell, larger title and an Open record link. They dismiss after 12 seconds; hovering or keyboard focus keeps them available until dismissed. A maximum of three are shown. Existing save/error messages move above the notification stack rather than overlapping it. Reduced-motion preferences are respected. Optional sound still requires the user's existing Sound toggle.

On first connection, existing history loads quietly. Reconnects announce unseen unread arrivals without repeating known messages. The stream subscribes before reading its consistent initial snapshot so inserts during startup are buffered. Insert/update bursts are coalesced per notification. Idle heartbeats do no database reads. Counts are read only on an actual change or a fresh connection. Separate browser tabs share the server subscription within an instance; each tab receives its own live UI.

A stream rotates after four minutes; native EventSource reconnects and rechecks authentication. Network failures show Reconnecting and retry automatically. There is no polling fallback. Live in-app notifications require an open app tab; email delivery continues through the existing durable email outbox and cron independently.

## Deployment for Moishy

**Only testing has been enabled. Production/Vercel have not been changed.**

1. Apply `prisma/sql/20261023_live_notifications.sql` using an administrative connection with the intended schema first in its search path (`testing` for development; `public` for production). It adds only Notification to `supabase_realtime` and grants the existing privileged server role USAGE/SELECT for this table. It does not grant access to `anon` or `authenticated`, disable RLS, or expose the testing schema through the Data API.
2. Keep the existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (legacy `SUPABASE_SERVICE_ROLE_KEY` is supported as fallback). No NEXT_PUBLIC key, additional service or browser credential is required.
3. Deploy the code. The stream route sets `maxDuration = 300`; streams rotate at 240 seconds. Use Vercel's default Fluid Compute configuration, which supports a 300-second duration on Hobby. If an older project explicitly disables Fluid Compute, Moishy needs to enable it or lower the stream lifetime/duration to that project's supported limit. No Vercel configuration was changed here.
4. Confirm a real workflow handoff produces a pop-up, updates the inbox and notifies only the intended person. Existing cron/email scheduling is unchanged. Supabase and Vercel usage still count toward their existing quotas.

## Verification

- `npm test` covers recipient validation, safe links, quiet initial history, reconnect deduplication, pushed inbox filtering/read state, startup buffering, burst coalescing, cleanup and no idle polling.
- `node --env-file=.env --import tsx scripts/verify-live-notifications.ts` requires MODE=dev and the restricted testing connection. It checks unauthenticated denial, recipient-query tampering, cross-user isolation, committed insert delivery and unread counts against the running local app. It creates labeled qa_stress notifications, sends no emails and retains records for review.
- Actual testing verified Supabase insert delivery (~680 ms), pushed mark-read updates, authenticated SSE delivery (~2 seconds on the current network), and a visible Chrome pop-up/inbox insertion without page refresh. Timing is an observation, not a latency guarantee.

References: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).
