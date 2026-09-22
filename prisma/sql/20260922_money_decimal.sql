-- Money columns: DOUBLE PRECISION -> NUMERIC(12,2) (reliability/audit item 18).
--
-- Applied to Supabase by hand by the orchestrator (apply_migration). Converts
-- the eight money columns the schema now declares as
-- `Decimal @db.Decimal(12, 2)`:
--   Opportunity.value, Opportunity.budget
--   LineItem.unitCost, LineItem.unitPrice
--   Order.orderValue, Order.depositRequired
--   Delivery.shipCost
--   Payment.amount
--
-- No data changes: the app has rounded every money write to cents
-- (roundCents in src/lib/money.ts) since the Sep 2 QA round, so each stored
-- value is already a two-decimal amount; round(...::numeric, 2) in the USING
-- clause only strips the binary-float noise (1234.56005859375 -> 1234.56).
-- Nullability is unchanged (ALTER COLUMN ... TYPE keeps NOT NULL / NULL).
--
-- The deprecated PurchaseOrder.shipCost database column (no longer in the
-- Prisma schema, see the baseline file's header) is deliberately left alone.
--
-- DEPLOY TOGETHER WITH THE CODE. The Prisma Client generated from the new
-- schema expects numeric columns and the old one expects double precision;
-- running either client against the other column type errors on read/write.
-- Apply this file and deploy the matching build in the same window.
--
-- Idempotent: each ALTER runs only while the column is not yet numeric
-- (information_schema.columns.data_type), so re-running is a no-op. Each
-- ALTER rewrites its table under an ACCESS EXCLUSIVE lock - these tables are
-- small, so expect it to take a moment at most.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Opportunity' AND column_name = 'value'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Opportunity" ALTER COLUMN "value" TYPE NUMERIC(12,2) USING round("value"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Opportunity' AND column_name = 'budget'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Opportunity" ALTER COLUMN "budget" TYPE NUMERIC(12,2) USING round("budget"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'LineItem' AND column_name = 'unitCost'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "LineItem" ALTER COLUMN "unitCost" TYPE NUMERIC(12,2) USING round("unitCost"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'LineItem' AND column_name = 'unitPrice'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "LineItem" ALTER COLUMN "unitPrice" TYPE NUMERIC(12,2) USING round("unitPrice"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Order' AND column_name = 'orderValue'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Order" ALTER COLUMN "orderValue" TYPE NUMERIC(12,2) USING round("orderValue"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Order' AND column_name = 'depositRequired'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Order" ALTER COLUMN "depositRequired" TYPE NUMERIC(12,2) USING round("depositRequired"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Delivery' AND column_name = 'shipCost'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Delivery" ALTER COLUMN "shipCost" TYPE NUMERIC(12,2) USING round("shipCost"::numeric, 2);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'amount'
               AND data_type <> 'numeric') THEN
    ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
  END IF;
END
$$;
