-- Optional PO expected date. Item lead times and delivery dates stay separate.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "expectedDate" TIMESTAMP(3);
