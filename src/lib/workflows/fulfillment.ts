import type { Prisma, PrismaClient } from "@prisma/client";
import { safeAction, type ActionResult } from "../actionResult";
import type { ActivityLogMeta } from "../log";
import { evaluatePaymentGate } from "../flowRules";
import { isValidValue, labelFor, DELIVERY_MODES, DELIVERY_LEG_STATUSES } from "../constants";
import { plainMoney, roundCents } from "../money";
import { cleanText, parseDateOnly, TEXT_LIMITS } from "../input";
import { hasCarrierLeg, hasTruckerLeg, inTransitItemStatus, modeForShipTo } from "../../app/deliveries/_ui";
import { reconcileOrderStatus } from "./orderState";
import { serialTransaction } from "./transaction";

type FulfillmentEffects = {
  audit: (id: string, action: string, detail: string, meta?: ActivityLogMeta) => Promise<void>;
  refresh: (id: string) => void;
};

/** Complete transitions own the writes, derived status, and post-commit effects. */
export function createFulfillment(db: PrismaClient, effects: FulfillmentEffects) {
  async function transition<T>(work: (context: {
    prisma: Prisma.TransactionClient;
    log: FulfillmentEffects["audit"];
    revalidateOrder: FulfillmentEffects["refresh"];
    recomputeOrderStatus: (id: string) => Promise<string>;
  }) => Promise<T>) {
    const committed = await serialTransaction(db, async tx => {
      const events: Parameters<FulfillmentEffects["audit"]>[] = [];
      const orders = new Set<string>();
      const result = await work({
        prisma: tx,
        log: async (...event) => { events.push(event); },
        revalidateOrder: id => { orders.add(id); },
        recomputeOrderStatus: id => reconcileOrderStatus(tx, id),
      });
      return { result, events, orders };
    });
    for (const event of committed.events) await effects.audit(...event);
    for (const id of committed.orders) effects.refresh(id);
    return committed.result;
  }

  function shipToForMode(mode: string): string {
    return mode === "manufacturer_to_customer" ? "client_direct" : "hss";
  }
  const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];

  /**
   * The PO ladder, minus the one rung that needs facts typed in first: sent ->
   * acknowledged runs through acknowledgePo below, because acknowledgment is
   * where the delivery is born and its mode picked.
   *
   * draft -> sent is gated on payment. acknowledged -> shipped puts the PO's
   * delivery leg in transit and starts its items moving (into the HSS warehouse
   * on the two-leg mode, straight to the client on a drop-ship).
   */
  async function advancePoStatus(poId: string): Promise<ActionResult> {
    try {
      return await transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }): Promise<ActionResult> => {
        const po = plainMoney(
          await prisma.purchaseOrder.findUnique({
            where: { id: poId },
            include: {
              order: {
                include: {
                  payments: true,
                  company: { select: { requiresDeposit: true, depositPercent: true } },
                },
              },
              deliveries: { select: { id: true, mode: true }, orderBy: { createdAt: "asc" }, take: 1 },
            },
          })
        );
        if (!po) return { ok: false, message: "PO not found" };
        const idx = PO_ORDER.indexOf(po.status);
        if (idx < 0 || idx >= PO_ORDER.length - 1) return { ok: false, message: "Already at final status" };
        const next = PO_ORDER[idx + 1];

        if (next === "acknowledged") {
          return {
            ok: false,
            message: "Acknowledging a PO sets up its delivery - use the Acknowledge button so you can pick how it ships.",
          };
        }

        if (po.status === "draft" && next === "sent") {
          const gate = evaluatePaymentGate(po.order);
          if (!gate.open) {
            return { ok: false, message: gate.reason };
          }
        }

        const data: Record<string, unknown> = { status: next };
        if (next === "sent" && !po.sentDate) data.sentDate = new Date();

        if (next === "shipped") {
          // A PO acknowledged before this flow existed (or one whose leg was
          // deleted) gets its default leg now rather than shipping into nothing.
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
          await prisma.delivery.updateMany({
            where: { purchaseOrderId: po.id, status: { in: ["pending", "scheduled"] } },
            data: { status: "in_transit" },
          });
          await prisma.lineItem.updateMany({
            where: {
              purchaseOrderId: po.id,
              deliveryStatus: { in: ["pending", "ordered"] },
              rfqStatus: { not: "removed" },
            },
            data: { deliveryStatus: inTransitItemStatus(delivery.mode) },
          });
        }

        await prisma.purchaseOrder.update({ where: { id: poId }, data });
        await log(po.orderId, "po_status_advanced", `PO ${po.poNumber ?? po.id} advanced to ${next}`, {
          previousValue: po.status,
          newValue: next,
        });
        await recomputeOrderStatus(po.orderId);
        revalidateOrder(po.orderId);
        return { ok: true };
      });
    } catch (err) {
      console.error(err);
      return { ok: false, message: "Could not advance the PO. Please try again." };
    }
  }

  /**
   * "Acknowledge": the vendor has confirmed the PO, so this is the moment the
   * order stops being a purchase and becomes a shipment (Sep 8 2026 client call:
   * "when it's acknowledged, that's when it turns into a delivery"). One
   * acknowledged PO makes one delivery leg - splitting it is a job for the
   * Delivery tab - carrying the mode picked here plus whichever facts that mode
   * needs:
   *
   *   manufacturer_to_customer         carrier tracking + expected date
   *   hss_to_customer                  trucker + scheduled date + cost
   *   manufacturer_to_hss_to_customer  both
   *
   * Re-acknowledging a PO that already has a leg updates that leg rather than
   * making a second one.
   */
  async function acknowledgePo(
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
    const mode = details.mode;
    if (!isValidValue(DELIVERY_MODES, mode)) {
      return { ok: false, message: "Pick how this PO is coming over." };
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
    const expectedDelivery = parseDateOnly(details.expectedDelivery);
    if (expectedDelivery === undefined) return { ok: false, message: "Enter a valid date." };
    const scheduledDeliveryDate = parseDateOnly(details.scheduledDeliveryDate);
    if (scheduledDeliveryDate === undefined) return { ok: false, message: "Enter a valid date." };

    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        select: {
          id: true,
          orderId: true,
          poNumber: true,
          status: true,
          ackDate: true,
          supplier: { select: { deliveryAddress: true } },
          deliveries: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      });
      if (!po) throw new Error("PO not found");
      if (po.status === "draft") throw new Error("Send this PO to the vendor before acknowledging it");

      const legFields = {
        mode,
        notes: cleanText(details.notes, TEXT_LIMITS.long) || null,
        ...(carrierLeg
          ? {
            trackingCarrier: cleanText(details.trackingCarrier, TEXT_LIMITS.short) || null,
            trackingUrl: cleanText(details.trackingUrl, TEXT_LIMITS.medium) || null,
            expectedDelivery,
          }
          : {}),
        ...(truckerLeg
          ? {
            trucker: cleanText(details.trucker, TEXT_LIMITS.short) || null,
            // The vendor's own address is the pickup point unless someone says
            // otherwise - it is the one HSS's driver actually goes to.
            pickupAddress:
              cleanText(details.pickupAddress, TEXT_LIMITS.medium) || po.supplier?.deliveryAddress || null,
            scheduledDeliveryDate,
            shipCost,
            chargedToCustomer: details.chargedToCustomer === true,
            deliveryContactPhone: cleanText(details.deliveryContactPhone, TEXT_LIMITS.short) || null,
          }
          : {}),
      };

      const existingLeg = po.deliveries[0] ?? null;
      let deliveryId: string;
      if (existingLeg) {
        await prisma.delivery.update({ where: { id: existingLeg.id }, data: legFields });
        deliveryId = existingLeg.id;
      } else {
        const created = await prisma.delivery.create({
          data: { orderId: po.orderId, purchaseOrderId: po.id, ...legFields },
        });
        deliveryId = created.id;
      }

      // Everything on the PO that isn't already riding another leg travels on
      // this one (a split later moves items off it, never back onto the PO).
      await prisma.lineItem.updateMany({
        where: { purchaseOrderId: po.id, deliveryId: null, rfqStatus: { not: "removed" } },
        data: { deliveryId },
      });

      // A PO already shipped or received keeps that status - re-running this on
      // one (to correct its delivery) must not walk the ladder backwards.
      const alreadyMovedOn = po.status === "shipped" || po.status === "received";
      await prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          ...(alreadyMovedOn ? {} : { status: "acknowledged" }),
          ackDate: po.ackDate ?? new Date(),
          shipTo: shipToForMode(mode),
        },
      });

      await log(
        po.orderId,
        "po_acknowledged",
        `PO ${po.poNumber ?? po.id} acknowledged - delivery set to ${labelFor(DELIVERY_MODES, mode)}`
      );
      await recomputeOrderStatus(po.orderId);
      revalidateOrder(po.orderId);
    }), "Could not acknowledge the PO. Please try again.");
  }

  // ---------------------------------------------------------------------------
  // Deliveries (plan §3B). A Delivery is one delivery leg: one acknowledged PO ->
  // one Delivery (see acknowledgePo above), splittable, and HSS-stock legs carry
  // no PO at all. Every logistics field lives on Delivery, never on PurchaseOrder.
  // ---------------------------------------------------------------------------

  /**
   * Free-text tracking link guard: this field has a history of junk ("gewryher",
   * a chat link saved as tracking), so only a real absolute link is ever stored.
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

  /** How a delivery reads in the activity log: "PO-123-1" or "HSS stock delivery". */
  function deliveryLabel(d: { purchaseOrder: { poNumber: string | null } | null }): string {
    return d.purchaseOrder ? d.purchaseOrder.poNumber ?? "(no PO#)" : "HSS stock delivery";
  }

  /**
   * A new delivery leg on an order. `purchaseOrderId` empty = an HSS-stock leg
   * (the "New delivery from HSS stock" button); the chosen items move onto it.
   */
  async function createDelivery(
    orderId: string,
    mode: string,
    lineItemIds: string[],
    purchaseOrderId: string = ""
  ): Promise<ActionResult> {
    if (!isValidValue(DELIVERY_MODES, mode)) {
      return { ok: false, message: "Pick a delivery mode." };
    }
    try {
      return await transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }): Promise<ActionResult> => {
        if (purchaseOrderId) {
          const po = await prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            select: { orderId: true },
          });
          if (!po || po.orderId !== orderId) {
            return { ok: false, message: "That purchase order belongs to a different order." };
          }
        }
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
        return { ok: true };
      });
    } catch (error) {
      console.error(error);
      return { ok: false, message: "Could not create the delivery. Please try again." };
    }
  }

  /**
   * The delivery modal's one save: the mode plus whichever legs that mode has.
   * Fields belonging to a leg the mode does not use are left untouched rather
   * than blanked, so flipping a mode back and forth never loses what was typed.
   */
  async function updateDelivery(
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
    const expectedDelivery = parseDateOnly(details.expectedDelivery);
    if (expectedDelivery === undefined) return { ok: false, message: "Enter a valid date." };
    const scheduledDeliveryDate = parseDateOnly(details.scheduledDeliveryDate);
    if (scheduledDeliveryDate === undefined) return { ok: false, message: "Enter a valid date." };

    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
      const existing = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: { orderId: true, purchaseOrderId: true, purchaseOrder: { select: { poNumber: true } } },
      });
      if (!existing) throw new Error("Delivery not found");

      await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          mode,
          notes: cleanText(details.notes, TEXT_LIMITS.long) || null,
          ...(carrierLeg
            ? {
              trackingCarrier: cleanText(details.trackingCarrier, TEXT_LIMITS.short) || null,
              trackingUrl: cleanText(details.trackingUrl, TEXT_LIMITS.medium) || null,
              expectedDelivery,
            }
            : {}),
          ...(truckerLeg
            ? {
              trucker: cleanText(details.trucker, TEXT_LIMITS.short) || null,
              pickupAddress: cleanText(details.pickupAddress, TEXT_LIMITS.medium) || null,
              scheduledDeliveryDate,
              shipCost,
              chargedToCustomer: details.chargedToCustomer === true,
              deliveryContactPhone: cleanText(details.deliveryContactPhone, TEXT_LIMITS.short) || null,
            }
            : {}),
        },
      });

      // The PO's ship-to is a read of its delivery mode, so changing the mode
      // here keeps it honest rather than leaving the PO claiming a route the
      // goods no longer take.
      if (existing.purchaseOrderId) {
        await prisma.purchaseOrder.update({
          where: { id: existing.purchaseOrderId },
          data: { shipTo: shipToForMode(mode) },
        });
      }

      await log(
        existing.orderId,
        "delivery_updated",
        `Delivery ${deliveryLabel(existing)} updated (${labelFor(DELIVERY_MODES, mode)})`
      );
      await recomputeOrderStatus(existing.orderId);
      revalidateOrder(existing.orderId);
    }), "Could not save the delivery. Please try again.");
  }

  /**
   * The status pill on every delivery row, and the "Mark delivered" button.
   * delivered_full lands the leg's items (arrived_complete + arrival date);
   * delivered_partial is item-by-item by definition, so it leaves them alone.
   */
  async function setDeliveryStatus(deliveryId: string, status: string): Promise<ActionResult> {
    if (!isValidValue(DELIVERY_LEG_STATUSES, status)) {
      return { ok: false, message: "Not a valid delivery status." };
    }
    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
      const existing = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: { orderId: true, status: true, deliveredAt: true, purchaseOrder: { select: { poNumber: true } } },
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
        `Delivery ${deliveryLabel(existing)} set to ${labelFor(DELIVERY_LEG_STATUSES, status)}`,
        { previousValue: existing.status, newValue: status }
      );
      await recomputeOrderStatus(existing.orderId);
      revalidateOrder(existing.orderId);
    }), "Could not update the delivery status. Please try again.");
  }

  /** Inline trucker pick from the /deliveries list (the full form lives in the delivery modal). */
  async function setDeliveryTrucker(deliveryId: string, trucker: string): Promise<ActionResult> {
    const trimmed = cleanText(trucker, TEXT_LIMITS.short);
    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
      const existing = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        select: { orderId: true, purchaseOrder: { select: { poNumber: true } } },
      });
      if (!existing) throw new Error("Delivery not found");
      await prisma.delivery.update({
        where: { id: deliveryId },
        data: { trucker: trimmed || null },
      });
      await log(
        existing.orderId,
        "delivery_trucker_set",
        `Delivery ${deliveryLabel(existing)} trucker set to ${trimmed || "none"}`
      );
      await recomputeOrderStatus(existing.orderId);
      revalidateOrder(existing.orderId);
    }), "Could not set the trucker. Please try again.");
  }

  /**
   * Split: the picked items move onto a brand-new leg on the same order and PO,
   * inheriting the mode. Splits happen when half a PO ships early - so the
   * original has to keep at least one item, otherwise this is just a no-op.
   */
  async function splitDelivery(deliveryId: string, lineItemIds: string[]): Promise<ActionResult> {
    if (lineItemIds.length === 0) {
      return { ok: false, message: "Pick at least one item to split off." };
    }
    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
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
    }), "Could not split the delivery. Please try again.");
  }

  /**
   * Move items onto another leg of the same order. Merging two legs is this plus
   * deleteEmptyDelivery on the one that is left empty.
   */
  async function moveItemsToDelivery(
    targetDeliveryId: string,
    lineItemIds: string[]
  ): Promise<ActionResult> {
    if (lineItemIds.length === 0) {
      return { ok: false, message: "Pick at least one item to move." };
    }
    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
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
    }), "Could not move the items. Please try again.");
  }

  /** Removes a leg that has nothing left on it (the second half of a merge). */
  async function deleteEmptyDelivery(deliveryId: string): Promise<ActionResult> {
    return safeAction(() => transition(async ({ prisma, log, revalidateOrder, recomputeOrderStatus }) => {
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
    }), "Could not delete the delivery. Please try again.");
  }


  return { advancePoStatus, acknowledgePo, createDelivery, updateDelivery, setDeliveryStatus, setDeliveryTrucker, splitDelivery, moveItemsToDelivery, deleteEmptyDelivery };
}
