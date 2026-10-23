-- Run once per app schema (testing, then public when deploying the feature).
-- Set the connection search_path/schema explicitly; app runtime roles cannot run DDL.
-- Add Customer PO and the existing Sales Order type without changing saved files.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_kind_check";
ALTER TABLE "Document" ADD CONSTRAINT "Document_kind_check"
  CHECK ("kind" IN ('quote', 'invoice', 'sales_order', 'drawing', 'po', 'customer_po', 'tracking', 'other')) NOT VALID;
COMMIT;
