"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES, RFQ_STATUSES, isValidValue, labelFor } from "@/lib/constants";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { recomputeOrderStatus } from "@/lib/flow";
import {
  CLOSED_STAGES,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  ORDER_TYPES,
} from "./_ui";

/** Won/Lost never move through a dropdown — they are side-effectful closes. */
const CLOSED_STAGE_MESSAGE =
  "Use Mark Won / Mark Lost on the deal page — they create the order and payment.";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function num(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (raw == null) return null;
  const parsed = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function date(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "1";
}

// ---------------------------------------------------------------------------
// Line-item editing from the opportunity detail page.
// Each one revalidates /rfq too, since the same rows drive the purchasing queue.
// ---------------------------------------------------------------------------

/** Revalidate every surface a line-item edit is visible on. */
function revalidateLineItem(item: { opportunityId: string | null; orderId: string | null }) {
  if (item.opportunityId) revalidatePath(`/pipeline/${item.opportunityId}`);
  revalidatePath("/pipeline");
  revalidatePath("/rfq");
  // The same LineItem also surfaces under its order once the deal is won.
  revalidatePath("/orders");
  if (item.orderId) revalidatePath(`/orders/${item.orderId}`);
}

export async function updateLineItemQty(lineItemId: string, qty: number): Promise<ActionResult> {
  return safeAction(async () => {
    const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { qty: safeQty },
    });
    await logActivity(
      "line_item",
      lineItemId,
      "qty_changed",
      `"${item.name}" quantity set to ${safeQty}`
    );
    revalidateLineItem(item);
  }, "Could not update quantity. Please try again.");
}

/** Assignee is optional everywhere — an empty string clears it. */
export async function updateLineItemAssignee(
  lineItemId: string,
  assigneeId: string
): Promise<ActionResult> {
  return safeAction(async () => {
    const nextId = assigneeId || null;
    const assignee = nextId
      ? await prisma.user.findUnique({ where: { id: nextId }, select: { id: true, name: true } })
      : null;

    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { assigneeId: assignee?.id ?? null },
    });
    await logActivity(
      "line_item",
      lineItemId,
      "assignee_changed",
      `"${item.name}" assigned to ${assignee?.name ?? "nobody"}`
    );
    revalidateLineItem(item);
  }, "Could not update the assignee. Please try again.");
}

export async function updateLineItemPricing(
  lineItemId: string,
  unitCost: number | null,
  unitPrice: number | null
): Promise<ActionResult> {
  return safeAction(async () => {
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { unitCost, unitPrice },
    });
    await logActivity(
      "line_item",
      lineItemId,
      "pricing_changed",
      `"${item.name}" cost ${unitCost ?? "cleared"} / price ${unitPrice ?? "cleared"}`
    );
    revalidateLineItem(item);
  }, "Could not update pricing. Please try again.");
}

export async function updateLineItemRfqStatus(lineItemId: string, rfqStatus: string): Promise<ActionResult> {
  if (!isValidValue(RFQ_STATUSES, rfqStatus)) {
    return { ok: false, message: "That is not a valid RFQ status." };
  }
  return safeAction(async () => {
    const item = await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { rfqStatus },
    });
    await logActivity(
      "line_item",
      lineItemId,
      "rfq_status_changed",
      `"${item.name}" RFQ status set to ${labelFor(RFQ_STATUSES, rfqStatus)}`
    );
    revalidateLineItem(item);
  }, "Could not update RFQ status. Please try again.");
}

/**
 * Add a line item to an open deal.
 *
 * Intake is not the only moment items appear — the client adds a fryer on the callback,
 * and until now the only way in was the edit form, which has no item fields at all.
 */
export async function addLineItem(formData: FormData) {
  const opportunityId = str(formData, "opportunityId");
  if (!opportunityId) throw new Error("Missing opportunity id");

  const name = str(formData, "name");
  if (!name) redirect(`/pipeline/${opportunityId}?error=item_name_required`);

  const parsedQty = num(formData, "qty");
  const qty = parsedQty != null && parsedQty > 0 ? Math.floor(parsedQty) : 1;
  const description = str(formData, "description");

  try {
    const item = await prisma.lineItem.create({
      data: {
        opportunityId,
        name,
        description,
        qty,
        // A new item has never been out for quote — it starts in the RFQ queue.
        rfqStatus: "needs_pricing",
      },
    });
    await logActivity(
      "line_item",
      item.id,
      "item_added",
      `"${item.name}" added to the deal (qty ${qty}) — needs pricing`
    );
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${opportunityId}?error=save_failed`);
  }

  revalidatePath(`/pipeline/${opportunityId}`);
  revalidatePath("/pipeline");
  revalidatePath("/rfq");
  redirect(`/pipeline/${opportunityId}`);
}

/** Kanban card stage picker. */
export async function changeOpportunityStage(id: string, stage: string): Promise<ActionResult> {
  if (!isValidValue(OPPORTUNITY_STAGES, stage)) {
    return { ok: false, message: "That is not a valid stage." };
  }
  // Closing a deal creates an order, carries the line items and stages a payment.
  // A bare stage write would skip all of it and leave a "won" deal with no order.
  if (CLOSED_STAGES.includes(stage)) {
    return { ok: false, message: CLOSED_STAGE_MESSAGE };
  }

  return safeAction(async () => {
    const before = await prisma.opportunity.findUnique({ where: { id } });
    if (!before) throw new Error("Opportunity not found");
    if (before.stage === stage) return;

    await prisma.opportunity.update({ where: { id }, data: { stage } });
    await logActivity(
      "opportunity",
      id,
      "stage_changed",
      `Stage moved from ${labelFor(OPPORTUNITY_STAGES, before.stage)} to ${labelFor(
        OPPORTUNITY_STAGES,
        stage
      )}`
    );

    revalidatePath("/pipeline");
    revalidatePath(`/pipeline/${id}`);
  }, "Could not move the deal. Please try again.");
}

export async function updateOpportunity(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");

  // Validate the enum-shaped fields BEFORE the try, so redirect() isn't swallowed
  // by the catch that turns real save failures into ?error=save_failed.
  // The days-in-stage metric reads only "stage_changed" rows, so this read is also
  // what lets an edit-form stage move be logged instead of silently freezing it.
  const before = await prisma.opportunity.findUnique({
    where: { id },
    select: { stage: true },
  });
  if (!before) redirect(`/pipeline/${id}/edit?error=save_failed`);

  const stage = str(formData, "stage") ?? before.stage;
  if (!isValidValue(OPPORTUNITY_STAGES, stage)) {
    redirect(`/pipeline/${id}/edit?error=invalid_value`);
  }
  // Same rule as the dropdowns: this form cannot CLOSE a deal. An already-closed
  // deal keeping its own stage is fine — editing a won deal's notes must still work.
  if (CLOSED_STAGES.includes(stage) && stage !== before.stage) {
    redirect(`/pipeline/${id}/edit?error=stage_locked`);
  }

  const orderType = str(formData, "orderType") ?? "order";
  const designStatus = str(formData, "designStatus") ?? "none";
  const deliveryType = str(formData, "deliveryType");
  if (
    !isValidValue(ORDER_TYPES, orderType) ||
    !isValidValue(DESIGN_STATUSES, designStatus) ||
    (deliveryType != null && !isValidValue(DELIVERY_TYPES, deliveryType))
  ) {
    redirect(`/pipeline/${id}/edit?error=invalid_value`);
  }

  try {
    const updated = await prisma.opportunity.update({
      where: { id },
      data: {
        title: str(formData, "title") ?? "Untitled opportunity",
        stage,
        companyId: str(formData, "companyId"),
        primaryContactId: str(formData, "primaryContactId"),
        salespersonId: str(formData, "salespersonId"),
        orderType,
        needsPricing: bool(formData, "needsPricing"),
        value: num(formData, "value"),
        neededByDate: date(formData, "neededByDate"),
        estDueDate: date(formData, "estDueDate"),
        nextFollowUp: date(formData, "nextFollowUp"),
        lostReason: str(formData, "lostReason"),
        facilityType: str(formData, "facilityType"),
        menu: str(formData, "menu"),
        roomDimensions: str(formData, "roomDimensions"),
        wallMeasurements: str(formData, "wallMeasurements"),
        plumbingElectricalNotes: str(formData, "plumbingElectricalNotes"),
        budget: num(formData, "budget"),
        clientVisionNotes: str(formData, "clientVisionNotes"),
        deliveryType,
        openingSize: str(formData, "openingSize"),
        installationNeeded: bool(formData, "installationNeeded"),
        designStatus,
        locationName: str(formData, "locationName"),
        deliveryAddress: str(formData, "deliveryAddress"),
        notes: str(formData, "notes"),
      },
    });
    await logActivity("opportunity", id, "opportunity_updated", `"${updated.title}" updated`);

    if (before.stage !== stage) {
      await logActivity(
        "opportunity",
        id,
        "stage_changed",
        `Stage moved from ${labelFor(OPPORTUNITY_STAGES, before.stage)} to ${labelFor(
          OPPORTUNITY_STAGES,
          stage
        )}`
      );
    }
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${id}/edit?error=save_failed`);
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

export async function markOpportunityLost(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");
  const lostReason = str(formData, "lostReason");

  // A lost reason is mandatory — bounce back to the detail page with an error.
  if (!lostReason) {
    redirect(`/pipeline/${id}?error=lost_reason_required`);
  }

  try {
    const updated = await prisma.opportunity.update({
      where: { id },
      // A closed deal has no next step — leaving the follow-up date behind puts a
      // permanent "Follow up overdue" chip on a deal nobody should be chasing.
      data: { stage: "lost", lostReason, nextFollowUp: null },
    });
    await logActivity(
      "opportunity",
      id,
      "stage_changed",
      `"${updated.title}" marked Lost — reason: ${lostReason}`
    );
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${id}?error=save_failed`);
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

/**
 * Mark Won: promote the opportunity into an Order, carry its line items over,
 * and stage the first payment.
 *
 * Deposit terms are per-account (Company.requiresDeposit / depositPercent), not a
 * flat 30%. When the account takes no deposit, nothing is staged at Won time — HSS
 * collects the full amount after delivery instead.
 */
export async function markOpportunityWon(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      lineItems: true,
      orders: { select: { id: true } },
      company: { select: { requiresDeposit: true, depositPercent: true } },
    },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  // Idempotency guard is on the ORDER, not on the stage: a double-click must not
  // create a second order, but a deal stuck at stage "won" with no order (the old
  // dropdown bypass) must still be able to run this as recovery.
  if (opportunity.orders.length > 0) {
    redirect(`/pipeline/${opportunity.id}`);
  }

  // The deposit and the payment gate are both percentages of this number. Winning at
  // $0 stages a $0 payment and opens the gate on an unpaid order — refuse instead.
  if (!opportunity.value || opportunity.value <= 0) {
    redirect(`/pipeline/${opportunity.id}?error=value_required`);
  }

  const value = opportunity.value;
  const isProject = opportunity.orderType === "project";
  // No company on the deal — fall back to the old house default rather than skipping the deposit.
  const requiresDeposit = opportunity.company?.requiresDeposit ?? true;
  const depositPercent = opportunity.company?.depositPercent ?? 30;

  const payment = isProject
    ? requiresDeposit
      ? {
          type: "deposit",
          amount: Math.round((value * depositPercent) / 100),
          notes: `${depositPercent}% deposit generated on win`,
        }
      : null
    : { type: "full", amount: Math.round(value), notes: "Full payment generated on win" };

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          title: opportunity.title,
          opportunityId: opportunity.id,
          companyId: opportunity.companyId,
          contactId: opportunity.primaryContactId,
          ownerId: opportunity.salespersonId,
          orderType: opportunity.orderType,
          status: "new",
          orderValue: opportunity.value,
          deliveryAddress: opportunity.deliveryAddress,
          neededByDate: opportunity.neededByDate,
        },
      });

      // Every line item that wasn't removed follows the deal into the order.
      await tx.lineItem.updateMany({
        where: { opportunityId: opportunity.id, rfqStatus: { not: "removed" } },
        data: { orderId: created.id },
      });

      await tx.opportunity.update({
        where: { id: opportunity.id },
        // Clearing the follow-up keeps closed deals out of the overdue chips.
        data: { stage: "won", nextFollowUp: null },
      });

      if (payment) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            type: payment.type,
            amount: payment.amount,
            status: "pending",
            notes: payment.notes,
          },
        });
      }

      return created;
    });
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${opportunity.id}?error=save_failed`);
  }

  // The order is already committed at this point — logActivity never throws, so a
  // logging hiccup cannot make it look like the win didn't go through.
  const carried = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed").length;
  await logActivity(
    "opportunity",
    opportunity.id,
    "stage_changed",
    `"${opportunity.title}" marked Won — order created with ${carried} line item(s)`
  );
  await logActivity(
    "order",
    order.id,
    "order_created",
    `Order created from opportunity "${opportunity.title}" (${
      payment
        ? `${payment.type} payment of $${payment.amount} pending`
        : "no deposit required for this account — full payment due after delivery"
    })`
  );

  // The order was created as "new"; re-derive it so it reads awaiting_payment (or
  // whatever the account's deposit terms actually imply) instead of a stale default.
  await recomputeOrderStatus(order.id);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${opportunity.id}`);
  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}
