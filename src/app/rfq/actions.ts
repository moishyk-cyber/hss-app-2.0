"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "line_item", linkedId, action, detail },
  });
}

export async function updateLineItemPricing(
  lineItemId: string,
  unitCost: number | null,
  unitPrice: number | null
) {
  await prisma.lineItem.update({
    where: { id: lineItemId },
    data: { unitCost, unitPrice },
  });
  await log(lineItemId, "rfq_pricing_updated", `Cost/price updated to ${unitCost ?? "—"} / ${unitPrice ?? "—"}`);
  revalidatePath("/rfq");
}

export async function setLineItemRfqStatus(lineItemId: string, rfqStatus: string) {
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus } });
  await log(lineItemId, "rfq_status_set", `RFQ status set to ${rfqStatus}`);
  revalidatePath("/rfq");
}

export async function markLineItemRemoved(lineItemId: string) {
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: "removed" } });
  await log(lineItemId, "rfq_item_removed", "Line item marked removed from RFQ");
  revalidatePath("/rfq");
}
