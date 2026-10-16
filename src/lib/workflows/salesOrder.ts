import type { PrismaClient } from "@prisma/client";
import { serialTransaction } from "./transaction";
import { evaluatePaymentGate } from "../flowRules";
import { plainMoney } from "../money";

export const salesOrderRequired = "Confirm the sales order was sent before logging a purchase order.";

export async function confirmSalesOrder(db: PrismaClient, orderId: string, sent: boolean) {
  if (typeof sent !== "boolean") throw new Error("Choose whether the sales order was sent.");
  return serialTransaction(db, async tx => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true, company: true } });
    if (!order || order.status === "complete") throw new Error("This order is closed or missing.");
    const gate = evaluatePaymentGate(plainMoney(order));
    if (sent && !gate.open) throw new Error(gate.reason);
    return tx.order.update({ where: { id: orderId }, data: { salesOrderSentAt: sent ? order.salesOrderSentAt ?? new Date() : null } });
  });
}
