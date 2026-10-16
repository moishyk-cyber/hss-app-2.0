import type { Prisma, PrismaClient } from "@prisma/client";
import { serialTransaction } from "./transaction";

export class IntakeDeletionError extends Error {}

async function assertOrderUnstarted(tx: Prisma.TransactionClient, id: string) {
  const order = await tx.order.findUnique({ where: { id } });
  if (!order || order.status === "complete") throw new IntakeDeletionError("This order is closed or missing.");
  const counts = await Promise.all([
    tx.payment.count({ where: { orderId: id } }),
    tx.purchaseOrder.count({ where: { orderId: id } }),
    tx.delivery.count({ where: { orderId: id } }),
    tx.serviceIssue.count({ where: { orderId: id } }),
  ]);
  if (counts.some(Boolean)) throw new IntakeDeletionError("This intake has payments, purchase orders, deliveries, or service history and cannot be deleted.");
  return order;
}

/** Delete only intake work that has not entered fulfillment. Keep authored history and attachments for audit. */
export async function deleteIntakeRecord(db: PrismaClient, kind: "opportunity" | "order", id: string) {
  if (kind !== "opportunity" && kind !== "order") throw new IntakeDeletionError("Invalid intake type.");
  return serialTransaction(db, async tx => {
    if (kind === "opportunity") {
      const deal = await tx.opportunity.findUnique({ where: { id } });
      if (!deal) throw new IntakeDeletionError("This intake no longer exists.");
      if (deal.stage === "won" || await tx.order.count({ where: { opportunityId: id } })) {
        throw new IntakeDeletionError("This intake has become an order and cannot be deleted from the pipeline.");
      }
    } else {
      const order = await assertOrderUnstarted(tx, id);
      if (order.opportunityId) throw new IntakeDeletionError("This order belongs to a won deal. Its intake cannot be deleted.");
    }
    const where = kind === "opportunity" ? { opportunityId: id } : { orderId: id };
    const items = await tx.lineItem.findMany({ where });
    for (const item of items) await deleteUnlinkedItem(tx, item.id);
    // Retain file records under an audit-only type instead of leaving active dangling links.
    await tx.document.updateMany({ where: { linkedType: kind, linkedId: id }, data: { linkedType: "deleted_intake" } });
    await tx.task.updateMany({ where: { linkedType: kind, linkedId: id }, data: { linkedType: null, linkedId: null } });
    await tx.intakeSubmission.deleteMany({ where: { resultType: kind, resultId: id } });
    if (kind === "opportunity") await tx.opportunity.delete({ where: { id } });
    else await tx.order.delete({ where: { id } });
  });
}

async function deleteUnlinkedItem(tx: Prisma.TransactionClient, id: string) {
  const item = await tx.lineItem.findUnique({ where: { id } });
  if (!item) throw new IntakeDeletionError("This item no longer exists.");
  if (item.purchaseOrderId || item.deliveryId || await tx.serviceIssue.count({ where: { lineItemId: id } })) {
    throw new IntakeDeletionError("This item has PO, delivery, or service history and cannot be deleted.");
  }
  if (item.orderId) await assertOrderUnstarted(tx, item.orderId);
  if (item.opportunityId) {
    const deal = await tx.opportunity.findUnique({ where: { id: item.opportunityId } });
    if (deal?.stage === "won") throw new IntakeDeletionError("This intake has become an order. Its items cannot be deleted here.");
  }
  await tx.document.updateMany({ where: { linkedType: "line_item", linkedId: id }, data: { linkedType: "deleted_intake_item" } });
  await tx.task.updateMany({ where: { linkedType: "line_item", linkedId: id }, data: { linkedType: null, linkedId: null } });
  return tx.lineItem.delete({ where: { id } });
}

export async function deleteIntakeItem(db: PrismaClient, id: string) {
  return serialTransaction(db, async tx => deleteUnlinkedItem(tx, id));
}
