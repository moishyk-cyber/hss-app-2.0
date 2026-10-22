-- Additive only: existing written terms stay unchanged until explicitly edited.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentPlan" JSONB;
