-- Invoice tracking: additive only; received date and existing records stay intact.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Payment_status_dueDate_idx" ON "Payment" ("status", "dueDate");
