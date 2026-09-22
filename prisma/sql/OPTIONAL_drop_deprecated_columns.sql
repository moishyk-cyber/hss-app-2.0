-- OPTIONAL and DESTRUCTIVE (reliability/audit item 24). NOT part of the
-- numbered migration history in this folder and NOT applied automatically by
-- anything - the orchestrator runs this by hand, once, only when nobody needs
-- the old values anymore.
--
-- These columns stopped being read or written by the app in earlier passes
-- (see the LineItem and PurchaseOrder model comments in prisma/schema.prisma,
-- and docs/DATA_MODEL.md decision 9): LineItem.leadTimeDays was replaced by
-- leadTimeDate (see 20260908_lead_time_as_date.sql), and the ten PurchaseOrder
-- logistics columns were backfilled into Delivery (see
-- 20260903_sales_orders_delivery.sql). Prisma no longer maps any of them, but
-- the columns themselves were kept in Postgres on purpose, as a safety net,
-- until someone confirms the old values are no longer needed for reference or
-- recovery.
--
-- Before running this: confirm the backfill in 20260903_sales_orders_delivery.sql
-- and 20260908_lead_time_as_date.sql completed cleanly and nothing still reads
-- these columns directly in SQL/BI tooling outside the app. Take a database
-- backup or snapshot first - DROP COLUMN is not reversible.
--
-- Idempotent (IF EXISTS on every DROP) so it is safe to run more than once,
-- but each individual run is still a one-way door for whatever data it drops.

ALTER TABLE "LineItem" DROP COLUMN IF EXISTS "leadTimeDays";

ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "trackingUrl";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "trackingCarrier";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "expectedDelivery";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "trucker";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "pickupAddress";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "scheduledDeliveryDate";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "shipCost";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "chargedToCustomer";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "deliveryContactPhone";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "deliveryStatus";
