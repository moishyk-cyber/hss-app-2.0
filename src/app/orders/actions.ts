"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "order", linkedId, action, detail },
  });
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

export async function setOrderOwner(orderId: string, ownerId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { ownerId: ownerId || null } });
    await log(orderId, "order_owner_set", `Owner set to ${ownerId || "unassigned"}`);
    revalidateOrder(orderId);
  }, "Could not update the owner. Please try again.");
}

export async function setLineItemAssignee(lineItemId: string, assigneeId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { assigneeId: assigneeId || null },
    });
    if (item.orderId) {
      await log(item.orderId, "line_item_assignee_set", `${item.name} assignee set to ${assigneeId || "unassigned"}`);
      revalidateOrder(item.orderId);
    }
  }, "Could not update the assignee. Please try again.");
}

export async function setOrderUrgency(orderId: string, urgency: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { urgency } });
    await log(orderId, "order_urgency_set", `Urgency set to ${urgency}`);
    revalidateOrder(orderId);
  }, "Could not update urgency. Please try again.");
}

export async function setOrderStatus(orderId: string, status: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { status } });
    await log(orderId, "order_status_set", `Status set to ${status}`);
    revalidateOrder(orderId);
  }, "Could not update status. Please try again.");
}

export async function updateOrderQbInvoice(
  orderId: string,
  quickbooksInvoiceNo: string
): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { quickbooksInvoiceNo: quickbooksInvoiceNo || null },
    });
    await log(orderId, "order_qb_invoice_set", `QuickBooks invoice # set to ${quickbooksInvoiceNo || "—"}`);
    revalidateOrder(orderId);
  }, "Could not save the invoice number. Please try again.");
}

export async function addPayment(orderId: string, type: string, amount: number): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid payment amount greater than $0." };
  }
  if (amount > 10_000_000) {
    return { ok: false, message: "That amount looks too large — double-check it." };
  }
  return safeAction(async () => {
    await prisma.payment.create({ data: { orderId, type, amount, status: "pending" } });
    await log(orderId, "payment_added", `Payment added: ${type} $${amount}`);
    revalidateOrder(orderId);
  }, "Could not record the payment. Please try again.");
}

export async function markPaymentInvoiced(paymentId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "invoiced" },
    });
    await log(payment.orderId, "payment_invoiced", `Payment (${payment.type}) marked invoiced`);
    revalidateOrder(payment.orderId);
  }, "Could not mark the payment invoiced. Please try again.");
}

export async function markPaymentPaid(paymentId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "paid", date: new Date() },
    });
    await log(payment.orderId, "payment_paid", `Payment (${payment.type}) marked paid`);
    revalidateOrder(payment.orderId);
  }, "Could not mark the payment paid. Please try again.");
}

export async function setLineItemDeliveryStatus(
  lineItemId: string,
  deliveryStatus: string
): Promise<ActionResult> {
  return safeAction(async () => {
    const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
    if (!item) throw new Error("Line item not found");
    const data: Record<string, unknown> = { deliveryStatus };
    if (deliveryStatus === "ordered" && !item.dateOrdered) data.dateOrdered = new Date();
    if (deliveryStatus === "in_transit_to_client" && !item.dateArrivedHss) data.dateArrivedHss = new Date();
    if (deliveryStatus === "arrived_complete" && !item.dateArrivedClient) data.dateArrivedClient = new Date();
    await prisma.lineItem.update({ where: { id: lineItemId }, data });
    if (item.orderId) {
      await log(item.orderId, "line_item_delivery_status_set", `${item.name} delivery status set to ${deliveryStatus}`);
      revalidateOrder(item.orderId);
    }
  }, "Could not update delivery status. Please try again.");
}

export async function setLineItemBackorderExpected(
  lineItemId: string,
  backorderExpected: string
): Promise<ActionResult> {
  return safeAction(async () => {
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { backorderExpected: backorderExpected ? new Date(backorderExpected) : null },
    });
    if (item.orderId) {
      await log(
        item.orderId,
        "line_item_backorder_expected_set",
        `${item.name} backorder expected date set to ${backorderExpected || "—"}`
      );
      revalidateOrder(item.orderId);
    }
  }, "Could not save the expected date. Please try again.");
}

/**
 * Create a PO for one vendor, attaching only the explicitly chosen line items.
 * PO numbers are allocated by counting existing POs on the order and retrying
 * on a collision (two people creating a PO on the same order at once), guarded
 * by the @@unique([orderId, poNumber]) constraint in the schema.
 */
export async function createPurchaseOrder(
  orderId: string,
  supplierId: string,
  lineItemIds: string[]
): Promise<ActionResult> {
  if (!supplierId || lineItemIds.length === 0) {
    return { ok: false, message: "Pick a vendor and at least one item." };
  }
  return safeAction(async () => {
    const [order, supplier] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.company.findUnique({ where: { id: supplierId } }),
    ]);
    if (!order) throw new Error("Order not found");

    const base = order.jobId || order.id.slice(-6).toUpperCase();

    let po = null;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const existing = await prisma.purchaseOrder.count({ where: { orderId } });
      const poNumber = `PO-${base}-${existing + 1}`;
      try {
        po = await prisma.purchaseOrder.create({
          data: { orderId, supplierId, poNumber, status: "draft" },
        });
        break;
      } catch (err) {
        const isNumberCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isNumberCollision || attempt === MAX_ATTEMPTS - 1) throw err;
      }
    }
    if (!po) throw new Error("Could not allocate a PO number");

    await prisma.lineItem.updateMany({
      where: { id: { in: lineItemIds }, orderId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
      data: { purchaseOrderId: po.id },
    });
    await log(orderId, "po_created", `PO ${po.poNumber} created for ${supplier?.name ?? "vendor"} (${lineItemIds.length} item(s))`);
    revalidateOrder(orderId);
  }, "Could not create the purchase order. Please try again.");
}

/** Header CTA: bulk-advance every "sent" PO on the order to "acknowledged" in one click. */
export async function acknowledgeAllSentPos(orderId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const result = await prisma.purchaseOrder.updateMany({
      where: { orderId, status: "sent" },
      data: { status: "acknowledged", ackDate: new Date() },
    });
    if (result.count > 0) {
      await log(orderId, "po_status_advanced", `${result.count} PO(s) advanced to acknowledged`);
    }
    revalidateOrder(orderId);
  }, "Could not acknowledge the purchase orders. Please try again.");
}

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];

export async function advancePoStatus(poId: string): Promise<ActionResult> {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { order: { include: { payments: true } } } });
    if (!po) return { ok: false, message: "PO not found" };
    const idx = PO_ORDER.indexOf(po.status);
    if (idx < 0 || idx >= PO_ORDER.length - 1) return { ok: false, message: "Already at final status" };
    const next = PO_ORDER[idx + 1];

    if (po.status === "draft" && next === "sent") {
      const hasPaid = po.order.payments.some((p) => p.status === "paid");
      if (!hasPaid) {
        return {
          ok: false,
          message: "Payment gate: deposit/full payment required before POs are sent",
        };
      }
    }

    const data: Record<string, unknown> = { status: next };
    if (next === "sent" && !po.sentDate) data.sentDate = new Date();
    if (next === "acknowledged" && !po.ackDate) data.ackDate = new Date();

    await prisma.purchaseOrder.update({ where: { id: poId }, data });
    await log(po.orderId, "po_status_advanced", `PO ${po.poNumber ?? po.id} advanced to ${next}`);
    revalidateOrder(po.orderId);
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Could not advance the PO. Please try again." };
  }
}

export async function updatePoTracking(
  poId: string,
  trackingUrl: string,
  trackingCarrier: string,
  expectedDelivery: string
): Promise<ActionResult> {
  return safeAction(async () => {
    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        trackingUrl: trackingUrl || null,
        trackingCarrier: trackingCarrier || null,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      },
    });
    await log(po.orderId, "po_tracking_updated", `PO ${po.poNumber ?? po.id} tracking info updated`);
    revalidateOrder(po.orderId);
  }, "Could not save tracking info. Please try again.");
}

/** PO-level delivery/trucking status pill (pending | scheduled | delivered_partial | delivered_full). */
export async function setPoDeliveryStatus(poId: string, deliveryStatus: string): Promise<ActionResult> {
  return safeAction(async () => {
    const po = await prisma.purchaseOrder.update({ where: { id: poId }, data: { deliveryStatus } });
    await log(po.orderId, "po_delivery_status_set", `PO ${po.poNumber ?? po.id} delivery status set to ${deliveryStatus}`);
    revalidateOrder(po.orderId);
  }, "Could not update delivery status. Please try again.");
}

/**
 * Batched save for the real-world shipment/trucking fields (modeled on the
 * client's Delivery Sheet): trucker, pickup address, scheduled delivery date,
 * ship cost, whether it was billed back to the customer, and the delivery-day
 * contact phone. Saved together behind one "Save shipment details" button,
 * matching the existing TrackingEdit form pattern in this file.
 */
export async function updatePoShipmentDetails(
  poId: string,
  trucker: string,
  pickupAddress: string,
  scheduledDeliveryDate: string,
  shipCost: string,
  chargedToCustomer: boolean,
  deliveryContactPhone: string
): Promise<ActionResult> {
  const trimmedCost = shipCost.trim();
  const cost = trimmedCost === "" ? null : Number(trimmedCost);
  if (cost != null && !Number.isFinite(cost)) {
    return { ok: false, message: "Enter a valid ship cost." };
  }
  return safeAction(async () => {
    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        trucker: trucker || null,
        pickupAddress: pickupAddress || null,
        scheduledDeliveryDate: scheduledDeliveryDate ? new Date(scheduledDeliveryDate) : null,
        shipCost: cost,
        chargedToCustomer,
        deliveryContactPhone: deliveryContactPhone || null,
      },
    });
    await log(po.orderId, "po_shipment_details_updated", `PO ${po.poNumber ?? po.id} shipment details updated`);
    revalidateOrder(po.orderId);
  }, "Could not save shipment details. Please try again.");
}
