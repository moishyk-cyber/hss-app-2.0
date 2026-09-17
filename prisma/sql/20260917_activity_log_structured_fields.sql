-- Reliability spec P0-2 (audit log): structured before/after fields on
-- ActivityLog, plus indexes for the Admin audit view's actor/action filters.
-- Idempotent - safe to run more than once.

ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "previousValue" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "newValue" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "sourceScreen" TEXT;

CREATE INDEX IF NOT EXISTS "ActivityLog_userName_idx" ON "ActivityLog" ("userName");
CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog" ("action");
