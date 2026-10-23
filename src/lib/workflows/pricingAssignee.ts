import { stageAssignee, STAGE_ASSIGNEE_KEYS } from "../stageAssignments";
import type { Prisma } from "@prisma/client";

const PRICING_STATUSES = new Set(["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"]);

export function isPricingWork(status: string): boolean {
  return PRICING_STATUSES.has(status);
}

/** Supplier Quotes owns new RFQ work; existing item assignments stay intact. */
export async function getDefaultPricingAssignee(db: Prisma.TransactionClient): Promise<string | null> {
  const [setting, users] = await Promise.all([
    db.appSetting.findUnique({ where: { key: STAGE_ASSIGNEE_KEYS.pricing } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, active: true } }),
  ]);
  return stageAssignee("pricing", null, users, { [STAGE_ASSIGNEE_KEYS.pricing]: setting?.value })?.id ?? null;
}
