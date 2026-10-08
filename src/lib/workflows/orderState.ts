import type { Prisma } from "@prisma/client";
import { deriveOrderStatus, FLOW_ORDER_INCLUDE, MANUAL_STATUSES } from "../flowRules";
import { plainMoney, roundCents, toMoney } from "../money";

/** Strict version for mutations: a failed reconciliation rolls back the edit. */
export async function reconcileOrderStatus(db: Prisma.TransactionClient, orderId: string) {
  const order = plainMoney(await db.order.findUnique({
    where: { id: orderId }, include: FLOW_ORDER_INCLUDE,
  }));
  if (!order) throw new Error("Order not found");
  if (MANUAL_STATUSES.has(order.status)) return order.status;
  const status = deriveOrderStatus(order);
  if (status !== order.status) await db.order.update({ where: { id: orderId }, data: { status } });
  return status;
}

export async function reconcileOrderValue(db: Prisma.TransactionClient, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { orderValue: true, lineItems: { select: { qty: true, unitPrice: true, rfqStatus: true } } },
  });
  if (!order) throw new Error("Order not found");
  const previous = toMoney(order.orderValue);
  const live = order.lineItems.filter(i => i.rfqStatus !== "removed");
  // Preserve an agreed value when there is no complete item total to use.
  if (!live.length || live.some(i => i.unitPrice == null || Number(i.unitPrice) <= 0)) return null;
  const total = roundCents(live.reduce((sum, i) => sum + Number(i.unitPrice) * i.qty, 0));
  if (previous != null && Math.abs(previous - total) < 0.005) return null;
  await db.order.update({ where: { id: orderId }, data: { orderValue: total } });
  return { previous, total };
}
