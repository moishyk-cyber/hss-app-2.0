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

/** By-supplier view: bulk-mark every needs_pricing item for one supplier as rfq_sent. */
export async function markSupplierItemsRfqSent(supplierId: string) {
  const result = await prisma.lineItem.updateMany({
    where: { supplierId, rfqStatus: "needs_pricing" },
    data: { rfqStatus: "rfq_sent" },
  });
  const supplier = await prisma.company.findUnique({ where: { id: supplierId } });
  await prisma.activityLog.create({
    data: {
      userName: "System",
      linkedType: "company",
      linkedId: supplierId,
      action: "rfq_bulk_sent",
      detail: `${result.count} item(s) marked RFQ Sent for ${supplier?.name ?? "supplier"}`,
    },
  });
  revalidatePath("/rfq");
}
