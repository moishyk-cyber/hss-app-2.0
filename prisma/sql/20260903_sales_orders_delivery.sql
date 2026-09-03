-- Sales -> Orders -> Delivery -> Service foundation (docs/PLAN_SALES_ORDERS_DELIVERY.md, §1).
--
-- Applied to Supabase by the orchestrator (apply_migration). The whole file is
-- idempotent: every CREATE / ADD COLUMN is guarded with IF NOT EXISTS, foreign
-- keys are added only when the constraint name is missing, and every backfill
-- only touches rows that have not been backfilled yet. Safe to re-run.
--
-- Naming follows what `prisma migrate` would have produced (quoted PascalCase
-- tables, camelCase columns, TEXT ids, TIMESTAMP(3), DOUBLE PRECISION,
-- "<Table>_<col>_fkey" / "<Table>_<col>_idx" / "<Table>_<cols>_key") so the
-- database matches prisma/schema.prisma exactly.
--
-- No destructive DDL: the deprecated PurchaseOrder logistics columns stay in
-- place (see plan §1 - they are backfilled into Delivery below and dropped in
-- a later pass).

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

-- Location: a physical site belonging to a business.
CREATE TABLE IF NOT EXISTS "Location" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "address"       TEXT NOT NULL,
  "deliveryNotes" TEXT,
  "contactName"   TEXT,
  "contactPhone"  TEXT,
  "isDefault"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Location_companyId_idx" ON "Location"("companyId");
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;

-- Delivery: one delivery leg (default one per PO; splittable).
CREATE TABLE IF NOT EXISTS "Delivery" (
  "id"                    TEXT NOT NULL,
  "orderId"               TEXT NOT NULL,
  "purchaseOrderId"       TEXT,
  "mode"                  TEXT NOT NULL DEFAULT 'manufacturer_to_hss_to_customer',
  "status"                TEXT NOT NULL DEFAULT 'pending',
  "trackingCarrier"       TEXT,
  "trackingUrl"           TEXT,
  "expectedDelivery"      TIMESTAMP(3),
  "trucker"               TEXT,
  "pickupAddress"         TEXT,
  "scheduledDeliveryDate" TIMESTAMP(3),
  "shipCost"              DOUBLE PRECISION,
  "chargedToCustomer"     BOOLEAN NOT NULL DEFAULT false,
  "deliveryContactPhone"  TEXT,
  "deliveredAt"           TIMESTAMP(3),
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Delivery_orderId_idx" ON "Delivery"("orderId");
CREATE INDEX IF NOT EXISTS "Delivery_purchaseOrderId_idx" ON "Delivery"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "Delivery_status_idx" ON "Delivery"("status");
ALTER TABLE "Delivery" ENABLE ROW LEVEL SECURITY;

-- ServiceIssue: the customer-service log.
CREATE TABLE IF NOT EXISTS "ServiceIssue" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT,
  "locationId"  TEXT,
  "orderId"     TEXT,
  "lineItemId"  TEXT,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'open',
  "priority"    TEXT NOT NULL DEFAULT 'medium',
  "assigneeId"  TEXT,
  "reportedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),
  "resolution"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceIssue_status_idx" ON "ServiceIssue"("status");
CREATE INDEX IF NOT EXISTS "ServiceIssue_assigneeId_idx" ON "ServiceIssue"("assigneeId");
CREATE INDEX IF NOT EXISTS "ServiceIssue_orderId_idx" ON "ServiceIssue"("orderId");
CREATE INDEX IF NOT EXISTS "ServiceIssue_companyId_idx" ON "ServiceIssue"("companyId");
CREATE INDEX IF NOT EXISTS "ServiceIssue_locationId_idx" ON "ServiceIssue"("locationId");
CREATE INDEX IF NOT EXISTS "ServiceIssue_lineItemId_idx" ON "ServiceIssue"("lineItemId");
ALTER TABLE "ServiceIssue" ENABLE ROW LEVEL SECURITY;

-- RolePermission: per-role override of the shipped permission matrix.
CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id"         TEXT NOT NULL,
  "role"       TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "allowed"    BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_role_permission_key"
  ON "RolePermission"("role", "permission");
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;

-- AppSetting: key/value app settings.
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Column additions on existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "locationId"   TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "termsNotes"   TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteStatus"  TEXT NOT NULL DEFAULT 'not_needed';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteUrl"     TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteSentAt"  TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Order_locationId_idx" ON "Order"("locationId");

ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
CREATE INDEX IF NOT EXISTS "Opportunity_locationId_idx" ON "Opportunity"("locationId");

ALTER TABLE "LineItem" ADD COLUMN IF NOT EXISTS "deliveryId" TEXT;
CREATE INDEX IF NOT EXISTS "LineItem_deliveryId_idx" ON "LineItem"("deliveryId");

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "autoQuotesPoNumber" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "source"  TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "dueNote" TEXT;

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "source"      TEXT NOT NULL DEFAULT 'link';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "mimeType"    TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sizeBytes"   INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "storagePath" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "uploadedBy"  TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "note"        TEXT;

-- ---------------------------------------------------------------------------
-- 2b. Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS - guard by name).
--     Required relations: ON DELETE RESTRICT; optional: ON DELETE SET NULL,
--     matching Prisma's defaults.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Location_companyId_fkey') THEN
    ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_orderId_fkey') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_purchaseOrderId_fkey') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_companyId_fkey') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_locationId_fkey') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_orderId_fkey') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_lineItemId_fkey') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_lineItemId_fkey"
      FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_assigneeId_fkey') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_locationId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_locationId_fkey') THEN
    ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_deliveryId_fkey') THEN
    ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_deliveryId_fkey"
      FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill Locations: one default location per company that already has a
--    location name or delivery address. Then link deals/orders whose delivery
--    address is the company's (or is empty) to it.
-- ---------------------------------------------------------------------------

INSERT INTO "Location" ("id", "companyId", "name", "address", "isDefault", "createdAt")
SELECT
  'loc_' || substr(md5(random()::text || c."id"), 1, 20),
  c."id",
  COALESCE(NULLIF(btrim(c."locationName"), ''), 'Main location'),
  -- address is NOT NULL in the schema; a company with only a location name
  -- gets an empty address to fill in from the Locations card.
  COALESCE(NULLIF(btrim(c."deliveryAddress"), ''), NULLIF(btrim(c."billingAddress"), ''), ''),
  true,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE (NULLIF(btrim(c."locationName"), '') IS NOT NULL OR NULLIF(btrim(c."deliveryAddress"), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."companyId" = c."id");

UPDATE "Opportunity" o
SET "locationId" = (
  SELECT l."id" FROM "Location" l
  WHERE l."companyId" = o."companyId" AND l."isDefault" = true
  ORDER BY l."createdAt" ASC
  LIMIT 1
)
FROM "Company" c
WHERE c."id" = o."companyId"
  AND o."locationId" IS NULL
  AND (o."deliveryAddress" IS NULL OR o."deliveryAddress" = c."deliveryAddress")
  AND EXISTS (SELECT 1 FROM "Location" l WHERE l."companyId" = o."companyId" AND l."isDefault" = true);

UPDATE "Order" o
SET "locationId" = (
  SELECT l."id" FROM "Location" l
  WHERE l."companyId" = o."companyId" AND l."isDefault" = true
  ORDER BY l."createdAt" ASC
  LIMIT 1
)
FROM "Company" c
WHERE c."id" = o."companyId"
  AND o."locationId" IS NULL
  AND (o."deliveryAddress" IS NULL OR o."deliveryAddress" = c."deliveryAddress")
  AND EXISTS (SELECT 1 FROM "Location" l WHERE l."companyId" = o."companyId" AND l."isDefault" = true);

-- ---------------------------------------------------------------------------
-- 4. Backfill Deliveries: one per PurchaseOrder, copying its logistics columns.
--    mode: client_direct POs are drop-shipped (manufacturer_to_customer);
--    everything else routes through HSS. status: the old PO deliveryStatus
--    (its vocabulary is a subset of the new one). Then attach the PO's items.
-- ---------------------------------------------------------------------------

INSERT INTO "Delivery" (
  "id", "orderId", "purchaseOrderId", "mode", "status",
  "trackingCarrier", "trackingUrl", "expectedDelivery",
  "trucker", "pickupAddress", "scheduledDeliveryDate", "shipCost", "chargedToCustomer", "deliveryContactPhone",
  "deliveredAt", "createdAt"
)
SELECT
  'dlv_' || substr(md5(random()::text || po."id"), 1, 20),
  po."orderId",
  po."id",
  CASE WHEN po."shipTo" = 'client_direct' THEN 'manufacturer_to_customer' ELSE 'manufacturer_to_hss_to_customer' END,
  CASE
    WHEN po."deliveryStatus" IN ('pending', 'scheduled', 'delivered_partial', 'delivered_full') THEN po."deliveryStatus"
    ELSE 'pending'
  END,
  po."trackingCarrier",
  po."trackingUrl",
  po."expectedDelivery",
  po."trucker",
  po."pickupAddress",
  po."scheduledDeliveryDate",
  po."shipCost",
  COALESCE(po."chargedToCustomer", false),
  po."deliveryContactPhone",
  -- A fully delivered PO gets its scheduled date as the delivered date (best
  -- available fact); partial/other legs stay open.
  CASE WHEN po."deliveryStatus" = 'delivered_full' THEN po."scheduledDeliveryDate" ELSE NULL END,
  po."createdAt"
FROM "PurchaseOrder" po
WHERE NOT EXISTS (SELECT 1 FROM "Delivery" d WHERE d."purchaseOrderId" = po."id");

-- Items on a PO that are not yet on a delivery join the PO's first delivery.
UPDATE "LineItem" li
SET "deliveryId" = (
  SELECT d."id" FROM "Delivery" d
  WHERE d."purchaseOrderId" = li."purchaseOrderId"
  ORDER BY d."createdAt" ASC
  LIMIT 1
)
WHERE li."purchaseOrderId" IS NOT NULL
  AND li."deliveryId" IS NULL
  AND EXISTS (SELECT 1 FROM "Delivery" d WHERE d."purchaseOrderId" = li."purchaseOrderId");

-- ---------------------------------------------------------------------------
-- 5. Backfill Order.paymentTerms so existing orders never nag "terms missing".
--    quoteStatus stays at its 'not_needed' default for existing orders.
-- ---------------------------------------------------------------------------

UPDATE "Order"
SET "paymentTerms" = CASE
  WHEN "depositRequired" = 0 THEN 'on_delivery'
  WHEN "orderType" = 'order' THEN 'full_upfront'
  ELSE 'deposit_balance'
END
WHERE "paymentTerms" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Backfill Payment.source = 'terms' for the rows markOpportunityWon created.
-- ---------------------------------------------------------------------------

UPDATE "Payment"
SET "source" = 'terms'
WHERE "source" = 'manual'
  AND ("notes" ILIKE '%generated on win%' OR "notes" ILIKE '%agreed at close%');
