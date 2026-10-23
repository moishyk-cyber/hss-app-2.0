-- Apply in public and testing before deploying the generated Prisma client.
-- Keep sales ownership separate from the current workflow assignment.
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "courtAssigneeId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "courtStep" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courtAssigneeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courtStep" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "Opportunity_courtAssigneeId_idx" ON "Opportunity" ("courtAssigneeId");
CREATE INDEX IF NOT EXISTS "Order_courtAssigneeId_idx" ON "Order" ("courtAssigneeId");
-- Existing deals may have been reassigned: use the original submission audit where available.
UPDATE "Opportunity" o SET "createdById" = COALESCE(
  (SELECT a."userId" FROM "ActivityLog" a WHERE a."linkedType"='opportunity' AND a."linkedId"=o.id AND a.action='intake_submitted' AND a."userId" IS NOT NULL ORDER BY a.at ASC LIMIT 1),
  o."salespersonId") WHERE o."createdById" IS NULL;
UPDATE "Order" o SET "createdById" = COALESCE(
  (SELECT d."createdById" FROM "Opportunity" d WHERE d.id=o."opportunityId"), o."ownerId") WHERE o."createdById" IS NULL;
