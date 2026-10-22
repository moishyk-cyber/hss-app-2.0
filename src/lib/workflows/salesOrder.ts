import type { PrismaClient } from "@prisma/client";
import { serialTransaction } from "./transaction";

/** Optional tracking only: this confirmation never gates purchasing or payment. */
export async function confirmSalesOrder(db: PrismaClient, orderId: string, sent: boolean) {
  if (typeof sent !== "boolean") throw new Error("Choose whether the sales order was sent.");
  return serialTransaction(db, async tx => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status === "complete") throw new Error("This order is closed or missing.");
    return tx.order.update({ where: { id: orderId }, data: {
      salesOrderSentAt: sent ? order.salesOrderSentAt ?? new Date() : null,
    } });
  });
}
