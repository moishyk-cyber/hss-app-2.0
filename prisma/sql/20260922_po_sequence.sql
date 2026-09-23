-- PO number allocation (reliability/audit item 23).
--
-- Applied to Supabase by hand by the orchestrator (apply_migration), together
-- with the code that reads Order.poSequence (createPurchaseOrder in
-- src/app/orders/actions.ts). Idempotent and safe to re-run.
--
-- Before: PurchaseOrder.poNumber was nullable, unique only per order
-- (@@unique([orderId, poNumber])), and allocated as PO-<base>-<count+1> with a
-- retry that recomputed the same number on a collision.
-- After:  poNumber is NOT NULL and globally unique, and each order carries a
-- counter (Order.poSequence) that createPurchaseOrder increments atomically to
-- build PO-<jobId or last 6 of order id>-<poSequence>.
--
-- Production data was checked first: no PO has a null poNumber and no number
-- repeats across orders, so steps 3 and 4 cannot fail on existing rows. Step 3
-- still refuses with a clear message if a null has appeared since.
--
-- Contents:
--   1. Order.poSequence
--   2. Backfill poSequence from each order's existing PO numbers
--   3. PurchaseOrder.poNumber NOT NULL
--   4. Global unique index on poNumber (Prisma's default name)
--   5. Drop the old per-order compound unique index (subsumed by 4)

-- ---------------------------------------------------------------------------
-- 1. Order.poSequence - last sequence number handed out for this order
-- ---------------------------------------------------------------------------

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "poSequence" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Backfill: the highest trailing -<n> among the order's POs (0 when none
--    parse). Only ever raises the counter, so a re-run after the app has
--    handed out new numbers never moves a sequence backwards. Suffixes are
--    capped at 9 digits so the ::int cast cannot overflow.
-- ---------------------------------------------------------------------------

UPDATE "Order" AS o
SET "poSequence" = s.max_seq
FROM (
  SELECT "orderId", MAX((substring("poNumber" FROM '-([0-9]{1,9})$'))::int) AS max_seq
  FROM "PurchaseOrder"
  WHERE "poNumber" ~ '-[0-9]{1,9}$'
  GROUP BY "orderId"
) AS s
WHERE o."id" = s."orderId"
  AND o."poSequence" < s.max_seq;

-- ---------------------------------------------------------------------------
-- 3. poNumber NOT NULL
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'PurchaseOrder' AND column_name = 'poNumber'
               AND is_nullable = 'YES') THEN
    IF EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE "poNumber" IS NULL) THEN
      RAISE EXCEPTION 'PurchaseOrder rows with a null poNumber exist - number them before applying this file';
    END IF;
    ALTER TABLE "PurchaseOrder" ALTER COLUMN "poNumber" SET NOT NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Globally unique poNumber (the schema's `poNumber String @unique`)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- ---------------------------------------------------------------------------
-- 5. The old @@unique([orderId, poNumber]) index is gone from the schema -
--    the global index above already guarantees it.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "PurchaseOrder_orderId_poNumber_key";
