"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity, type ActivityLogMeta } from "@/lib/log";
import { isValidValue, RFQ_STATUSES, STOCK_STATUSES } from "@/lib/constants";
import { roundCents } from "@/lib/money";
import { syncOrderValueFromLineItems } from "@/lib/flow";
import { requirePermission } from "@/lib/permissionsServer";
import { requireActiveAssignee } from "@/lib/ownership";
import { parseDateOnly } from "@/lib/input";

async function log(linkedId: string, action: string, detail: string, meta?: ActivityLogMeta) {
  await logActivity("line_item", linkedId, action, detail, meta);
}

/**
 * A line item's RFQ status can move estimating (opportunity), fulfillment (order),
 * and the dashboard's "needs pricing" queue all at once - revalidate everywhere it
 * could be showing, not just /rfq.
 */
async function revalidateLineItem(lineItemId: string) {
  const item = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    select: { opportunityId: true, orderId: true },
  });
  revalidatePath("/rfq");
  revalidatePath("/dashboard");
  if (item?.opportunityId) revalidatePath(`/pipeline/${item.opportunityId}`);
  if (item?.orderId) revalidatePath(`/orders/${item.orderId}`);
}

/**
 * Sep 2 QA P0 fixes baked in here:
 * - a non-finite or non-positive price is REJECTED with a message instead of
 *   silently writing garbage (a negative price used to just clear the field);
 * - money is rounded to cents at the write boundary (floats were storing
 *   1234.56 as 1234.56005859375);
 * - saving a real price on a needs_pricing item advances it to quote_received,
 *   so the queue and the deal reflect that a quote now exists.
 *
 * Reliability spec P1 fix: this no longer accepts a blank price as "clear the
 * price" (that was one stray Save away from deleting trusted pricing data).
 * A blank/null price is now always a validation error - clearing goes through
 * the separate, confirmed clearLineItemPrice action below.
 */
export async function updateLineItemPricing(
  lineItemId: string,
  unitCost: number | null,
  unitPrice: number | null
): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, message: "Enter a price greater than $0." };
  }
  if (unitCost != null && !Number.isFinite(unitCost)) {
    return { ok: false, message: "Enter a valid cost." };
  }
  const price = roundCents(unitPrice);
  const cost = unitCost == null ? null : roundCents(unitCost);
  return safeAction(async () => {
    const before = await prisma.lineItem.findUnique({
      where: { id: lineItemId },
      select: { rfqStatus: true, name: true, unitPrice: true },
    });
    if (!before) throw new Error("Line item not found");
    const advance = before.rfqStatus === "needs_pricing";
    await prisma.lineItem.update({
      where: { id: lineItemId },
      data: {
        unitCost: cost,
        unitPrice: price,
        ...(advance ? { rfqStatus: "quote_received" } : {}),
      },
    });
    await log(
      lineItemId,
      "rfq_pricing_updated",
      `Price set to $${price} on "${before.name}"${advance ? " - status advanced to quote_received" : ""}`,
      { previousValue: before.unitPrice != null ? `$${before.unitPrice}` : "(none)", newValue: `$${price}` }
    );
    await syncOpportunityPricing(lineItemId);
    await syncOrderPricing(lineItemId);
    await revalidateLineItem(lineItemId);
  }, "Could not update pricing. Please try again.");
}

/**
 * The deliberate counterpart to updateLineItemPricing's now-mandatory price:
 * the only way left to null out a stored price. The UI only shows this button
 * when a price exists and confirms it first (naming the item and the current
 * price) before calling this - a stored price can no longer disappear from a
 * blank Save.
 */
export async function clearLineItemPrice(lineItemId: string): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const before = await prisma.lineItem.findUnique({
      where: { id: lineItemId },
      select: { name: true, unitPrice: true },
    });
    if (!before) throw new Error("Line item not found");
    if (before.unitPrice == null) return; // already clear - nothing to do, no audit noise
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { unitPrice: null } });
    await log(lineItemId, "rfq_price_cleared", `Price cleared on "${before.name}" (was $${before.unitPrice})`, {
      previousValue: `$${before.unitPrice}`,
      newValue: "(none)",
    });
    await syncOpportunityPricing(lineItemId);
    await syncOrderPricing(lineItemId);
    await revalidateLineItem(lineItemId);
  }, "Could not clear the price. Please try again.");
}

/**
 * Order-side twin of syncOpportunityPricing (Sep 3 QA #4). Once a deal is won
 * its items belong to an Order, whose orderValue was a one-time snapshot of the
 * agreed close price - so re-pricing an item from this queue silently left the
 * order total (and the payment gate derived from it) stale. The rule itself
 * lives in @/lib/flow next to the gate math; this just routes to it.
 */
async function syncOrderPricing(lineItemId: string): Promise<void> {
  const item = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    select: { orderId: true },
  });
  if (!item?.orderId) return;
  await syncOrderValueFromLineItems(item.orderId);
  // The orders list shows orderValue too - revalidateLineItem only covers the detail page.
  revalidatePath("/orders");
}

/**
 * Keep the parent deal honest after a pricing edit (Sep 2 QA: items were priced
 * but the deal still read "not quoted yet / Needs pricing: Yes"). Once no live
 * item is left waiting on a quote, the deal's needsPricing flag flips off; and
 * if the deal has no value yet but every live item now carries a price, the
 * item total becomes the deal's starting value (still editable, and the Close
 * panel still asks for the price actually agreed).
 */
async function syncOpportunityPricing(lineItemId: string): Promise<void> {
  const item = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    select: { opportunityId: true },
  });
  if (!item?.opportunityId) return;
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: item.opportunityId },
    select: {
      id: true,
      needsPricing: true,
      value: true,
      stage: true,
      lineItems: { select: { qty: true, unitPrice: true, rfqStatus: true } },
    },
  });
  if (!opportunity || opportunity.stage === "won" || opportunity.stage === "lost") return;

  const live = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed");
  const unpriced = live.filter(
    (li) => li.rfqStatus === "needs_pricing" || li.rfqStatus === "rfq_sent"
  );
  const data: { needsPricing?: boolean; value?: number } = {};
  if (opportunity.needsPricing && live.length > 0 && unpriced.length === 0) {
    data.needsPricing = false;
  }
  if (
    opportunity.value == null &&
    live.length > 0 &&
    live.every((li) => li.unitPrice != null && li.unitPrice > 0)
  ) {
    const total = live.reduce((sum, li) => sum + (li.unitPrice ?? 0) * li.qty, 0);
    data.value = Math.round((total + Number.EPSILON) * 100) / 100;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.opportunity.update({ where: { id: opportunity.id }, data });
  await logActivity(
    "opportunity",
    opportunity.id,
    "pricing_synced",
    [
      data.needsPricing === false ? "All items priced - needs-pricing flag cleared" : null,
      data.value != null ? `Deal value set to $${data.value} from priced items` : null,
    ]
      .filter(Boolean)
      .join("; ")
  );
}

export async function setLineItemRfqStatus(lineItemId: string, rfqStatus: string): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  if (!isValidValue(RFQ_STATUSES, rfqStatus)) {
    return { ok: false, message: "Not a valid RFQ status." };
  }
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus } });
    await log(lineItemId, "rfq_status_set", `RFQ status set to ${rfqStatus}`);
    // Moving into/out of "removed" changes which items count toward the order total.
    await syncOrderPricing(lineItemId);
    await revalidateLineItem(lineItemId);
  }, "Could not update RFQ status. Please try again.");
}

export async function setLineItemAssignee(lineItemId: string, assigneeId: string): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  const inactive = await requireActiveAssignee(assigneeId);
  if (inactive) return inactive;
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { assigneeId: assigneeId || null } });
    await log(lineItemId, "rfq_assignee_set", `Assignee set to ${assigneeId || "unassigned"}`);
    await revalidateLineItem(lineItemId);
    revalidatePath("/orders");
  }, "Could not update the assignee. Please try again.");
}

export async function markLineItemRemoved(lineItemId: string): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: "removed" } });
    await log(lineItemId, "rfq_item_removed", "Line item marked removed from RFQ");
    await syncOrderPricing(lineItemId);
    await revalidateLineItem(lineItemId);
  }, "Could not remove the line item. Please try again.");
}

/**
 * Stock status set at the pricing stage (before an order exists). Clears the
 * backorder-expected date when moving back to in_stock, so a stale date can't
 * linger and reappear if the item is marked backordered again later.
 */
export async function setLineItemStockStatus(
  lineItemId: string,
  stockStatus: string
): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  if (!isValidValue(STOCK_STATUSES, stockStatus)) {
    return { ok: false, message: "Not a valid stock status." };
  }
  return safeAction(async () => {
    const before = await prisma.lineItem.findUnique({
      where: { id: lineItemId },
      select: { name: true },
    });
    if (!before) throw new Error("Line item not found");
    await prisma.lineItem.update({
      where: { id: lineItemId },
      data: {
        stockStatus,
        ...(stockStatus !== "backordered" ? { backorderExpected: null } : {}),
      },
    });
    await log(lineItemId, "stock_status_set", `Stock status set to ${stockStatus} on "${before.name}"`);
    await revalidateLineItem(lineItemId);
  }, "Could not update stock status. Please try again.");
}

/** Expected-available date while an item is backordered at the pricing stage. */
export async function setLineItemBackorderExpected(
  lineItemId: string,
  backorderExpected: string
): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  const parsedDate = parseDateOnly(backorderExpected);
  if (parsedDate === undefined) {
    return { ok: false, message: "Enter a valid date." };
  }
  return safeAction(async () => {
    const before = await prisma.lineItem.findUnique({
      where: { id: lineItemId },
      select: { name: true },
    });
    if (!before) throw new Error("Line item not found");
    await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { backorderExpected: parsedDate },
    });
    await log(
      lineItemId,
      "backorder_expected_set",
      `Backorder expected date ${parsedDate ? `set to ${backorderExpected}` : "cleared"} on "${before.name}"`
    );
    await revalidateLineItem(lineItemId);
  }, "Could not save the expected date. Please try again.");
}

/**
 * The date the item is called for, set from the RFQ row as "YYYY-MM-DD" and
 * stored at UTC midnight (how every date-only field here is stored). Feeds the
 * "Latest lead time" summary on the deal and the read-only lead-time columns on
 * the deal and order line-item tables. An empty string clears it.
 */
export async function setLineItemLeadTime(
  lineItemId: string,
  date: string | null
): Promise<ActionResult> {
  const denied = await requirePermission("pricing.edit");
  if (denied) return denied;
  const raw = date?.trim() ?? "";
  let leadTimeDate: Date | null = null;
  if (raw !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { ok: false, message: "Pick a date for the lead time." };
    }
    leadTimeDate = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(leadTimeDate.getTime())) {
      return { ok: false, message: "Pick a date for the lead time." };
    }
  }
  return safeAction(async () => {
    const before = await prisma.lineItem.findUnique({
      where: { id: lineItemId },
      select: { name: true },
    });
    if (!before) throw new Error("Line item not found");
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { leadTimeDate } });
    await log(
      lineItemId,
      "lead_time_set",
      leadTimeDate != null
        ? `Lead time set to ${raw} on "${before.name}"`
        : `Lead time cleared on "${before.name}"`
    );
    await revalidateLineItem(lineItemId);
  }, "Could not update lead time. Please try again.");
}
