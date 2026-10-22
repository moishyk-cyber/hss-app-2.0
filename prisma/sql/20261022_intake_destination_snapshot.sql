-- Preserve the intake address while fulfillment can select another destination.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "intakeDeliveryAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "intakeLocationName" TEXT;
UPDATE "Order" o SET "intakeDeliveryAddress" = COALESCE(d."deliveryAddress", o."deliveryAddress", l.address), "intakeLocationName" = COALESCE(d."locationName", l.name)
FROM "Opportunity" d LEFT JOIN "Location" l ON l.id = d."locationId"
WHERE o."opportunityId" = d.id AND o."companyId" = d."companyId" AND o."intakeDeliveryAddress" IS NULL;
UPDATE "Order" o SET "intakeDeliveryAddress" = COALESCE(o."deliveryAddress", l.address), "intakeLocationName" = l.name
FROM "Location" l WHERE o."locationId" = l.id AND o."companyId" = l."companyId" AND o."intakeDeliveryAddress" IS NULL;
UPDATE "Order" SET "intakeDeliveryAddress" = "deliveryAddress" WHERE "intakeDeliveryAddress" IS NULL;
