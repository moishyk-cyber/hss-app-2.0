"use server";

import { hasOrderTerms } from "@/lib/ballInCourt";
import { fulfillment, lineItemPricing } from "@/lib/workflows";
import { reconcileOrderStatus } from "@/lib/workflows/orderState";
import { serialTransaction } from "@/lib/workflows/transaction";
import { Prisma } from "@prisma/client";
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
  labelFor,
  DELIVERY_STATUSES,
  QUOTE_STATUSES,
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

    if (!["accepted", "not_needed"].includes(order.quoteStatus)) return { ok: false, message: "Record customer quote acceptance before closing the order." };
    if (!hasOrderTerms(order)) return { ok: false, message: "Save the agreed order terms before closing the order." };
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

/** Reverses markPaymentPaid: back to invoiced, date cleared, logged. */
export async function undoMarkPaymentPaid(paymentId: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) throw new Error("Payment not found");
    if (existing.status !== "paid") return;
    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "invoiced", date: null },
    });
    await log(
      payment.orderId,
      "payment_unpaid",
      `Payment (${payment.type}) of $${toMoney(payment.amount)} reverted to invoiced (paid was undone)`,
      { previousValue: "paid", newValue: "invoiced" }
    );
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not undo the payment. Please try again.");
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
 * PO numbers are PO-<jobId or last 6 of the order id>-<n>, where n comes from
 * atomically incrementing Order.poSequence (the UPDATE row-locks the order, so
 * two people creating a PO on the same order at once get different numbers).
 * poNumber is globally unique in the schema; a legacy number can still collide
 * when two orders share a jobId, so a taken number is skipped (the sequence
 * moves on again) and a race that only surfaces at insert time (P2002) retries
 * the whole allocation a bounded number of times. `supplierId` picks an
 * existing vendor; `newVendorName` creates (or links to a normalized-name
 * match for) one instead - exactly one of the two should be set.
 */
export async function createPurchaseOrder(
  orderId: string,
  supplierId: string,
  lineItemIds: string[],
  newVendorName: string = "",
  autoQuotesPoNumber: string = ""
): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
  if ((!supplierId && !newVendorName.trim()) || lineItemIds.length === 0) {
    return { ok: false, message: "Pick or create a vendor, and at least one item." };
  }
  const aqNumber = autoQuotesPoNumber.trim();
  if (aqNumber.length > 40) {
    return { ok: false, message: "AutoQuotes PO # is too long (max 40 characters)." };
  }
  return safeAction(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new Error("Order not found");

    const vendor = await resolveVendor(supplierId, newVendorName);
    if (!vendor) throw new Error("Vendor not found");
    if (vendor.created) {
      await log(orderId, "vendor_created", `Vendor "${vendor.name}" created while creating a PO`);
    }

    let po = null;
    const MAX_ATTEMPTS = 5;
    const MAX_SKIPS = 20;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        po = await serialTransaction(prisma, async (tx) => {
          for (let skip = 0; skip < MAX_SKIPS; skip += 1) {
            // Atomic allocation: each call hands out the next number, and a
            // number already taken (a legacy PO on another order with the same
            // jobId) is skipped by incrementing again, never recomputed.
            const seq = await tx.order.update({
              where: { id: orderId },
              data: { poSequence: { increment: 1 } },
              select: { poSequence: true, jobId: true, id: true },
            });
            const base = seq.jobId || seq.id.slice(-6).toUpperCase();
            const poNumber = `PO-${base}-${seq.poSequence}`;
            const taken = await tx.purchaseOrder.findUnique({ where: { poNumber }, select: { id: true } });
            if (taken) continue;
            const created = await tx.purchaseOrder.create({
              data: {
                orderId,
                supplierId: vendor.id,
                poNumber,
                status: "draft",
                autoQuotesPoNumber: aqNumber || null,
                // Provisional until the delivery mode is picked at acknowledgment.
                shipTo: "hss",
              },
            });
            // No delivery leg yet on purpose: the PO has to come back acknowledged
            // before anyone knows how it is travelling. acknowledgePo creates it.
            await tx.lineItem.updateMany({
              where: { id: { in: lineItemIds }, orderId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
              data: { purchaseOrderId: created.id },
            });
            await reconcileOrderStatus(tx, orderId);
            return created;
          }
          throw new Error("Could not allocate a PO number");
        });
        break;
      } catch (err) {
        // Another order sharing this jobId inserted the same number between our
        // check and our insert: the transaction rolled back, so allocate again
        // (the other PO now exists and is skipped).
        const isNumberCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isNumberCollision || attempt === MAX_ATTEMPTS - 1) throw err;
      }
    }
    if (!po) throw new Error("Could not allocate a PO number");

    await log(orderId, "po_created", `PO ${po.poNumber} created for ${vendor.name} (${lineItemIds.length} item(s))`);
    revalidateOrder(orderId);
  }, "Could not create the purchase order. Please try again.");
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
      data: { companyId: company.id, contactId: null, locationId: null, deliveryAddress: null },
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
  if (trimmed.length > 40) {
    return { ok: false, message: "AutoQuotes PO # is too long (max 40 characters)." };
  }
  return safeAction(async () => {
    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { autoQuotesPoNumber: trimmed || null },
    });
    await log(
      po.orderId,
      "po_autoquotes_number_set",
      `PO ${po.poNumber ?? po.id} AutoQuotes PO # set to ${trimmed || "none"}`
    );
    revalidateOrder(po.orderId);
  }, "Could not save the AutoQuotes PO #. Please try again.");
}

/**
 * The Invoice tab's quote row: quoteStatus + the link to the customer-facing
 * quote. Setting status to "sent" stamps quoteSentAt the first time only -
 * re-sending doesn't reset the clock.
 */
export async function setOrderQuote(
  orderId: string,
  input: { quoteStatus: string; quoteUrl: string }
): Promise<ActionResult> {
  const denied = await requirePermission("quotes.edit");
  if (denied) return denied;
  if (!isValidValue(QUOTE_STATUSES, input.quoteStatus)) {
    return { ok: false, message: "Pick a valid quote status." };
  }
  const url = input.quoteUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return { ok: false, message: "The quote link should start with http:// or https://." };
  }
  return safeAction(async () => {
    const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { quoteSentAt: true } });
    if (!existing) throw new Error("Order not found");
    const stampSent = input.quoteStatus === "sent" && !existing.quoteSentAt;
    await prisma.order.update({
      where: { id: orderId },
      data: {
        quoteStatus: input.quoteStatus,
        quoteUrl: url || null,
        ...(stampSent ? { quoteSentAt: new Date() } : {}),
      },
    });
    await log(
      orderId,
      "quote_updated",
      `Quote set to ${labelFor(QUOTE_STATUSES, input.quoteStatus)}${url ? " (link attached)" : ""}`
    );
    revalidateOrder(orderId);
  }, "Could not update the quote. Please try again.");
}

/**
 * The Invoice tab's Terms card save. Sep 4 (client): terms are one free-text
 * box that someone writes after reading the quote - nothing is derived from it
 * and no invoice is created (those are added by hand on the same tab).
 */
export async function updateOrderTermsText(orderId: string, text: string): Promise<ActionResult> {
  const denied = await requirePermission("terms.edit");
  if (denied) return denied;
  const trimmed = text.trim();
  if (trimmed.length > 4000) {
    return { ok: false, message: "Those terms are too long - keep them under 4000 characters." };
  }
  return safeAction(async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { termsNotes: trimmed || null },
    });
    await log(orderId, "terms_updated", trimmed ? `Terms updated: ${trimmed}` : "Terms cleared");
    revalidateOrder(orderId);
  }, "Could not save the terms. Please try again.");
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
