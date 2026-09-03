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
import {
  isValidValue,
  labelFor,
  ORDER_URGENCIES,
  DELIVERY_STATUSES,
  DELIVERY_MODES,
  DELIVERY_LEG_STATUSES,
  PAYMENT_TERMS,
  QUOTE_STATUSES,
} from "@/lib/constants";
import { roundCents } from "@/lib/money";
import { requirePermission } from "@/lib/permissionsServer";
import { applyTermsToOrder } from "@/lib/terms";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "./utils";
import { findCompanyByNormalizedName } from "../companies/nameMatch";
import {
  hasCarrierLeg,
  hasTruckerLeg,
  inTransitItemStatus,
  modeForShipTo,
} from "../deliveries/_ui";

async function log(linkedId: string, action: string, detail: string) {
  await logActivity("order", linkedId, action, detail);
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  // The deliveries tracker renders every delivery leg - keep it fresh too.
  revalidatePath("/deliveries");
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
  quickbooksLink: string
): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
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
      data: { orderId, type, amount: cents, status: "invoiced", quickbooksRef: link || null },
    });
    await log(orderId, "invoice_added", `Invoice added: ${type} $${cents}${link ? " (QuickBooks link attached)" : ""}`);
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not add the invoice. Please try again.");
}

export async function markPaymentInvoiced(paymentId: string): Promise<ActionResult> {
  const denied = await requirePermission("payments.edit");
  if (denied) return denied;
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
      `Payment (${payment.type}) of $${payment.amount} marked paid${
        methodLabel ? ` via ${methodLabel}` : ""
      }`
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
      `Payment (${payment.type}) of $${payment.amount} reverted to invoiced (paid was undone)`
    );
    await recomputeOrderStatus(payment.orderId);
    revalidateOrder(payment.orderId);
  }, "Could not undo the payment. Please try again.");
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
 * PO numbers are allocated by counting existing POs on the order and retrying
 * on a collision (two people creating a PO on the same order at once), guarded
 * by the @@unique([orderId, poNumber]) constraint in the schema. `supplierId`
 * picks an existing vendor; `newVendorName` creates (or links to a normalized-name
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
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");

    const vendor = await resolveVendor(supplierId, newVendorName);
    if (!vendor) throw new Error("Vendor not found");
    if (vendor.created) {
      await log(orderId, "vendor_created", `Vendor "${vendor.name}" created while creating a PO`);
    }

    const base = order.jobId || order.id.slice(-6).toUpperCase();

    let po = null;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const existing = await prisma.purchaseOrder.count({ where: { orderId } });
      const poNumber = `PO-${base}-${existing + 1}`;
      try {
        po = await prisma.purchaseOrder.create({
          data: { orderId, supplierId: vendor.id, poNumber, status: "draft", autoQuotesPoNumber: aqNumber || null },
        });
        break;
      } catch (err) {
        const isNumberCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isNumberCollision || attempt === MAX_ATTEMPTS - 1) throw err;
      }
    }
    if (!po) throw new Error("Could not allocate a PO number");

    // One PO -> one delivery leg by default (plan §3B.3). The mode follows the
    // PO's ship-to: a client_direct PO is a drop-ship, everything else routes
    // through HSS. Splitting it later is a job for the Delivery tab.
    const delivery = await prisma.delivery.create({
      data: { orderId, purchaseOrderId: po.id, mode: modeForShipTo(po.shipTo) },
    });

    await prisma.lineItem.updateMany({
      where: { id: { in: lineItemIds }, orderId, purchaseOrderId: null, rfqStatus: { not: "removed" } },
      data: { purchaseOrderId: po.id, deliveryId: delivery.id },
    });
    await log(orderId, "po_created", `PO ${po.poNumber} created for ${vendor.name} (${lineItemIds.length} item(s))`);
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not create the purchase order. Please try again.");
}

/** Header CTA: bulk-advance every "sent" PO on the order to "acknowledged" in one click. */
export async function acknowledgeAllSentPos(orderId: string): Promise<ActionResult> {
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
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
  const denied = await requirePermission("pos.edit");
  if (denied) return denied;
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

// ---------------------------------------------------------------------------
// Deliveries (plan §3B). A Delivery is one delivery leg: one PO -> one Delivery
// by default (created with the PO below), splittable, and HSS-stock legs carry
// no PO at all. Every logistics field the PurchaseOrder used to hold now lives
// on Delivery, so these actions replaced updatePoTracking / setPoTrucker /
// setPoDeliveryStatus / updatePoShipmentDetails.
// ---------------------------------------------------------------------------

/**
 * Free-text tracking link guard, carried over from the old updatePoTracking:
 * this field has a history of junk ("gewryher", a chat link saved as tracking),
 * so only a real absolute link is ever stored.
 */
function trackingUrlError(url: string): string | null {
  if (!url) return null;
  if (/^https?:\/\/\S+\.\S+/i.test(url)) return null;
  return "That doesn't look like a link - paste the carrier's full tracking URL (https://…).";
}

/** Parses the ship-cost input: blank clears it, anything non-numeric is rejected. */
function parseShipCost(raw: string | undefined): { value: number | null } | { error: string } {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { error: "Enter a valid ship cost." };
  return { value: roundCents(n) };
}

function parseDate(raw: string | undefined): Date | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** How a delivery reads in the activity log: "PO-123-1" or "HSS stock delivery". */
function deliveryLabel(d: { purchaseOrder: { poNumber: string | null } | null }): string {
  return d.purchaseOrder ? d.purchaseOrder.poNumber ?? "(no PO#)" : "HSS stock delivery";
}

/**
 * A new delivery leg on an order. `purchaseOrderId` empty = an HSS-stock leg
 * (the "New delivery from HSS stock" button); the chosen items move onto it.
 */
export async function createDelivery(
  orderId: string,
  mode: string,
  lineItemIds: string[],
  purchaseOrderId: string = ""
): Promise<ActionResult> {
  if (!isValidValue(DELIVERY_MODES, mode)) {
    return { ok: false, message: "Pick a delivery mode." };
  }
  return safeAction(async () => {
    const delivery = await prisma.delivery.create({
      data: { orderId, mode, purchaseOrderId: purchaseOrderId || null },
    });
    if (lineItemIds.length > 0) {
      await prisma.lineItem.updateMany({
        where: { id: { in: lineItemIds }, orderId, rfqStatus: { not: "removed" } },
        data: { deliveryId: delivery.id },
      });
    }
    await log(
      orderId,
      "delivery_created",
      `Delivery created (${labelFor(DELIVERY_MODES, mode)}) with ${lineItemIds.length} item(s)`
    );
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not create the delivery. Please try again.");
}

/**
 * The delivery modal's one save: the mode plus whichever legs that mode has.
 * Fields belonging to a leg the mode does not use are left untouched rather
 * than blanked, so flipping a mode back and forth never loses what was typed.
 */
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
  const mode = details.mode;
  if (!isValidValue(DELIVERY_MODES, mode)) {
    return { ok: false, message: "Pick a delivery mode." };
  }
  const carrierLeg = hasCarrierLeg(mode);
  const truckerLeg = hasTruckerLeg(mode);

  if (carrierLeg) {
    const urlError = trackingUrlError((details.trackingUrl ?? "").trim());
    if (urlError) return { ok: false, message: urlError };
  }
  let shipCost: number | null = null;
  if (truckerLeg) {
    const parsed = parseShipCost(details.shipCost);
    if ("error" in parsed) return { ok: false, message: parsed.error };
    shipCost = parsed.value;
  }

  return safeAction(async () => {
    const existing = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { orderId: true, purchaseOrder: { select: { poNumber: true } } },
    });
    if (!existing) throw new Error("Delivery not found");

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        mode,
        notes: (details.notes ?? "").trim() || null,
        ...(carrierLeg
          ? {
              trackingCarrier: (details.trackingCarrier ?? "").trim() || null,
              trackingUrl: (details.trackingUrl ?? "").trim() || null,
              expectedDelivery: parseDate(details.expectedDelivery),
            }
          : {}),
        ...(truckerLeg
          ? {
              trucker: (details.trucker ?? "").trim() || null,
              pickupAddress: (details.pickupAddress ?? "").trim() || null,
              scheduledDeliveryDate: parseDate(details.scheduledDeliveryDate),
              shipCost,
              chargedToCustomer: details.chargedToCustomer === true,
              deliveryContactPhone: (details.deliveryContactPhone ?? "").trim() || null,
            }
          : {}),
      },
    });
    await log(
      existing.orderId,
      "delivery_updated",
      `Delivery ${deliveryLabel(existing)} updated (${labelFor(DELIVERY_MODES, mode)})`
    );
    await recomputeOrderStatus(existing.orderId);
    revalidateOrder(existing.orderId);
  }, "Could not save the delivery. Please try again.");
}

/**
 * The status pill on every delivery row, and the "Mark delivered" button.
 * delivered_full lands the leg's items (arrived_complete + arrival date);
 * delivered_partial is item-by-item by definition, so it leaves them alone.
 */
export async function setDeliveryStatus(deliveryId: string, status: string): Promise<ActionResult> {
  if (!isValidValue(DELIVERY_LEG_STATUSES, status)) {
    return { ok: false, message: "Not a valid delivery status." };
  }
  return safeAction(async () => {
    const existing = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { orderId: true, deliveredAt: true, purchaseOrder: { select: { poNumber: true } } },
    });
    if (!existing) throw new Error("Delivery not found");

    const isDelivered = status === "delivered_full" || status === "delivered_partial";
    const now = new Date();
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status, deliveredAt: isDelivered ? existing.deliveredAt ?? now : null },
    });

    if (status === "delivered_full") {
      await prisma.lineItem.updateMany({
        where: { deliveryId, rfqStatus: { not: "removed" }, dateArrivedClient: null },
        data: { dateArrivedClient: now },
      });
      await prisma.lineItem.updateMany({
        where: { deliveryId, rfqStatus: { not: "removed" } },
        data: { deliveryStatus: "arrived_complete" },
      });
    }

    await log(
      existing.orderId,
      "delivery_status_set",
      `Delivery ${deliveryLabel(existing)} set to ${labelFor(DELIVERY_LEG_STATUSES, status)}`
    );
    await recomputeOrderStatus(existing.orderId);
    revalidateOrder(existing.orderId);
  }, "Could not update the delivery status. Please try again.");
}

/** Inline trucker pick from the /deliveries list (the full form lives in the delivery modal). */
export async function setDeliveryTrucker(deliveryId: string, trucker: string): Promise<ActionResult> {
  return safeAction(async () => {
    const existing = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { orderId: true, purchaseOrder: { select: { poNumber: true } } },
    });
    if (!existing) throw new Error("Delivery not found");
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { trucker: trucker.trim() || null },
    });
    await log(
      existing.orderId,
      "delivery_trucker_set",
      `Delivery ${deliveryLabel(existing)} trucker set to ${trucker.trim() || "none"}`
    );
    await recomputeOrderStatus(existing.orderId);
    revalidateOrder(existing.orderId);
  }, "Could not set the trucker. Please try again.");
}

/**
 * Split: the picked items move onto a brand-new leg on the same order and PO,
 * inheriting the mode. Splits happen when half a PO ships early - so the
 * original has to keep at least one item, otherwise this is just a no-op.
 */
export async function splitDelivery(deliveryId: string, lineItemIds: string[]): Promise<ActionResult> {
  if (lineItemIds.length === 0) {
    return { ok: false, message: "Pick at least one item to split off." };
  }
  return safeAction(async () => {
    const source = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        orderId: true,
        purchaseOrderId: true,
        mode: true,
        purchaseOrder: { select: { poNumber: true } },
        lineItems: { where: { rfqStatus: { not: "removed" } }, select: { id: true } },
      },
    });
    if (!source) throw new Error("Delivery not found");
    const moving = source.lineItems.filter((li) => lineItemIds.includes(li.id));
    if (moving.length === 0) throw new Error("Those items are not on this delivery");
    if (moving.length >= source.lineItems.length) {
      throw new Error("Leave at least one item behind - a split needs two legs");
    }

    const created = await prisma.delivery.create({
      data: {
        orderId: source.orderId,
        purchaseOrderId: source.purchaseOrderId,
        mode: source.mode,
      },
    });
    await prisma.lineItem.updateMany({
      where: { id: { in: moving.map((li) => li.id) } },
      data: { deliveryId: created.id },
    });
    await log(
      source.orderId,
      "delivery_split",
      `Delivery ${deliveryLabel(source)} split - ${moving.length} item(s) moved to a new leg`
    );
    await recomputeOrderStatus(source.orderId);
    revalidateOrder(source.orderId);
  }, "Could not split the delivery. Please try again.");
}

/**
 * Move items onto another leg of the same order. Merging two legs is this plus
 * deleteEmptyDelivery on the one that is left empty.
 */
export async function moveItemsToDelivery(
  targetDeliveryId: string,
  lineItemIds: string[]
): Promise<ActionResult> {
  if (lineItemIds.length === 0) {
    return { ok: false, message: "Pick at least one item to move." };
  }
  return safeAction(async () => {
    const target = await prisma.delivery.findUnique({
      where: { id: targetDeliveryId },
      select: { orderId: true, purchaseOrder: { select: { poNumber: true } } },
    });
    if (!target) throw new Error("Delivery not found");
    const moved = await prisma.lineItem.updateMany({
      // Same order only - an item never hops between orders.
      where: { id: { in: lineItemIds }, orderId: target.orderId, rfqStatus: { not: "removed" } },
      data: { deliveryId: targetDeliveryId },
    });
    await log(
      target.orderId,
      "delivery_items_moved",
      `${moved.count} item(s) moved to delivery ${deliveryLabel(target)}`
    );
    await recomputeOrderStatus(target.orderId);
    revalidateOrder(target.orderId);
  }, "Could not move the items. Please try again.");
}

/** Removes a leg that has nothing left on it (the second half of a merge). */
export async function deleteEmptyDelivery(deliveryId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const existing = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        orderId: true,
        purchaseOrder: { select: { poNumber: true } },
        _count: { select: { lineItems: true } },
      },
    });
    if (!existing) throw new Error("Delivery not found");
    if (existing._count.lineItems > 0) {
      throw new Error("Move its items to another delivery first");
    }
    await prisma.delivery.delete({ where: { id: deliveryId } });
    await log(existing.orderId, "delivery_deleted", `Empty delivery ${deliveryLabel(existing)} removed`);
    await recomputeOrderStatus(existing.orderId);
    revalidateOrder(existing.orderId);
  }, "Could not delete the delivery. Please try again.");
}

/**
 * PO "Advance to Shipped": the dialog's shipment details save onto the PO's
 * delivery, the leg goes in_transit, the PO advances, and any item still
 * sitting at pending/ordered starts moving (to HSS on mode 3, straight to the
 * client on a drop-ship). Advancing to any other status stays on
 * advancePoStatus above - including the payment gate on draft -> sent.
 */
export async function markPoShipped(
  poId: string,
  shipment: {
    trackingCarrier?: string;
    trackingUrl?: string;
    expectedDelivery?: string;
    trucker?: string;
    scheduledDeliveryDate?: string;
  }
): Promise<ActionResult> {
  const urlError = trackingUrlError((shipment.trackingUrl ?? "").trim());
  if (urlError) return { ok: false, message: urlError };

  return safeAction(async () => {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: {
        id: true,
        orderId: true,
        poNumber: true,
        status: true,
        shipTo: true,
        deliveries: { select: { id: true, mode: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!po) throw new Error("PO not found");
    if (po.status === "received") throw new Error("This PO has already been received");

    // A PO created before deliveries existed (or one whose leg was deleted)
    // gets its default leg now rather than losing the shipment details.
    let delivery = po.deliveries[0] ?? null;
    if (!delivery) {
      delivery = await prisma.delivery.create({
        data: { orderId: po.orderId, purchaseOrderId: po.id, mode: modeForShipTo(po.shipTo) },
        select: { id: true, mode: true },
      });
      await prisma.lineItem.updateMany({
        where: { purchaseOrderId: po.id, deliveryId: null },
        data: { deliveryId: delivery.id },
      });
    }

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "in_transit",
        trackingCarrier: (shipment.trackingCarrier ?? "").trim() || null,
        trackingUrl: (shipment.trackingUrl ?? "").trim() || null,
        expectedDelivery: parseDate(shipment.expectedDelivery),
        ...(hasTruckerLeg(delivery.mode)
          ? {
              trucker: (shipment.trucker ?? "").trim() || null,
              scheduledDeliveryDate: parseDate(shipment.scheduledDeliveryDate),
            }
          : {}),
      },
    });

    await prisma.lineItem.updateMany({
      where: { deliveryId: delivery.id, deliveryStatus: { in: ["pending", "ordered"] }, rfqStatus: { not: "removed" } },
      data: { deliveryStatus: inTransitItemStatus(delivery.mode) },
    });

    await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: "shipped" } });
    await log(
      po.orderId,
      "po_shipped",
      `PO ${po.poNumber ?? po.id} marked shipped - delivery in transit`
    );
    await recomputeOrderStatus(po.orderId);
    revalidateOrder(po.orderId);
  }, "Could not mark the PO shipped. Please try again.");
}

/**
 * Point the order at one of its customer's saved locations (Sep 3 plan A1.6).
 * The Location row is the link; `deliveryAddress` stays the snapshot the
 * delivery leg actually reads, so picking a site copies its address across.
 * An empty id unlinks the order without touching the address it already has.
 */
export async function setOrderLocation(orderId: string, locationId: string): Promise<ActionResult> {
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
 * The Invoice tab's TermsCard "Edit terms" save: re-runs applyTermsToOrder
 * (writes paymentTerms/termsNotes/depositRequired and rebuilds the
 * source="terms" invoices) in a transaction. Once a payment on the order has
 * been marked paid, terms are locked - only the notes can still change, so
 * the terms/deposit inputs are silently ignored rather than erroring (the UI
 * hides them once a payment is paid, this is the server-side backstop).
 */
export async function updateOrderTerms(
  orderId: string,
  input: { terms: string; depositAmount?: number | null; notes: string }
): Promise<ActionResult> {
  const denied = await requirePermission("terms.edit");
  if (denied) return denied;
  if (!isValidValue(PAYMENT_TERMS, input.terms)) {
    return { ok: false, message: "Pick a valid payment terms option." };
  }
  if (input.depositAmount != null && (!Number.isFinite(input.depositAmount) || input.depositAmount < 0)) {
    return { ok: false, message: "Enter a valid deposit amount." };
  }
  return safeAction(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderValue: true,
        payments: { select: { status: true } },
      },
    });
    if (!order) throw new Error("Order not found");
    const anyPaid = order.payments.some((p) => p.status === "paid");
    const notes = input.notes.trim() || null;

    if (anyPaid) {
      await prisma.order.update({ where: { id: orderId }, data: { termsNotes: notes } });
      await log(
        orderId,
        "terms_notes_updated",
        "Terms notes updated - terms and deposit are locked because a payment on this order is already paid"
      );
      revalidateOrder(orderId);
      return;
    }

    await prisma.$transaction((tx) =>
      applyTermsToOrder(tx, orderId, {
        terms: input.terms,
        value: order.orderValue ?? 0,
        depositAmount: input.depositAmount,
        notes,
      })
    );
    await recomputeOrderStatus(orderId);
    revalidateOrder(orderId);
  }, "Could not update the terms. Please try again.");
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
