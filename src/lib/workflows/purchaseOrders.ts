import type { PrismaClient } from "@prisma/client";
import { evaluatePaymentGate } from "../flowRules";
import { plainMoney } from "../money";
import { salesOrderRequired } from "./salesOrder";
import { serialTransaction } from "./transaction";
import { parseDateOnly } from "../input";
import { reconcileOrderStatus } from "./orderState";

export function poNumberProblem(value: string): string | null {
  if (!value.trim()) return "Enter the PO number from AutoQuotes.";
  if (value.trim().length > 40) return "AutoQuotes PO # is too long (max 40 characters).";
  return null;
}

export const duplicatePoNumberMessage = "This AutoQuotes PO number is already logged. Open the existing PO or enter a different number.";
export function isDuplicatePoNumber(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

/** Record the vendor PO already created in AutoQuotes; never allocate a second number. */
export async function logPurchaseOrder(db: PrismaClient, input: {
  orderId: string; supplierId: string; lineItemIds: string[]; number: string; expectedDate?: string;
}) {
  const problem = poNumberProblem(input.number);
  if (problem) throw new Error(problem);
  const number = input.number.trim();
  const expectedDate = poExpectedDate(input.expectedDate ?? "");
  const itemIds = [...new Set(input.lineItemIds)];
  if (!itemIds.length) throw new Error("Choose at least one item for this PO.");
  return serialTransaction(db, async tx => {
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { payments: true, company: true } });
    if (!order || order.status === "complete") throw new Error("This order is closed or missing.");
    const gate = evaluatePaymentGate(plainMoney(order));
    if (!gate.open) throw new Error(gate.reason);
    if (!order.salesOrderSentAt) throw new Error(salesOrderRequired);
    const po = await tx.purchaseOrder.create({ data: {
      orderId: input.orderId, supplierId: input.supplierId,
      poNumber: number, autoQuotesPoNumber: number, expectedDate, status: "draft", shipTo: "hss",
    } });
    const attached = await tx.lineItem.updateMany({
      where: { id: { in: itemIds }, orderId: input.orderId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
      data: { purchaseOrderId: po.id },
    });
    if (attached.count !== itemIds.length) throw new Error("Some selected items are no longer available. Refresh and select the items again.");
    await reconcileOrderStatus(tx, input.orderId);
    return po;
  });
}

export async function renamePurchaseOrder(db: PrismaClient, id: string, number: string) {
  const problem = poNumberProblem(number);
  if (problem) throw new Error(problem);
  return db.purchaseOrder.update({ where: { id }, data: {
    poNumber: number.trim(), autoQuotesPoNumber: number.trim(),
  } });
}

export function poExpectedDate(raw: string): Date | null {
  const value = raw.trim();
  const date = parseDateOnly(value);
  if (date === undefined || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date?.toISOString().slice(0, 10) !== value))) {
    throw new Error("Enter a valid expected date.");
  }
  return date;
}

export async function savePoExpectedDate(db: PrismaClient, id: string, value: string) {
  return db.purchaseOrder.update({ where: { id }, data: { expectedDate: poExpectedDate(value) } });
}
