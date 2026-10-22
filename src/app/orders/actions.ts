"use server";

import { verifiedPaymentInterpretation } from "@/lib/interpretPaymentTerms";
import { paymentPlanAmounts } from "@/lib/paymentTerms";
import { Prisma } from "@prisma/client";
import { serialTransaction } from "@/lib/workflows/transaction";
import { reconcileOrderStatus } from "@/lib/workflows/orderState";
import { editInvoiceRecord, deleteInvoiceRecord, unpayInvoiceRecord, InvoiceEditError, type InvoiceRevision } from "@/lib/workflows/invoices";
import { confirmSalesOrder } from "@/lib/workflows/salesOrder";
import { fulfillment, lineItemPricing } from "@/lib/workflows";
import { logPurchaseOrder, renamePurchaseOrder, poExpectedDate, savePoExpectedDate, poNumberProblem, isDuplicatePoNumber, duplicatePoNumberMessage } from "@/lib/workflows/purchaseOrders";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity, type ActivityLogMeta } from "@/lib/log";
import {
  evaluatePaymentGate,
  recomputeOrderStatus,
  deriveOrderStatus,
  canCompleteOrder,
  FLOW_ORDER_INCLUDE,
  ORDER_BALL_INCLUDE,
} from "@/lib/flow";
import {
  isValidValue,
  DELIVERY_STATUSES,
} from "@/lib/constants";
import { plainMoney, roundCents, toMoney } from "@/lib/money";
import { requirePermission } from "@/lib/permissionsServer";
import { requireActiveAssignee } from "@/lib/ownership";
import { cleanText, parseDateOnly, TEXT_LIMITS } from "@/lib/input";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "./utils";
import { parseInvoiceDueDate } from "@/lib/invoices";
import { findCompanyByNormalizedName } from "../companies/nameMatch";

async function log(linkedId: string, action: string, detail: string, meta?: ActivityLogMeta) {
  await logActivity("order", linkedId, action, detail, meta);
}

function revalidateOrder(orderId: string) {
  revalidatePath("/records/[id]", "page");
  revalidatePath("/pipeline");
  revalidatePath("/invoices");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  // The deliveries tracker renders every delivery leg - keep it fresh too.
  revalidatePath("/deliveries");
  revalidatePath("/deliveries/[id]", "page");
  revalidatePath("/purchase-orders/[id]", "page");
}

/** Add a line item to an existing order (the client called back and added something). */
export async function addOrderLineItem(
  orderId: string,
  name: string,
  qty: number,
  description: string
): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Give the item a name." };
  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
  return safeAction(async () => {
    const item = await lineItemPricing.add({
      orderId, name: trimmed, description: description.trim() || null,
      qty: safeQty, rfqStatus: "needs_pricing",
    });
    await log(orderId, "item_added", `"${item.name}" added to the order (qty ${safeQty}) - needs pricing`);
  }, "Could not add the item. Please try again.");
}

export async function setOrderOwner(orderId: string, ownerId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const inactive = await requireActiveAssignee(ownerId);
  if (inactive) return inactive;
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { ownerId: ownerId || null } });
    await log(orderId, "order_owner_set", `Owner set to ${ownerId || "unassigned"}`);
    revalidateOrder(orderId);
  }, "Could not update the owner. Please try again.");
}

export async function setLineItemAssignee(lineItemId: string, assigneeId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const inactive = await requireActiveAssignee(assigneeId);
  if (inactive) return inactive;
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

/**
 * Leaves "stuck": derives the true status from payments/POs/items right now.
 * Can't just call recomputeOrderStatus() here - it intentionally no-ops on
 * "stuck"/"complete" so routine mutations never silently clear a manual flag.
 * This action IS that explicit override, so it re-derives directly instead.
 */
export async function unstickOrder(orderId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const order = plainMoney(
      await prisma.order.findUnique({ where: { id: orderId }, include: FLOW_ORDER_INCLUDE })
    );
    if (!order) throw new Error("Order not found");
    const derived = deriveOrderStatus(order);
    await prisma.order.update({ where: { id: orderId }, data: { status: derived } });
    await log(orderId, "order_unstuck", `Order unstuck - status set to ${derived}`);
    revalidateOrder(orderId);
  }, "Could not unstick the order. Please try again.");
}

/** Header primary action once the payment gate is open and everything has landed. */
export async function markOrderComplete(orderId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  try {
    const order = plainMoney(
      await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_BALL_INCLUDE })
    );
    if (!order) return { ok: false, message: "Order not found" };

    if (order._count.serviceIssues > 0) return { ok: false, message: "Resolve all open service issues before closing the order." };
    if (!canCompleteOrder(order)) {
      const gate = evaluatePaymentGate(order);
      if (!gate.open) {
        return { ok: false, message: gate.reason };
      }
      const items = order.lineItems.filter((i) => i.rfqStatus !== "removed");
      const itemsPending = items.filter((i) => i.deliveryStatus !== "arrived_complete").length;
      const deliveriesPending = order.deliveries.filter((d) => d.status !== "delivered_full").length;
      // Mirrors canCompleteOrder: once every delivery has landed a PO left at
      // "shipped" is not a blocker, so don't nag about it.
      const allDeliveriesLanded = order.deliveries.length > 0 && deliveriesPending === 0;
      const posPending = allDeliveriesLanded
        ? 0
        : order.purchaseOrders.filter((p) => p.status !== "received").length;
      const parts: string[] = [];
      if (deliveriesPending > 0) {
        parts.push(`${deliveriesPending} deliver${deliveriesPending > 1 ? "ies" : "y"} not yet delivered`);
      }
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
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const order = plainMoney(
      await prisma.order.findUnique({ where: { id: orderId }, include: FLOW_ORDER_INCLUDE })
    );
    if (!order) throw new Error("Order not found");
    if (order.status !== "complete") return;
    const derived = deriveOrderStatus(order);
    await prisma.order.update({ where: { id: orderId }, data: { status: derived } });
    await log(orderId, "order_reopened", `Order reopened - status set to ${derived}`);
    revalidateOrder(orderId);
  }, "Could not reopen the order. Please try again.");
}

/**
 * Invoice tab (Aug 31 feedback): adding a QuickBooks invoice asks for the invoice
 * type, the amount, and (optionally) the QuickBooks link in one shot. Creates the
 * Payment already in "invoiced" status - there's no separate "record payment then
 * mark invoiced" step for invoices created this way. Legacy "pending" payments
 * (recorded before this change) keep working through markPaymentInvoiced below.
 */
export async function addInvoice(
  orderId: string,
  type: string,
  amount: number,
  quickbooksLink: string,
  dueDateInput = "",
  status = "invoiced"
): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  if (status !== "pending" && status !== "invoiced") {
    return { ok: false, message: "Choose pending or invoiced. Record a received payment with Mark paid." };
  }
  const dueDate = parseInvoiceDueDate(dueDateInput);
  if (dueDate === undefined) return { ok: false, message: "Enter a valid due date." };
  if (!isValidValue(PAYMENT_TYPES, type)) {
    return { ok: false, message: "Pick an invoice type." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid amount greater than $0." };
  }
  if (amount > 10_000_000) {
    return { ok: false, message: "That amount looks too large - double-check it." };
  }
  const link = quickbooksLink.trim();
  if (link && !/^https?:\/\//i.test(link)) {
    return { ok: false, message: "The QuickBooks link should start with http:// or https://." };
  }
  const cents = roundCents(amount);
  return safeAction(async () => {
    await prisma.payment.create({
      data: { orderId, type, amount: cents, status, quickbooksRef: link || null, dueDate },
    });
    await log(orderId, "invoice_added", `Billing record added: ${type} $${cents} (${status})${dueDateInput ? `, due ${dueDateInput}` : ""}${link ? " (QuickBooks link attached)" : ""}`);
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not add the invoice. Please try again.");
}

/** Invoice amount/date edits and deletion share the same payment gate reconciliation. */
export async function editInvoice(paymentId: string, amount: number, dueDate: string, expected: InvoiceRevision): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit"); if (denied) return denied;
  try {
    const { previous, payment } = await editInvoiceRecord(prisma, paymentId, amount, dueDate, expected);
    await log(payment.orderId, "invoice_edited", `${payment.type} invoice amount/date updated`, { previousValue: JSON.stringify(previous), newValue: JSON.stringify({ amount: toMoney(payment.amount), dueDate: payment.dueDate, status: payment.status }) });
    revalidateOrder(payment.orderId);
    return { ok: true };
  } catch (error) { if (error instanceof InvoiceEditError) return { ok: false, message: error.message }; console.error("Invoice edit failed", error); return { ok: false, message: "Could not save the invoice. Please try again." }; }
}
export async function deleteInvoice(paymentId: string, expected: InvoiceRevision): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit"); if (denied) return denied;
  try {
    const payment = await deleteInvoiceRecord(prisma, paymentId, expected);
    await log(payment.orderId, "invoice_deleted", `${payment.type} invoice of $${toMoney(payment.amount)} deleted`, { previousValue: JSON.stringify(plainMoney(payment)), newValue: null });
    revalidateOrder(payment.orderId);
    return { ok: true };
  } catch (error) { if (error instanceof InvoiceEditError) return { ok: false, message: error.message }; console.error("Invoice delete failed", error); return { ok: false, message: "Could not delete the invoice. Please try again." }; }
}

export async function setPaymentDueDate(paymentId: string, input: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  const dueDate = parseInvoiceDueDate(input);
  if (dueDate === undefined) return { ok: false, message: "Enter a valid due date." };
  return safeAction(async () => {
    const payment = await prisma.payment.update({ where: { id: paymentId }, data: { dueDate } });
    await log(payment.orderId, "payment_due_date_set", `${payment.type} due date ${dueDate ? `set to ${dueDate.toISOString().slice(0, 10)}` : "cleared"}`);
    revalidateOrder(payment.orderId);
  }, "Could not save the due date. Please try again.");
}

export async function markPaymentInvoiced(paymentId: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const payment = await prisma.payment.update({
      where: { id: paymentId, status: "pending" },
      data: { status: "invoiced" },
    });
    await log(payment.orderId, "payment_invoiced", `Payment (${payment.type}) marked invoiced`);
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not mark the payment invoiced. Please try again.");
}

export async function markPaymentPending(paymentId: string, expectedStatus: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  if (expectedStatus === "paid") return undoMarkPaymentPaid(paymentId);
  if (!["invoiced", "paid"].includes(expectedStatus)) return { ok: false, message: "Refresh the payment before changing its status." };
  return safeAction(async () => {
    const payment = await prisma.payment.update({
      where: { id: paymentId, status: expectedStatus },
      data: { status: "pending", date: null },
    });
    await log(payment.orderId, "payment_pending", `Payment (${payment.type}) moved back to pending${expectedStatus === "paid" ? "; paid date cleared" : ""}`);
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not move the payment back to pending. Please try again.");
}

/**
 * Marks a payment paid. No longer a bare one-click write (Sep 2 QA P0: a
 * $2,500 payment got fired off by a single stray click): the UI fronts this
 * with a review dialog, the received date and method are recorded, the
 * activity log narrates the full amount, and undoMarkPaymentPaid reverses it.
 */
export async function markPaymentPaid(
  paymentId: string,
  paidDate?: string,
  method?: string
): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  if (method && !PAYMENT_METHODS.some((m) => m.value === method)) {
    return { ok: false, message: "Pick a payment method from the list." };
  }
  let date = new Date();
  if (paidDate) {
    const parsed = new Date(`${paidDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "Enter a valid received date." };
    }
    date = parsed;
  }
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === method)?.label ?? null;
  return safeAction(async () => {
    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) throw new Error("Payment not found");
    if (existing.status === "paid") return; // double-submit guard - already done
    const methodNote = methodLabel ? `Paid via ${methodLabel}` : null;
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "paid",
        date,
        ...(methodNote
          ? { notes: existing.notes ? `${existing.notes}\n${methodNote}` : methodNote }
          : {}),
      },
    });
    await log(
      payment.orderId,
      "payment_paid",
      `Payment (${payment.type}) of $${toMoney(payment.amount)} marked paid${
        methodLabel ? ` via ${methodLabel}` : ""
      }`,
      { previousValue: "invoiced", newValue: "paid" }
    );
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not mark the payment paid. Please try again.");
}

/** Mark unpaid removes the invoice and its received money in one transaction. */
export async function undoMarkPaymentPaid(paymentId: string, expected?: InvoiceRevision): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit"); if (denied) return denied;
  try {
    const payment = await unpayInvoiceRecord(prisma, paymentId, expected);
    if (!payment) return { ok: true };
    await log(payment.orderId, "payment_unpaid", `${payment.type} invoice of $${toMoney(payment.amount)} removed when marked unpaid`, { previousValue: JSON.stringify(plainMoney(payment)), newValue: null });
    revalidateOrder(payment.orderId);
    return { ok: true };
  } catch (error) { if (error instanceof InvoiceEditError) return { ok: false, message: error.message }; console.error("Mark unpaid failed", error); return { ok: false, message: "Could not mark unpaid and remove the invoice. Please try again." }; }
}

export async function setLineItemDeliveryStatus(
  lineItemId: string,
  deliveryStatus: string
): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
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
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  const parsed = parseDateOnly(backorderExpected);
  if (parsed === undefined) return { ok: false, message: "Enter a valid date." };
  return safeAction(async () => {
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { backorderExpected: parsed },
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
 * Resolves the vendor to attach a PO to: an existing company id, or a typed name
 * that either matches an existing company (by normalized name - same dedupe rule
 * as intake) or creates a new one, type "supplier". Mirrors the business/contact
 * search-or-create pattern on intake (Aug 31 feedback: "when selecting a vendor,
 * do the same thing as business and creating a contact").
 */
async function resolveVendor(
  supplierId: string,
  newVendorName: string
): Promise<{ id: string; name: string; created: boolean } | null> {
  if (supplierId) {
    const existing = await prisma.company.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
    return existing ? { id: existing.id, name: existing.name, created: false } : null;
  }
  const trimmed = newVendorName.trim();
  if (!trimmed) return null;
  const match = await findCompanyByNormalizedName(trimmed);
  if (match) return { id: match.id, name: match.name, created: false };
  const created = await prisma.company.create({ data: { name: trimmed, type: "supplier" } });
  return { id: created.id, name: created.name, created: true };
}

/**
 * Create a PO for one vendor, attaching only the explicitly chosen line items.
 * A PO is vendor + AutoQuotes PO # + items, nothing else (Sep 8 2026 client
 * call: "purchase orders and deliveries are two different things"). How the
 * goods travel is decided later, when the vendor acknowledges the PO - see
 * acknowledgePo, which is what actually creates the delivery leg.
 *
 * The AutoQuotes number is the primary PO number throughout the app.
 */
export async function createPurchaseOrder(
  orderId: string,
  supplierId: string,
  lineItemIds: string[],
  newVendorName: string = "",
  autoQuotesPoNumber: string = "",
  expectedDate: string = ""
): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  if ((!supplierId && !newVendorName.trim()) || lineItemIds.length === 0) {
    return { ok: false, message: "Pick or create a vendor, and at least one item." };
  }
  const aqNumber = autoQuotesPoNumber.trim();
  const problem = poNumberProblem(aqNumber);
  if (problem) return { ok: false, message: problem };
  try { poExpectedDate(expectedDate); } catch { return { ok: false, message: "Enter a valid expected date." }; }
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, company: true } });
    if (!order) throw new Error("Order not found");
    const gate = evaluatePaymentGate(plainMoney(order));
    if (!gate.open) return { ok: false, message: gate.reason };

    const vendor = await resolveVendor(supplierId, newVendorName);
    if (!vendor) throw new Error("Vendor not found");
    if (vendor.created) {
      await log(orderId, "vendor_created", `Vendor "${vendor.name}" created while creating a PO`);
    }

    const po = await logPurchaseOrder(prisma, {
      orderId, supplierId: vendor.id, lineItemIds, number: aqNumber, expectedDate,
    });

    await log(orderId, "po_created", `PO ${po.poNumber} created for ${vendor.name} (${lineItemIds.length} item(s))`);
    revalidateOrder(orderId);
    return { ok: true };
  } catch (error) {
    if (isDuplicatePoNumber(error)) return { ok: false, message: duplicatePoNumberMessage };
    console.error(error);
    return { ok: false, message: "Could not log the purchase order. Refresh and check the selected items, then try again." };
  }
}

export async function advancePoStatus(poId: string): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  return fulfillment.advancePoStatus(poId);
}

export async function acknowledgePo(
  poId: string,
  details: {
    mode: string;
    trackingCarrier?: string;
    trackingUrl?: string;
    expectedDelivery?: string;
    trucker?: string;
    pickupAddress?: string;
    scheduledDeliveryDate?: string;
    shipCost?: string;
    chargedToCustomer?: boolean;
    deliveryContactPhone?: string;
    notes?: string;
  }
): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  return fulfillment.acknowledgePo(poId, details);
}

export async function createDelivery(
  orderId: string,
  mode: string,
  lineItemIds: string[],
  purchaseOrderId: string = ""
): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.createDelivery(orderId, mode, lineItemIds, purchaseOrderId);
}

export async function updateDelivery(
  deliveryId: string,
  details: {
    mode: string;
    trackingCarrier?: string;
    trackingUrl?: string;
    expectedDelivery?: string;
    trucker?: string;
    pickupAddress?: string;
    scheduledDeliveryDate?: string;
    shipCost?: string;
    chargedToCustomer?: boolean;
    deliveryContactPhone?: string;
    notes?: string;
  }
): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.updateDelivery(deliveryId, details);
}

export async function setDeliveryStatus(deliveryId: string, status: string): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.setDeliveryStatus(deliveryId, status);
}

export async function setDeliveryTrucker(deliveryId: string, trucker: string): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.setDeliveryTrucker(deliveryId, trucker);
}

export async function splitDelivery(deliveryId: string, lineItemIds: string[]): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.splitDelivery(deliveryId, lineItemIds);
}

export async function moveItemsToDelivery(
  targetDeliveryId: string,
  lineItemIds: string[]
): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.moveItemsToDelivery(targetDeliveryId, lineItemIds);
}

export async function deleteEmptyDelivery(deliveryId: string): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  return fulfillment.deleteEmptyDelivery(deliveryId);
}

/**
 * Change the order's business. Same-name-or-create pattern as resolveVendor,
 * type "customer" (an order's client is never a supplier). Since the old
 * contact/location/delivery address belong to the PREVIOUS business, they are
 * cleared rather than left pointing at (or copying) the wrong company's data -
 * the caller picks them again from the newly-picked business's own list.
 */
export async function setOrderCompany(
  orderId: string,
  companyId: string,
  newCompanyName: string = ""
): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const trimmedName = newCompanyName.trim();
  if (!companyId && !trimmedName) {
    return { ok: false, message: "Pick or type a business name." };
  }
  try {
    let company: { id: string; name: string } | null = null;
    let created = false;
    if (companyId) {
      company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
      if (!company) return { ok: false, message: "That business could not be found." };
    } else {
      const match = await findCompanyByNormalizedName(trimmedName);
      if (match) {
        company = match;
      } else {
        // Creating a new business is phonebook territory too, on top of order edit rights.
        const phonebookDenied = await requirePermission("phonebook.edit");
        if (phonebookDenied) return phonebookDenied;
        company = await prisma.company.create({ data: { name: trimmedName, type: "customer" } });
        created = true;
      }
    }
    await prisma.order.update({
      where: { id: orderId },
      data: { companyId: company.id, contactId: null, locationId: null, deliveryAddress: null, intakeDeliveryAddress: null, intakeLocationName: null },
    });
    await log(
      orderId,
      "order_company_set",
      `Business set to "${company.name}"${created ? " (newly created)" : ""} - contact, location and delivery address were cleared`
    );
    revalidateOrder(orderId);
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Could not update the business. Please try again." };
  }
}

/**
 * Change the order's contact. `contactId` picks an existing contact (must
 * belong to the order's own business - a contact from another company is a
 * tampered payload, same guard as setOrderLocation below); `newContactFirstName`
 * creates a minimal contact (first name only, same as intake's "didn't catch a
 * last name" allowance) under that business instead. Both empty clears it.
 */
export async function setOrderContact(
  orderId: string,
  contactId: string,
  newContactFirstName: string = ""
): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { companyId: true } });
    if (!order) throw new Error("Order not found");

    if (!contactId && !newContactFirstName.trim()) {
      await prisma.order.update({ where: { id: orderId }, data: { contactId: null } });
      await log(orderId, "order_contact_set", "Order is no longer linked to a contact");
      revalidateOrder(orderId);
      return;
    }

    if (!order.companyId) {
      throw new Error("Pick a business before picking a contact");
    }

    let contact: { id: string; firstName: string; lastName: string | null };
    if (contactId) {
      const existing = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, firstName: true, lastName: true, companyId: true },
      });
      if (!existing || existing.companyId !== order.companyId) {
        throw new Error("That contact belongs to another business");
      }
      contact = existing;
    } else {
      contact = await prisma.contact.create({
        data: { firstName: newContactFirstName.trim(), companyId: order.companyId },
      });
    }

    await prisma.order.update({ where: { id: orderId }, data: { contactId: contact.id } });
    await log(
      orderId,
      "order_contact_set",
      `Contact set to ${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}`
    );
    revalidateOrder(orderId);
  }, "Could not update the contact. Please try again.");
}

/**
 * Create a new location for the order's own business and point the order at
 * it in one step (the location-field combobox's "add new" flow). Ignores any
 * companyId the caller passes in favor of the order's own - the field it's
 * called from only ever edits this order's location, never another business's.
 */
export async function createLocationForOrder(
  orderId: string,
  _companyId: string,
  input: { name: string; address: string }
): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const name = cleanText(input.name, TEXT_LIMITS.short);
  const address = cleanText(input.address, TEXT_LIMITS.medium);
  if (!name || !address) {
    return { ok: false, message: "A location needs a name and an address." };
  }
  return safeAction(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { companyId: true } });
    if (!order?.companyId) throw new Error("Pick a business before adding a location");

    const existingCount = await prisma.location.count({ where: { companyId: order.companyId } });
    const location = await prisma.location.create({
      data: { companyId: order.companyId, name, address, isDefault: existingCount === 0 },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { locationId: location.id, deliveryAddress: location.address },
    });
    await log(orderId, "order_location_set", `Location "${location.name}" added and set (${location.address})`);
    revalidatePath(`/companies/${order.companyId}`);
    revalidateOrder(orderId);
  }, "Could not add the location. Please try again.");
}

/** The unified intake editor updates the current order rather than its old deal snapshot. */
export async function setOrderTitle(orderId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const title = cleanText(value, TEXT_LIMITS.short);
  if (!title) return { ok: false, message: "Enter a title before saving." };
  return safeAction(async () => {
    await prisma.$transaction(async tx => {
      const order = await tx.order.update({ where: { id: orderId }, data: { title } });
      if (order.opportunityId) await tx.opportunity.update({ where: { id: order.opportunityId }, data: { title } });
    });
    await log(orderId, "order_title_set", "Order title updated");
    revalidateOrder(orderId);
  }, "Could not save the title. Please try again.");
}

export async function setOrderNotes(orderId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const notes = cleanText(value, TEXT_LIMITS.long);
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { notes: notes || null } });
    await log(orderId, "order_notes_set", "Order notes updated");
    revalidateOrder(orderId);
  }, "Could not save the notes. Please try again.");
}

/** Delivery requirements remain editable for intakes created directly as orders. */
export async function setOrderDeliveryDetail(orderId: string, field: 'deliveryType' | 'openingSize' | 'installationNeeded' | 'floorNote', value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  if (!["deliveryType", "openingSize", "installationNeeded", "floorNote"].includes(field)) return { ok: false, message: "Choose a valid delivery field." };
  if (field === "deliveryType" && value && !["curbside", "inside"].includes(value)) return { ok: false, message: "Choose curbside or inside delivery." };
  if (field === "installationNeeded" && !["yes", "no"].includes(value)) return { ok: false, message: "Choose Yes or No." };
  const data = field === "installationNeeded" ? { installationNeeded: value === "yes" } : { [field]: cleanText(value, field === "floorNote" ? TEXT_LIMITS.medium : TEXT_LIMITS.short) || null };
  return safeAction(async () => {
    await prisma.$transaction(async tx => {
      const order = await tx.order.update({ where: { id: orderId }, data, select: { opportunityId: true } });
      if (order.opportunityId) await tx.opportunity.update({ where: { id: order.opportunityId }, data });
    });
    await log(orderId, "order_delivery_details_set", "Delivery requirements updated");
    revalidateOrder(orderId);
  }, "Could not save delivery requirements. Please try again.");
}

export async function setOrderJobId(orderId: string, jobId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const trimmed = cleanText(jobId, TEXT_LIMITS.short);
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { jobId: trimmed || null } });
    await log(orderId, "order_job_id_set", `Job ID set to ${trimmed || "none"}`);
    revalidateOrder(orderId);
  }, "Could not save the Job ID. Please try again.");
}

export async function setOrderClientPoNumber(orderId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const trimmed = cleanText(value, TEXT_LIMITS.short);
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { clientPoNumber: trimmed || null } });
    await log(orderId, "order_client_po_set", `Client PO # set to ${trimmed || "none"}`);
    revalidateOrder(orderId);
  }, "Could not save the Client PO #. Please try again.");
}

/** `value` is a plain "YYYY-MM-DD" from a date input, or "" to clear it. */
export async function setOrderNeededByDate(orderId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const neededByDate = parseDateOnly(value);
  if (neededByDate === undefined) return { ok: false, message: "Enter a valid date." };
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { neededByDate } });
    await log(orderId, "order_needed_by_set", `Needed-by date set to ${value.trim() || "none"}`);
    revalidateOrder(orderId);
  }, "Could not save the needed-by date. Please try again.");
}

/**
 * Direct free-text edit of the delivery address - independent of
 * setOrderLocation, for when the address needs a tweak (a suite number, a
 * loading-dock note) without switching to a different saved location.
 */
export async function setOrderDeliveryAddress(orderId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  const trimmed = cleanText(value, TEXT_LIMITS.medium);
  return safeAction(async () => {
    await prisma.order.update({ where: { id: orderId }, data: { deliveryAddress: trimmed || null } });
    await log(orderId, "order_delivery_address_set", `Delivery address set to ${trimmed || "none"}`);
    revalidateOrder(orderId);
  }, "Could not save the delivery address. Please try again.");
}

/**
 * Point the order at one of its customer's saved locations (Sep 3 plan A1.6).
 * The Location row is the link; `deliveryAddress` stays the snapshot the
 * delivery leg actually reads, so picking a site copies its address across.
 * An empty id unlinks the order without touching the address it already has.
 */
export async function setOrderDestination(orderId: string, choice: string, newAddress = ""): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    await prisma.$transaction(async tx => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { companyId: true, intakeDeliveryAddress: true, deliveryAddress: true } });
      let deliveryAddress: string | null = null;
      let locationId: string | null = null;
      if (choice === "intake") {
        deliveryAddress = order.intakeDeliveryAddress;
        if (deliveryAddress && order.companyId) locationId = (await tx.location.findFirst({ where: { companyId: order.companyId, address: deliveryAddress }, select: { id: true } }))?.id ?? null;
      } else if (choice === "elsewhere") deliveryAddress = cleanText(newAddress, TEXT_LIMITS.medium) || null;
      else {
        const location = await tx.location.findUnique({ where: { id: choice }, select: { id: true, companyId: true, address: true } });
        if (!location || location.companyId !== order.companyId) throw new Error("That location does not belong to this business.");
        locationId = location.id; deliveryAddress = location.address;
      }
      if (!deliveryAddress?.trim()) throw new Error("Enter a delivery address or choose a saved location.");
      await tx.order.update({ where: { id: orderId }, data: { locationId, deliveryAddress } });
    });
    await log(orderId, "order_location_set", "Delivery destination updated");
    revalidateOrder(orderId);
  }, "Could not save the delivery location. Choose a valid location and try again.");
}

export async function setOrderLocation(orderId: string, locationId: string): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, companyId: true },
    });
    if (!order) throw new Error("Order not found");

    if (!locationId) {
      await prisma.order.update({ where: { id: orderId }, data: { locationId: null } });
      await log(orderId, "order_location_set", "Order is no longer linked to a location");
      revalidateOrder(orderId);
      return;
    }

    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, address: true, companyId: true },
    });
    // A site on another business is a tampered payload, not a choice.
    if (!location || location.companyId !== order.companyId) {
      throw new Error("That location belongs to another business");
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { locationId: location.id, deliveryAddress: location.address },
    });
    await log(
      orderId,
      "order_location_set",
      `Delivering to ${location.name} (${location.address})`
    );
    revalidateOrder(orderId);
  }, "Could not set the location. Please try again.");
}

// ---------------------------------------------------------------------------
// Purchase orders: AutoQuotes #, quote + terms on the order (plan §3C).
// ---------------------------------------------------------------------------

/** Inline edit for the AutoQuotes PO # from the PO row/modal - same validation as create. */
export async function setPoAutoQuotesNumber(poId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  const trimmed = value.trim();
  const problem = poNumberProblem(trimmed);
  if (problem) return { ok: false, message: problem };
  try {
    const po = await renamePurchaseOrder(prisma, poId, trimmed);
    await log(po.orderId, "po_autoquotes_number_set", `PO number set to ${po.poNumber} from AutoQuotes`);
    revalidateOrder(po.orderId);
    revalidatePath(`/purchase-orders/${po.id}`);
    revalidatePath("/deliveries");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    if (isDuplicatePoNumber(error)) return { ok: false, message: duplicatePoNumberMessage };
    console.error(error);
    return { ok: false, message: "Could not save the AutoQuotes PO #. Please try again." };
  }
}

/** Apply validated automatic interpretation; never trust a client-supplied schedule. */
export async function updateOrderTermsText(orderId: string, text: string, token?: string, agreedTotal?: number): Promise<ActionResult> {
  const denied = await requirePermission("terms.edit");
  if (denied) return denied;
  if (typeof text !== "string" || text.length > 4000) return { ok: false, message: "Keep payment terms under 4,000 characters." };
  if (agreedTotal !== undefined) {
    const priceDenied = await requirePermission("orders.edit"); if (priceDenied) return priceDenied;
    if (!Number.isFinite(agreedTotal) || agreedTotal <= 0 || agreedTotal > 9999999999.99) return { ok: false, message: "Enter a valid agreed order total." };
  }
  const trimmed = text.trim();
  let interpretation: ReturnType<typeof verifiedPaymentInterpretation> | null = null;
  try { interpretation = trimmed ? verifiedPaymentInterpretation(trimmed, token) : null; }
  catch (error) { return { ok: false, message: (error as Error).message }; }
  return safeAction(async () => {
    await serialTransaction(prisma, async tx => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const required = interpretation ? paymentPlanAmounts(interpretation.plan, agreedTotal ?? toMoney(order.orderValue)).requiredBeforePurchase : null;
      await tx.order.update({ where: { id: orderId }, data: {
        termsNotes: trimmed || null, paymentTerms: interpretation ? "custom" : null,
        ...(agreedTotal !== undefined ? { orderValue: roundCents(agreedTotal) } : {}),
        paymentPlan: interpretation ? interpretation.plan : Prisma.DbNull, depositRequired: required,
      } });
      await reconcileOrderStatus(tx, orderId);
    });
    await log(orderId, "terms_updated", trimmed ? `Payment terms applied (${interpretation!.model}): ${trimmed}` : "Custom payment terms cleared; account deposit rule applies");
    revalidateOrder(orderId);
  }, "Could not save the payment terms. Please try again.");
}

/** Payment row inline edit: attach/replace/clear the QuickBooks link. */
export async function setPaymentQuickbooksRef(paymentId: string, link: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  const trimmed = link.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: "The QuickBooks link should start with http:// or https://." };
  }
  return safeAction(async () => {
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { quickbooksRef: trimmed || null },
    });
    await log(
      payment.orderId,
      "payment_quickbooks_ref_set",
      `Payment (${payment.type}) QuickBooks link ${trimmed ? "set" : "cleared"}`
    );
    revalidateOrder(payment.orderId);
  }, "Could not save the QuickBooks link. Please try again.");
}

/** PO vendor availability is independent of item dates and delivery scheduling. */
export async function setPoExpectedDate(poId: string, value: string): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  try { poExpectedDate(value); } catch { return { ok: false, message: "Enter a valid expected date." }; }
  return safeAction(async () => {
    const po = await savePoExpectedDate(prisma, poId, value);
    await log(po.orderId, "po_expected_date_set", `PO ${po.poNumber} expected date ${value.trim() ? `set to ${value.trim()}` : "cleared"}`);
    revalidateOrder(po.orderId);
  }, "Could not save the PO expected date. Please try again.");
}

/** Optional Purchase tracking; never a prerequisite for logging POs. */
export async function setSalesOrderSent(orderId: string, sent: boolean): Promise<ActionResult> {
  const denied = await requirePermission("orders.edit");
  if (denied) return denied;
  return safeAction(async () => {
    await confirmSalesOrder(prisma, orderId, sent);
    await log(orderId, "sales_order_sent_set", sent ? "Sales order confirmed sent to customer" : "Sales order sent confirmation cleared");
    revalidateOrder(orderId);
  }, "Could not save the sales order confirmation. Please try again.");
}
