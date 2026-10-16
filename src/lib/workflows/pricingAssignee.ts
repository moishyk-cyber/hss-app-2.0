import type { Prisma } from "@prisma/client";

const PRICING_STATUSES = new Set(["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"]);

export function isPricingWork(status: string): boolean {
  return PRICING_STATUSES.has(status);
}

/** Resolve at creation time so changed defaults apply immediately. An unset,
 * deleted or inactive teammate leaves new pricing work unassigned.
 */
export async function getDefaultPricingAssignee(db: Prisma.TransactionClient): Promise<string | null> {
  const setting = await db.appSetting.findUnique({ where: { key: "pricing.defaultAssigneeId" } });
  if (!setting?.value) return null;
  const user = await db.user.findUnique({ where: { id: setting.value }, select: { id: true, active: true } });
  return user?.active ? user.id : null;
}
