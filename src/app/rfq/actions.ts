"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { isValidValue, RFQ_STATUSES } from "@/lib/constants";

async function log(linkedId: string, action: string, detail: string) {
  await logActivity("line_item", linkedId, action, detail);
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

export async function updateLineItemPricing(
  lineItemId: string,
  unitCost: number | null,
  unitPrice: number | null
): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { unitCost, unitPrice },
    });
    await log(lineItemId, "rfq_pricing_updated", `Cost/price updated to ${unitCost ?? "not set"} / ${unitPrice ?? "not set"}`);
    await revalidateLineItem(lineItemId);
  }, "Could not update pricing. Please try again.");
}

export async function setLineItemRfqStatus(lineItemId: string, rfqStatus: string): Promise<ActionResult> {
  if (!isValidValue(RFQ_STATUSES, rfqStatus)) {
    return { ok: false, message: "Not a valid RFQ status." };
  }
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus } });
    await log(lineItemId, "rfq_status_set", `RFQ status set to ${rfqStatus}`);
    await revalidateLineItem(lineItemId);
  }, "Could not update RFQ status. Please try again.");
}

export async function setLineItemAssignee(lineItemId: string, assigneeId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { assigneeId: assigneeId || null } });
    await log(lineItemId, "rfq_assignee_set", `Assignee set to ${assigneeId || "unassigned"}`);
    await revalidateLineItem(lineItemId);
    revalidatePath("/orders");
  }, "Could not update the assignee. Please try again.");
}

export async function markLineItemRemoved(lineItemId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: "removed" } });
    await log(lineItemId, "rfq_item_removed", "Line item marked removed from RFQ");
    await revalidateLineItem(lineItemId);
  }, "Could not remove the line item. Please try again.");
}
