"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "line_item", linkedId, action, detail },
  });
}

export async function setLineItemSupplier(lineItemId: string, supplierId: string) {
  const item = await prisma.lineItem.update({
    where: { id: lineItemId },
    data: { supplierId: supplierId || null },
    include: { supplier: true },
  });
  await log(lineItemId, "rfq_supplier_set", `Supplier set to ${item.supplier?.name ?? "none"}`);
  revalidatePath("/rfq");
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

export async function advanceRfqStatus(lineItemId: string) {
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
  if (!item) return;
  const order = ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes", "approved"];
  const idx = order.indexOf(item.rfqStatus);
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : item.rfqStatus;
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: next } });
  await log(lineItemId, "rfq_status_advanced", `RFQ status advanced to ${next}`);
  revalidatePath("/rfq");
}

export async function markLineItemRemoved(lineItemId: string) {
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { rfqStatus: "removed" } });
  await log(lineItemId, "rfq_item_removed", "Line item marked removed from RFQ");
  revalidatePath("/rfq");
}
