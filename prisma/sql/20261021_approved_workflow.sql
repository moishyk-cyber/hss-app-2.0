-- Additive migration. Old order quote/sales-order fields remain historical data only.
DO $$
BEGIN
  ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "clientQuoteCreated" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "clientQuoteSent" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "clientQuoteUrl" TEXT;
  IF NOT EXISTS (SELECT 1 FROM "AppSetting" WHERE "key" = 'workflow.clientQuoteMigrated') THEN
    -- Preserve evidence from existing client-facing proposals and order quote records.
    UPDATE "Opportunity" SET "clientQuoteCreated" = true, "clientQuoteSent" = true
      WHERE "stage" IN ('proposal_sent', 'revisions_needed', 'negotiation');
    UPDATE "Opportunity" AS deal SET
      "clientQuoteCreated" = true, "clientQuoteSent" = true,
      "clientQuoteUrl" = COALESCE(deal."clientQuoteUrl", (
        SELECT o."quoteUrl" FROM "Order" o WHERE o."opportunityId" = deal.id AND o."quoteUrl" IS NOT NULL ORDER BY o."createdAt" DESC LIMIT 1
      ))
      WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."opportunityId" = deal.id AND o."quoteStatus" IN ('sent', 'accepted'));
    INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('workflow.clientQuoteMigrated', '2026-10-21', NOW());
  END IF;
END $$;
