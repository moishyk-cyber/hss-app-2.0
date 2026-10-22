-- Shared delivery requirements on every intake; additive and safe to rerun.
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "floorNote" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryType" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "openingSize" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "installationNeeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "floorNote" TEXT;
-- Preserve existing linked project delivery requirements during the rollout.
UPDATE "Order" o SET "deliveryType" = d."deliveryType", "openingSize" = d."openingSize", "installationNeeded" = d."installationNeeded", "floorNote" = d."floorNote"
FROM "Opportunity" d WHERE o."opportunityId" = d.id AND o."deliveryType" IS NULL;
