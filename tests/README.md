# Workflow regression checks

Run `npm test`. Tests call the same pricing, fulfillment, and attachment interfaces used by the server actions, with an isolated in-memory database adapter and storage adapter. No credentials, running application, or live records are needed.

The database adapter models transaction rollback and injects failures between related writes. These tests verify workflow outcomes and post-commit effects; they do not validate PostgreSQL's implementation of serializable isolation or the hosted storage metadata endpoint. Those dependencies remain Prisma/PostgreSQL and Supabase Storage in production.

Permissions and screen-specific audit descriptions remain in server actions. Shared reconciliation and fulfillment writes are transactional; audit entries and view refreshes happen after commit. Serialization conflicts retry up to twice without publishing effects from discarded attempts.

Deal values already entered are preserved. Order totals are recomputed only when all active items have prices. Optional intake attachments remain best effort, and direct uploads are cleaned up when Document recording fails. Signed uploads remain available after a failed recording so the same upload can be finalized again.
