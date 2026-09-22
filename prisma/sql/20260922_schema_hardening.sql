-- Schema hardening pass (reliability/audit items 20, 21, 22, 25, 26).
--
-- Applied to Supabase by hand by the orchestrator (apply_migration). The
-- whole file is idempotent, following the style of the earlier files in this
-- folder: every ADD COLUMN / CREATE INDEX is guarded with IF NOT EXISTS, every
-- ADD CONSTRAINT is wrapped in a DO $$ block that checks pg_constraint by
-- name first, and there is no destructive DDL. Safe to re-run.
--
-- Contents:
--   1. updatedAt columns (item 20)
--   2. ActivityLog.userId (item 21)
--   3. CHECK constraints on the string-enum columns, added NOT VALID so
--      existing rows are never re-validated on add (item 22) - see the
--      commented VALIDATE CONSTRAINT block at the end for the orchestrator
--      to run by hand once production data has been checked against each
--      column's value list.
--   4. New indexes (item 25)
--   5. One-default-location-per-company partial unique index (item 26)

-- ---------------------------------------------------------------------------
-- 1. updatedAt columns
-- ---------------------------------------------------------------------------

ALTER TABLE "Opportunity"    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LineItem"       ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order"          ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PurchaseOrder"  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Delivery"       ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment"        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task"           ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ServiceIssue"   ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Company"        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Contact"        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 2. ActivityLog.userId (real link alongside the userName display snapshot)
-- ---------------------------------------------------------------------------

ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_userId_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- ---------------------------------------------------------------------------
-- 3. CHECK constraints on string-enum columns
--
-- Added NOT VALID: the constraint applies to every future INSERT/UPDATE
-- immediately, but existing rows are not scanned/validated when the
-- constraint is added, so this step cannot fail or block on bad legacy data.
-- Value lists are the full vocabularies from src/lib/constants.ts and the
-- module-local lists noted inline - every value grepped from src/ that the
-- app can write, including ones outside the primary dropdown (e.g. "won" /
-- "lost", which are set by dedicated close actions, not the stage picker).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- User.role - USER_ROLES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_role_check') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_role_check"
      CHECK ("role" IN ('admin', 'sales', 'purchasing', 'billing', 'design', 'viewer')) NOT VALID;
  END IF;

  -- Company.type - COMPANY_TYPES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_type_check') THEN
    ALTER TABLE "Company" ADD CONSTRAINT "Company_type_check"
      CHECK ("type" IN ('lead', 'customer', 'lost_lead', 'vendor', 'supplier', 'installer', 'delivery_partner')) NOT VALID;
  END IF;

  -- Opportunity.stage - OPPORTUNITY_STAGES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_stage_check') THEN
    ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stage_check"
      CHECK ("stage" IN ('new', 'info_missing', 'estimating', 'proposal_sent', 'revisions_needed', 'negotiation', 'won', 'lost')) NOT VALID;
  END IF;

  -- LineItem.rfqStatus - RFQ_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_rfqStatus_check') THEN
    ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_rfqStatus_check"
      CHECK ("rfqStatus" IN ('needs_pricing', 'rfq_sent', 'quote_received', 'priced_in_autoquotes', 'approved', 'removed')) NOT VALID;
  END IF;

  -- LineItem.stockStatus - STOCK_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_stockStatus_check') THEN
    ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_stockStatus_check"
      CHECK ("stockStatus" IN ('in_stock', 'backordered')) NOT VALID;
  END IF;

  -- LineItem.deliveryStatus - DELIVERY_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_deliveryStatus_check') THEN
    ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_deliveryStatus_check"
      CHECK ("deliveryStatus" IN ('pending', 'ordered', 'backordered', 'in_transit_to_hss', 'in_transit_to_client', 'arrived_complete')) NOT VALID;
  END IF;

  -- Order.status - ORDER_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_status_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check"
      CHECK ("status" IN ('new', 'awaiting_payment', 'payment_received', 'pos_in_progress', 'in_transit', 'delivery_scheduled', 'delivered', 'complete', 'stuck')) NOT VALID;
  END IF;

  -- PurchaseOrder.status - PO_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_status_check') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_status_check"
      CHECK ("status" IN ('draft', 'sent', 'acknowledged', 'shipped', 'received')) NOT VALID;
  END IF;

  -- Delivery.status - DELIVERY_LEG_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_status_check') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_status_check"
      CHECK ("status" IN ('pending', 'scheduled', 'in_transit', 'delivered_partial', 'delivered_full')) NOT VALID;
  END IF;

  -- Delivery.mode - DELIVERY_MODES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Delivery_mode_check') THEN
    ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_mode_check"
      CHECK ("mode" IN ('manufacturer_to_customer', 'hss_to_customer', 'manufacturer_to_hss_to_customer')) NOT VALID;
  END IF;

  -- Payment.type - PAYMENT_TYPES (src/app/orders/utils.tsx)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_type_check') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_type_check"
      CHECK ("type" IN ('deposit', 'final', 'full')) NOT VALID;
  END IF;

  -- Payment.status - documented in docs/DATA_MODEL.md (no exported constant
  -- list / isValidValue guard exists for this column in the app today).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_status_check') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_status_check"
      CHECK ("status" IN ('pending', 'invoiced', 'paid')) NOT VALID;
  END IF;

  -- Task.status - TASK_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_status_check') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_status_check"
      CHECK ("status" IN ('not_started', 'in_progress', 'done', 'stuck')) NOT VALID;
  END IF;

  -- Task.priority - TASK_PRIORITIES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_priority_check') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_priority_check"
      CHECK ("priority" IN ('low', 'medium', 'high', 'critical')) NOT VALID;
  END IF;

  -- ServiceIssue.status - SERVICE_ISSUE_STATUSES (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_status_check') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_status_check"
      CHECK ("status" IN ('open', 'in_progress', 'resolved', 'closed')) NOT VALID;
  END IF;

  -- ServiceIssue.priority - TASK_PRIORITIES, reused (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceIssue_priority_check') THEN
    ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_priority_check"
      CHECK ("priority" IN ('low', 'medium', 'high', 'critical')) NOT VALID;
  END IF;

  -- Document.kind - DOCUMENT_KINDS (src/lib/constants.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_kind_check') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_kind_check"
      CHECK ("kind" IN ('quote', 'invoice', 'drawing', 'po', 'tracking', 'other')) NOT VALID;
  END IF;

  -- Document.source - link | upload | google_drive (src/app/files/actions.ts, src/app/intake/actions.ts)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_source_check') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_source_check"
      CHECK ("source" IN ('link', 'upload', 'google_drive')) NOT VALID;
  END IF;

  -- Contact.status - CONTACT_STATUSES (src/app/contacts/_ui.tsx)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contact_status_check') THEN
    ALTER TABLE "Contact" ADD CONSTRAINT "Contact_status_check"
      CHECK ("status" IN ('active', 'onboarding', 'inactive')) NOT VALID;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Opportunity_primaryContactId_idx" ON "Opportunity"("primaryContactId");
CREATE INDEX IF NOT EXISTS "Order_contactId_idx"              ON "Order"("contactId");
CREATE INDEX IF NOT EXISTS "Order_ownerId_idx"                ON "Order"("ownerId");
CREATE INDEX IF NOT EXISTS "LineItem_assigneeId_idx"          ON "LineItem"("assigneeId");
CREATE INDEX IF NOT EXISTS "TaskComment_authorId_idx"         ON "TaskComment"("authorId");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx"                 ON "Task"("dueDate");

-- ---------------------------------------------------------------------------
-- 5. One default Location per Company (partial unique index - Prisma cannot
--    express this in the schema; see the comment on Location.isDefault).
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "Location_one_default_per_company"
  ON "Location" ("companyId") WHERE "isDefault";

-- ---------------------------------------------------------------------------
-- VALIDATE CONSTRAINT statements (run by hand, after checking production data
-- against each value list above - the orchestrator's job, not this file's).
-- Each one takes a lock and scans the table, so run them individually rather
-- than inside the DO block above, and expect the first run on a large table
-- to take a moment. Safe to re-run - VALIDATE CONSTRAINT on an already-valid
-- constraint is a no-op.
-- ---------------------------------------------------------------------------

-- ALTER TABLE "User" VALIDATE CONSTRAINT "User_role_check";
-- ALTER TABLE "Company" VALIDATE CONSTRAINT "Company_type_check";
-- ALTER TABLE "Opportunity" VALIDATE CONSTRAINT "Opportunity_stage_check";
-- ALTER TABLE "LineItem" VALIDATE CONSTRAINT "LineItem_rfqStatus_check";
-- ALTER TABLE "LineItem" VALIDATE CONSTRAINT "LineItem_stockStatus_check";
-- ALTER TABLE "LineItem" VALIDATE CONSTRAINT "LineItem_deliveryStatus_check";
-- ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_status_check";
-- ALTER TABLE "PurchaseOrder" VALIDATE CONSTRAINT "PurchaseOrder_status_check";
-- ALTER TABLE "Delivery" VALIDATE CONSTRAINT "Delivery_status_check";
-- ALTER TABLE "Delivery" VALIDATE CONSTRAINT "Delivery_mode_check";
-- ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_type_check";
-- ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_status_check";
-- ALTER TABLE "Task" VALIDATE CONSTRAINT "Task_status_check";
-- ALTER TABLE "Task" VALIDATE CONSTRAINT "Task_priority_check";
-- ALTER TABLE "ServiceIssue" VALIDATE CONSTRAINT "ServiceIssue_status_check";
-- ALTER TABLE "ServiceIssue" VALIDATE CONSTRAINT "ServiceIssue_priority_check";
-- ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_kind_check";
-- ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_source_check";
-- ALTER TABLE "Contact" VALIDATE CONSTRAINT "Contact_status_check";
