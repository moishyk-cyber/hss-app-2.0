-- Lead time becomes a date (the day an item is called for) instead of a day
-- count (docs/PLAN_SALES_ORDERS_DELIVERY.md §A2 originally shipped it as days).
--
-- Idempotent, and non-destructive like 20260903: the old "leadTimeDays" column
-- stays in place (Prisma no longer maps it) and is backfilled into the new
-- date column as "today + N days" so existing estimates are not lost.

ALTER TABLE "LineItem" ADD COLUMN IF NOT EXISTS "leadTimeDate" TIMESTAMP(3);

UPDATE "LineItem"
SET "leadTimeDate" = date_trunc('day', CURRENT_DATE + ("leadTimeDays" * INTERVAL '1 day'))
WHERE "leadTimeDays" IS NOT NULL
  AND "leadTimeDate" IS NULL;
