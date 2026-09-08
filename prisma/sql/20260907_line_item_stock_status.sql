-- Adds pricing-stage stock tracking to LineItem (lead time date + backorder date).
--
-- Applied to Supabase by the orchestrator (apply_migration). Idempotent: the
-- ADD COLUMN and CREATE INDEX are both guarded with IF NOT EXISTS. No
-- destructive DDL.

ALTER TABLE "LineItem" ADD COLUMN IF NOT EXISTS "stockStatus" TEXT NOT NULL DEFAULT 'in_stock';

CREATE INDEX IF NOT EXISTS "LineItem_stockStatus_idx" ON "LineItem"("stockStatus");
