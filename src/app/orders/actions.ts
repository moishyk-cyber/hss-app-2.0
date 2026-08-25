"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

export async function setOrderUrgency(orderId: string, urgency: string) {
  await prisma.order.update({ where: { id: orderId }, data: { urgency } });
  await log(orderId, "order_urgency_set", `Urgency set to ${urgency}`);
  revalidateOrder(orderId);
}

export async function setOrderStatus(orderId: string, status: string) {
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  await log(orderId, "order_status_set", `Status set to ${status}`);
  revalidateOrder(orderId);
}

export async function updateOrderQbInvoice(orderId: string, quickbooksInvoiceNo: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { quickbooksInvoiceNo: quickbooksInvoiceNo || null },
  });
  await log(orderId, "order_qb_invoice_set", `QuickBooks invoice # set to ${quickbooksInvoiceNo || "—"}`);
  revalidateOrder(orderId);
}

export async function addPayment(orderId: string, type: string, amount: number) {
  await prisma.payment.create({ data: { orderId, type, amount, status: "pending" } });
  await log(orderId, "payment_added", `Payment added: ${type} $${amount}`);
  revalidateOrder(orderId);
}

export async function markPaymentInvoiced(paymentId: string) {
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "invoiced" },
  });
  await log(payment.orderId, "payment_invoiced", `Payment (${payment.type}) marked invoiced`);
  revalidateOrder(payment.orderId);
}

export async function markPaymentPaid(paymentId: string) {
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "paid", date: new Date() },
  });
  await log(payment.orderId, "payment_paid", `Payment (${payment.type}) marked paid`);
  revalidateOrder(payment.orderId);
}

export async function setLineItemDeliveryStatus(lineItemId: string, deliveryStatus: string) {
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
  if (!item) return;
  const data: Record<string, unknown> = { deliveryStatus };
  if (deliveryStatus === "ordered" && !item.dateOrdered) data.dateOrdered = new Date();
  if (deliveryStatus === "in_transit_to_client" && !item.dateArrivedHss) data.dateArrivedHss = new Date();
  if (deliveryStatus === "arrived_complete" && !item.dateArrivedClient) data.dateArrivedClient = new Date();
  await prisma.lineItem.update({ where: { id: lineItemId }, data });
  if (item.orderId) {
    await log(item.orderId, "line_item_delivery_status_set", `${item.name} delivery status set to ${deliveryStatus}`);
    revalidateOrder(item.orderId);
  }
}

export async function createPurchaseOrder(orderId: string, supplierId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { purchaseOrders: true, company: true },
  });
  if (!order) return;
  const supplier = await prisma.company.findUnique({ where: { id: supplierId } });
  const n = order.purchaseOrders.length + 1;
  const base = order.jobId || order.id.slice(-6).toUpperCase();
  const poNumber = `PO-${base}-${n}`;
  const po = await prisma.purchaseOrder.create({
    data: { orderId, supplierId, poNumber, status: "draft" },
  });
  await prisma.lineItem.updateMany({
    where: { orderId, supplierId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
    data: { purchaseOrderId: po.id },
  });
  await log(orderId, "po_created", `PO ${poNumber} created for ${supplier?.name ?? "supplier"}`);
  revalidateOrder(orderId);
}

/** Header CTA: create one PO per supplier for every still-unassigned, supplier-tagged line item on the order. */
export async function createAllPurchaseOrders(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      purchaseOrders: true,
      lineItems: { where: { purchaseOrderId: null, rfqStatus: { not: "removed" }, supplierId: { not: null } } },
    },
  });
  if (!order) return;

  const supplierIds = Array.from(new Set(order.lineItems.map((li) => li.supplierId).filter((v): v is string => !!v)));
  let n = order.purchaseOrders.length;
  const base = order.jobId || order.id.slice(-6).toUpperCase();

  for (const supplierId of supplierIds) {
    n += 1;
    const supplier = await prisma.company.findUnique({ where: { id: supplierId } });
    const poNumber = `PO-${base}-${n}`;
    const po = await prisma.purchaseOrder.create({ data: { orderId, supplierId, poNumber, status: "draft" } });
    await prisma.lineItem.updateMany({
      where: { orderId, supplierId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
      data: { purchaseOrderId: po.id },
    });
    await log(orderId, "po_created", `PO ${poNumber} created for ${supplier?.name ?? "supplier"}`);
  }
  revalidateOrder(orderId);
}

/** Header CTA: bulk-advance every "sent" PO on the order to "acknowledged" in one click. */
export async function acknowledgeAllSentPos(orderId: string) {
  const sentPos = await prisma.purchaseOrder.findMany({ where: { orderId, status: "sent" } });
  for (const po of sentPos) {
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "acknowledged", ackDate: po.ackDate ?? new Date() },
    });
    await log(orderId, "po_status_advanced", `PO ${po.poNumber ?? po.id} advanced to acknowledged`);
  }
  revalidateOrder(orderId);
}

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];

export async function advancePoStatus(poId: string) {
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
}

export async function updatePoTracking(
  poId: string,
  trackingUrl: string,
  trackingCarrier: string,
  expectedDelivery: string
) {
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
}
