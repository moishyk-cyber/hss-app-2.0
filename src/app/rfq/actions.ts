"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "line_item", linkedId, action, detail },
  });
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
    await log(lineItemId, "rfq_pricing_updated", `Cost/price updated to ${unitCost ?? "—"} / ${unitPrice ?? "—"}`);
    revalidatePath("/rfq");
  }, "Could not update pricing. Please try again.");
}

export async function setLineItemRfqStatus(lineItemId: string, rfqStatus: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus } });
    await log(lineItemId, "rfq_status_set", `RFQ status set to ${rfqStatus}`);
    revalidatePath("/rfq");
  }, "Could not update RFQ status. Please try again.");
}

export async function setLineItemAssignee(lineItemId: string, assigneeId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { assigneeId: assigneeId || null } });
    await log(lineItemId, "rfq_assignee_set", `Assignee set to ${assigneeId || "unassigned"}`);
    revalidatePath("/rfq");
    revalidatePath("/pipeline");
    revalidatePath("/orders");
  }, "Could not update the assignee. Please try again.");
}

export async function markLineItemRemoved(lineItemId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: "removed" } });
    await log(lineItemId, "rfq_item_removed", "Line item marked removed from RFQ");
    revalidatePath("/rfq");
  }, "Could not remove the line item. Please try again.");
}
