"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  OPPORTUNITY_STAGES,
  RFQ_STATUSES,
  isValidValue,
  labelFor,
} from "@/lib/constants";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { recomputeOrderStatus, syncOrderValueFromLineItems } from "@/lib/flow";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { currentUserId } from "@/lib/identityServer";
import { roundCents } from "@/lib/money";
import { requirePermission } from "@/lib/permissionsServer";
import { requireActiveAssignee } from "@/lib/ownership";
import { cleanText, parseDateOnly, parseNonNegativeNumber, TEXT_LIMITS } from "@/lib/input";
import {
  CLOSED_STAGES,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  ORDER_TYPES,
} from "./_ui";

/** Won/Lost never move through a dropdown - they are side-effectful closes. */
const CLOSED_STAGE_MESSAGE =
  "Use the Close panel on the deal page - it creates the order and stages the payment.";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Money fields only - qty and the (unused) generic caller both treat null and
 * undefined the same way (falling back to a default), so folding negative/NaN
 * into `undefined` here is safe everywhere this is already called.
 */
function num(formData: FormData, key: string): number | null | undefined {
  return parseNonNegativeNumber(str(formData, key));
}

function date(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Same shape as str(), but capped so nothing unbounded reaches the database. */
function text(formData: FormData, key: string, max: number): string | null {
  const value = cleanText(formData.get(key), max);
  return value === "" ? null : value;
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
  const denied = await requirePermission("deals.edit");
  if (denied) return denied;
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
    // Qty feeds the order total the same as price does (Sep 3 QA #4's sync rule).
    if (item.orderId) await syncOrderValueFromLineItems(item.orderId);
    revalidateLineItem(item);
  }, "Could not update quantity. Please try again.");
}

/** Assignee is optional everywhere - an empty string clears it. */
export async function updateLineItemAssignee(
  lineItemId: string,
  assigneeId: string
): Promise<ActionResult> {
  const denied = await requirePermission("deals.edit");
  if (denied) return denied;
  const inactive = await requireActiveAssignee(assigneeId);
  if (inactive) return inactive;
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

export async function updateLineItemRfqStatus(lineItemId: string, rfqStatus: string): Promise<ActionResult> {
  const denied = await requirePermission("deals.edit");
  if (denied) return denied;
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
    // Moving into/out of "removed" changes which items count toward the order total.
    if (item.orderId) await syncOrderValueFromLineItems(item.orderId);
    revalidateLineItem(item);
  }, "Could not update RFQ status. Please try again.");
}

/**
 * Add a line item to an open deal.
 *
 * Intake is not the only moment items appear - the client adds a fryer on the callback,
 * and until now the only way in was the edit form, which has no item fields at all.
 */
export async function addLineItem(formData: FormData) {
  const opportunityId = str(formData, "opportunityId");
  if (!opportunityId) throw new Error("Missing opportunity id");

  const denied = await requirePermission("deals.edit");
  if (denied) redirect(`/pipeline/${opportunityId}?error=not_allowed`);

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
        // A new item has never been out for quote - it starts in the RFQ queue.
        rfqStatus: "needs_pricing",
      },
    });
    await logActivity(
      "line_item",
      item.id,
      "item_added",
      `"${item.name}" added to the deal (qty ${qty}) - needs pricing`
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
  const denied = await requirePermission("deals.edit");
  if (denied) return denied;
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

/**
 * The FlowStepper on the deal page IS the stage control (Aug 31 feedback) - each
 * open step is a form button bound to this. Same guard as changeOpportunityStage:
 * open stages only, so Won/Lost can never be written without their side effects.
 *
 * Bind the first two args at the call site: moveStageFromStepper.bind(null, id, stage).
 */
export async function moveStageFromStepper(
  id: string,
  stage: string,
  // The stepper's form carries no fields - everything it needs is bound above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<void> {
  if (!id) throw new Error("Missing opportunity id");
  const denied = await requirePermission("deals.edit");
  if (denied) redirect(`/pipeline/${id}?error=not_allowed`);
  if (!isValidValue(OPPORTUNITY_STAGES, stage) || CLOSED_STAGES.includes(stage)) {
    // Won/Lost live behind the Close panel; anything else is a tampered payload.
    redirect(`/pipeline/${id}`);
  }

  try {
    const before = await prisma.opportunity.findUnique({
      where: { id },
      select: { stage: true },
    });
    if (!before) throw new Error("Opportunity not found");
    // Closed deals render a non-clickable stepper; refuse a reopen through the back door.
    if (before.stage !== stage && !CLOSED_STAGES.includes(before.stage)) {
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
    }
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${id}?error=save_failed`);
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

export async function updateOpportunity(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");

  const denied = await requirePermission("deals.edit");
  if (denied) redirect(`/pipeline/${id}/edit?error=not_allowed`);

  // Validate the enum-shaped fields BEFORE the try, so redirect() isn't swallowed
  // by the catch that turns real save failures into ?error=save_failed.
  // The days-in-stage metric reads only "stage_changed" rows, so this read is also
  // what lets an edit-form stage move be logged instead of silently freezing it.
  const before = await prisma.opportunity.findUnique({
    where: { id },
    select: { stage: true, locationId: true },
  });
  if (!before) redirect(`/pipeline/${id}/edit?error=save_failed`);

  const stage = str(formData, "stage") ?? before.stage;
  if (!isValidValue(OPPORTUNITY_STAGES, stage)) {
    redirect(`/pipeline/${id}/edit?error=invalid_value`);
  }
  // Same rule as the dropdowns: this form cannot CLOSE a deal. An already-closed
  // deal keeping its own stage is fine - editing a won deal's notes must still work.
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

  // Server-side backstop for whatever the Settings tab currently requires
  // (native `required` on the form is client-only).
  const companyId = str(formData, "companyId");

  // Dates: reject anything unparseable outright instead of letting a bare
  // `new Date(raw)` silently become Invalid Date and get swallowed as "no date".
  const neededByDate = parseDateOnly(formData.get("neededByDate"));
  const estDueDate = parseDateOnly(formData.get("estDueDate"));
  const nextFollowUp = parseDateOnly(formData.get("nextFollowUp"));
  if (neededByDate === undefined || estDueDate === undefined || nextFollowUp === undefined) {
    redirect(`/pipeline/${id}/edit?error=invalid_date`);
  }

  // Money: a negative or non-numeric amount is rejected instead of written as-is.
  const value = num(formData, "value");
  const budget = num(formData, "budget");
  if (value === undefined || budget === undefined) {
    redirect(`/pipeline/${id}/edit?error=invalid_amount`);
  }

  const req = await getFieldRequirements();
  if (
    (req["opportunity.companyId"] && !companyId) ||
    (req["opportunity.neededByDate"] && !neededByDate)
  ) {
    redirect(`/pipeline/${id}/edit?error=missing_required`);
  }

  // Salesperson: an inactive teammate can't be handed new open work.
  const salespersonId = str(formData, "salespersonId");
  const inactiveAssignee = await requireActiveAssignee(salespersonId);
  if (inactiveAssignee) redirect(`/pipeline/${id}/edit?error=inactive_assignee`);

  // Primary contact: same rule as the location check below - a contact from a
  // different business than the deal's is a tampered payload (or a stale pick
  // left over from switching the company dropdown), not a real choice.
  const primaryContactId = str(formData, "primaryContactId");
  if (primaryContactId && companyId) {
    const contact = await prisma.contact.findUnique({
      where: { id: primaryContactId },
      select: { companyId: true },
    });
    if (contact && contact.companyId !== companyId) {
      redirect(`/pipeline/${id}/edit?error=contact_mismatch`);
    }
  }

  // Location: only a site on this deal's business can be picked. Moving to a
  // different one copies its name and address into the snapshot fields, which
  // stay hand-editable afterwards (the form posts them as typed).
  const pickedLocationId = str(formData, "locationId");
  let locationId: string | null = null;
  let copiedFromLocation: { locationName: string; deliveryAddress: string } | null = null;
  if (pickedLocationId) {
    const picked = await prisma.location.findUnique({
      where: { id: pickedLocationId },
      select: { id: true, companyId: true, name: true, address: true },
    });
    if (picked && (!companyId || picked.companyId === companyId)) {
      locationId = picked.id;
      if (picked.id !== before.locationId) {
        copiedFromLocation = { locationName: picked.name, deliveryAddress: picked.address };
      }
    }
  }

  try {
    const updated = await prisma.opportunity.update({
      where: { id },
      data: {
        title: text(formData, "title", TEXT_LIMITS.short) ?? "Untitled opportunity",
        stage,
        companyId,
        primaryContactId,
        salespersonId,
        orderType,
        needsPricing: bool(formData, "needsPricing"),
        value,
        neededByDate,
        estDueDate,
        nextFollowUp,
        lostReason: text(formData, "lostReason", TEXT_LIMITS.medium),
        facilityType: text(formData, "facilityType", TEXT_LIMITS.short),
        menu: text(formData, "menu", TEXT_LIMITS.medium),
        roomDimensions: text(formData, "roomDimensions", TEXT_LIMITS.short),
        wallMeasurements: text(formData, "wallMeasurements", TEXT_LIMITS.short),
        plumbingElectricalNotes: text(formData, "plumbingElectricalNotes", TEXT_LIMITS.long),
        budget,
        clientVisionNotes: text(formData, "clientVisionNotes", TEXT_LIMITS.long),
        deliveryType,
        openingSize: text(formData, "openingSize", TEXT_LIMITS.short),
        installationNeeded: bool(formData, "installationNeeded"),
        designStatus,
        locationId,
        locationName: copiedFromLocation?.locationName ?? text(formData, "locationName", TEXT_LIMITS.short),
        deliveryAddress:
          copiedFromLocation?.deliveryAddress ?? text(formData, "deliveryAddress", TEXT_LIMITS.medium),
        notes: text(formData, "notes", TEXT_LIMITS.long),
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
  const denied = await requirePermission("deals.close");
  if (denied) redirect(`/pipeline/${id}?error=not_allowed`);
  const lostReason = str(formData, "lostReason");

  // A lost reason is mandatory - bounce back to the detail page with an error.
  if (!lostReason) {
    redirect(`/pipeline/${id}?error=lost_reason_required`);
  }

  try {
    const updated = await prisma.opportunity.update({
      where: { id },
      // A closed deal has no next step - leaving the follow-up date behind puts a
      // permanent "Follow up overdue" chip on a deal nobody should be chasing.
      data: { stage: "lost", lostReason, nextFollowUp: null },
    });
    await logActivity(
      "opportunity",
      id,
      "stage_changed",
      `"${updated.title}" marked Lost - reason: ${lostReason}`
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
 * Mark Won - driven by the Close panel on the deal page (Aug 31 feedback): the
 * salesperson confirms the price agreed, where it is going, when it is needed
 * and what was agreed on terms. Those answers ARE the order: the value, the
 * location and the free-text terms.
 *
 * Sep 4 (client): no invoice is ever created here. The terms are free text, and
 * the payment gate falls back to the account's own rule
 * (Company.requiresDeposit / depositPercent, see evaluatePaymentGate).
 */
export async function markOpportunityWon(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");
  const denied = await requirePermission("deals.close");
  if (denied) redirect(`/pipeline/${id}?error=not_allowed`);

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      lineItems: true,
      orders: { select: { id: true } },
    },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  // Idempotency guard is on the ORDER, not on the stage: a double-click must not
  // create a second order, but a deal stuck at stage "won" with no order (the old
  // dropdown bypass) must still be able to run this as recovery.
  if (opportunity.orders.length > 0) {
    redirect(`/pipeline/${opportunity.id}`);
  }

  // Marks a submission from the Close panel, so a blank field reads as "asked and
  // left empty" instead of "this form didn't ask".
  const fromClosePanel = formData.get("closePanel") === "1";
  const submittedValue = num(formData, "value");

  // The gate and the deposit are both measured against this number. Winning at $0
  // invoices $0 and opens the gate on an unpaid order - refuse instead.
  // The Close panel requires it client-side; this is the server-side backstop.
  const rawValue =
    fromClosePanel && submittedValue != null && submittedValue > 0
      ? submittedValue
      : opportunity.value;
  if (!rawValue || rawValue <= 0) {
    redirect(`/pipeline/${opportunity.id}?error=value_required`);
  }
  // Money always lands rounded to cents (Sep 2 QA: floats were drifting).
  const value = roundCents(rawValue);

  // Sep 2 QA: winning used to spawn an order with no destination, no date and
  // no owner - already in fulfillment asking for POs. The Close panel now asks
  // for both; this is the server-side backstop.
  const closeDeliveryAddress = str(formData, "deliveryAddress");
  const closeNeededByDate = date(formData, "neededByDate");
  if (fromClosePanel && (!closeDeliveryAddress || !closeNeededByDate)) {
    redirect(`/pipeline/${opportunity.id}?error=destination_required`);
  }
  const orderDeliveryAddress = closeDeliveryAddress ?? opportunity.deliveryAddress;
  const orderNeededByDate = closeNeededByDate ?? opportunity.neededByDate;
  const closeLocationName = str(formData, "locationName");

  // The site picked in the Close panel carries into the order (and back onto the
  // deal). A location from another business is a tampered payload - ignore it.
  let orderLocationId: string | null = opportunity.locationId;
  const pickedLocationId = str(formData, "locationId");
  if (pickedLocationId) {
    const picked = await prisma.location.findUnique({
      where: { id: pickedLocationId },
      select: { id: true, companyId: true },
    });
    orderLocationId =
      picked && picked.companyId === opportunity.companyId ? picked.id : orderLocationId;
  }

  // Owner: the deal's salesperson, or whoever is signed in via "Working as".
  let ownerId: string | null = opportunity.salespersonId;
  if (!ownerId) {
    const cookieId = await currentUserId();
    if (cookieId) {
      const user = await prisma.user.findUnique({ where: { id: cookieId }, select: { id: true } });
      ownerId = user?.id ?? null;
    }
  }

  const isProject = opportunity.orderType === "project";

  // Whatever was agreed on the call, in the salesperson's own words. Nothing is
  // derived from it: depositRequired stays null so the gate reads the account's
  // deposit rule exactly as it did before terms existed.
  const termsNotes = str(formData, "termsNotes");

  // Customer PO # as read off AutoQuotes - typed once here so the order never
  // has to wait on someone adding it by hand afterward.
  const poNumber = str(formData, "poNumber");

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          title: opportunity.title,
          opportunityId: opportunity.id,
          companyId: opportunity.companyId,
          contactId: opportunity.primaryContactId,
          ownerId,
          orderType: opportunity.orderType,
          status: "new",
          orderValue: value,
          locationId: orderLocationId,
          deliveryAddress: orderDeliveryAddress,
          neededByDate: orderNeededByDate,
          // A project is quoted to the customer before the sales order goes
          // out; a straight order never is (see QUOTE_STATUSES).
          quoteStatus: isProject ? "needed" : "not_needed",
          termsNotes,
          paymentTerms: null,
          depositRequired: null,
          clientPoNumber: poNumber,
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
        // The price/destination/date agreed in the Close panel are the deal's
        // real terms - write them back so deal and order never disagree.
        data: {
          stage: "won",
          nextFollowUp: null,
          value,
          locationId: orderLocationId,
          ...(closeLocationName ? { locationName: closeLocationName } : {}),
          ...(closeDeliveryAddress ? { deliveryAddress: closeDeliveryAddress } : {}),
          ...(closeNeededByDate ? { neededByDate: closeNeededByDate } : {}),
        },
      });

      return created;
    });
  } catch (err) {
    console.error(err);
    redirect(`/pipeline/${opportunity.id}?error=save_failed`);
  }

  // The order is already committed at this point - logActivity never throws, so a
  // logging hiccup cannot make it look like the win didn't go through.
  const carried = opportunity.lineItems.filter((li) => li.rfqStatus !== "removed").length;
  await logActivity(
    "opportunity",
    opportunity.id,
    "stage_changed",
    `"${opportunity.title}" marked Won - order created with ${carried} line item(s)`
  );
  await logActivity(
    "order",
    order.id,
    "order_created",
    `Order created from opportunity "${opportunity.title}"${
      termsNotes ? ` - terms: ${termsNotes}` : " - no terms written yet"
    }${poNumber ? ` - PO #${poNumber}` : ""}`
  );

  // The order was created as "new"; re-derive it so it reads awaiting_payment (or
  // whatever the account's deposit terms actually imply) instead of a stale default.
  await recomputeOrderStatus(order.id);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${opportunity.id}`);
  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}
