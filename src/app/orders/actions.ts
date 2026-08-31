"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import {
  evaluatePaymentGate,
  recomputeOrderStatus,
  deriveOrderStatus,
  canCompleteOrder,
  FLOW_ORDER_INCLUDE,
} from "@/lib/flow";
import { isValidValue, ORDER_URGENCIES, DELIVERY_STATUSES, PO_DELIVERY_STATUSES } from "@/lib/constants";

async function log(linkedId: string, action: string, detail: string) {
  await logActivity("order", linkedId, action, detail);
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

/** Add a line item to an existing order (the client called back and added something). */
export async function addOrderLineItem(
  orderId: string,
  name: string,
  qty: number,
  description: string
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Give the item a name." };
  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
  return safeAction(async () => {
    const item = await prisma.lineItem.create({
      data: {
        orderId,
        name: trimmed,
        description: description.trim() || null,
        qty: safeQty,
        // Late-added items still need a price - they join the RFQ queue.
        rfqStatus: "needs_pricing",
      },
    });
    await log(orderId, "item_added", `"${item.name}" added to the order (qty ${safeQty}) - needs pricing`);
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
    revalidatePath("/rfq");
  }, "Could not add the item. Please try again.");
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
  if (!isValidValue(ORDER_URGENCIES, urgency)) {
    return { ok: false, message: "Not a valid urgency." };
  }
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { urgency } });
    await log(orderId, "order_urgency_set", `Urgency set to ${urgency}`);
    revalidateOrder(orderId);
  }, "Could not update urgency. Please try again.");
}

/**
 * Explicit "Mark stuck" - a manual override the derived-status recompute never
 * clears (see MANUAL_STATUSES in @/lib/flow).
 */
export async function markOrderStuck(orderId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { status: "stuck" } });
    await log(orderId, "order_marked_stuck", "Order marked stuck");
    revalidateOrder(orderId);
  }, "Could not mark the order stuck. Please try again.");
}

/**
 * Leaves "stuck": derives the true status from payments/POs/items right now.
 * Can't just call recomputeOrderStatus() here - it intentionally no-ops on
 * "stuck"/"complete" so routine mutations never silently clear a manual flag.
 * This action IS that explicit override, so it re-derives directly instead.
 */
export async function unstickOrder(orderId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: FLOW_ORDER_INCLUDE });
    if (!order) throw new Error("Order not found");
    const derived = deriveOrderStatus(order);
    await prisma.order.update({ where: { id: orderId }, data: { status: derived } });
    await log(orderId, "order_unstuck", `Order unstuck - status set to ${derived}`);
    revalidateOrder(orderId);
  }, "Could not unstick the order. Please try again.");
}

/** Header primary action once the payment gate is open and everything has landed. */
export async function markOrderComplete(orderId: string): Promise<ActionResult> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: FLOW_ORDER_INCLUDE });
    if (!order) return { ok: false, message: "Order not found" };

    if (!canCompleteOrder(order)) {
      const gate = evaluatePaymentGate(order);
      if (!gate.open) {
        return { ok: false, message: gate.reason };
      }
      const items = order.lineItems.filter((i) => i.rfqStatus !== "removed");
      const itemsPending = items.filter((i) => i.deliveryStatus !== "arrived_complete").length;
      const posPending = order.purchaseOrders.filter(
        (p) => p.status !== "received" && p.deliveryStatus !== "delivered_full"
      ).length;
      const parts: string[] = [];
      if (posPending > 0) parts.push(`${posPending} purchase order${posPending > 1 ? "s" : ""} not yet received`);
      if (itemsPending > 0) parts.push(`${itemsPending} item${itemsPending > 1 ? "s" : ""} not yet arrived`);
      return {
        ok: false,
        message: parts.length > 0 ? `Cannot complete: ${parts.join(", ")}.` : "Order is not ready to be marked complete.",
      };
    }

    await prisma.order.update({ where: { id: orderId }, data: { status: "complete" } });
    await log(orderId, "order_completed", "Order marked complete");
    revalidateOrder(orderId);
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Could not mark the order complete. Please try again." };
  }
}

/** From "complete", re-derives the true in-flight status (payments/POs/items may have moved on since). */
export async function reopenOrder(orderId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: FLOW_ORDER_INCLUDE });
    if (!order) throw new Error("Order not found");
    if (order.status !== "complete") return;
    const derived = deriveOrderStatus(order);
    await prisma.order.update({ where: { id: orderId }, data: { status: derived } });
    await log(orderId, "order_reopened", `Order reopened - status set to ${derived}`);
    revalidateOrder(orderId);
  }, "Could not reopen the order. Please try again.");
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
    await log(orderId, "order_qb_invoice_set", `QuickBooks invoice # set to ${quickbooksInvoiceNo || "not set"}`);
    revalidateOrder(orderId);
  }, "Could not save the invoice number. Please try again.");
}

export async function addPayment(orderId: string, type: string, amount: number): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid payment amount greater than $0." };
  }
  if (amount > 10_000_000) {
    return { ok: false, message: "That amount looks too large - double-check it." };
  }
  return safeAction(async () => {
    await prisma.payment.create({ data: { orderId, type, amount, status: "pending" } });
    await log(orderId, "payment_added", `Payment added: ${type} $${amount}`);
    await recomputeOrderStatus(orderId);
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
    await recomputeOrderStatus(payment.orderId);
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
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not mark the payment paid. Please try again.");
}

export async function setLineItemDeliveryStatus(
  lineItemId: string,
  deliveryStatus: string
): Promise<ActionResult> {
  if (!isValidValue(DELIVERY_STATUSES, deliveryStatus)) {
    return { ok: false, message: "Not a valid delivery status." };
  }
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
      await recomputeOrderStatus(item.orderId);
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
        `${item.name} backorder expected date set to ${backorderExpected || "not set"}`
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
    await recomputeOrderStatus(orderId);
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
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not acknowledge the purchase orders. Please try again.");
}

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];

export async function advancePoStatus(poId: string): Promise<ActionResult> {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        order: {
          include: {
            payments: true,
            company: { select: { requiresDeposit: true, depositPercent: true } },
          },
        },
      },
    });
    if (!po) return { ok: false, message: "PO not found" };
    const idx = PO_ORDER.indexOf(po.status);
    if (idx < 0 || idx >= PO_ORDER.length - 1) return { ok: false, message: "Already at final status" };
    const next = PO_ORDER[idx + 1];

    if (po.status === "draft" && next === "sent") {
      const gate = evaluatePaymentGate(po.order);
      if (!gate.open) {
        return { ok: false, message: gate.reason };
      }
    }

    const data: Record<string, unknown> = { status: next };
    if (next === "sent" && !po.sentDate) data.sentDate = new Date();
    if (next === "acknowledged" && !po.ackDate) data.ackDate = new Date();

    await prisma.purchaseOrder.update({ where: { id: poId }, data });
    await log(po.orderId, "po_status_advanced", `PO ${po.poNumber ?? po.id} advanced to ${next}`);
    await recomputeOrderStatus(po.orderId);
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
  if (!isValidValue(PO_DELIVERY_STATUSES, deliveryStatus)) {
    return { ok: false, message: "Not a valid delivery status." };
  }
  return safeAction(async () => {
    const po = await prisma.purchaseOrder.update({ where: { id: poId }, data: { deliveryStatus } });
    await log(po.orderId, "po_delivery_status_set", `PO ${po.poNumber ?? po.id} delivery status set to ${deliveryStatus}`);
    await recomputeOrderStatus(po.orderId);
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
