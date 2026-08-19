"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES, labelFor } from "@/lib/constants";

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

async function logActivity(
  linkedType: string,
  linkedId: string,
  action: string,
  detail: string
) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType, linkedId, action, detail },
  });
}

/** Kanban card stage picker. */
export async function changeOpportunityStage(id: string, stage: string) {
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
}

export async function updateOpportunity(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");

  const updated = await prisma.opportunity.update({
    where: { id },
    data: {
      title: str(formData, "title") ?? "Untitled opportunity",
      stage: str(formData, "stage") ?? "new",
      companyId: str(formData, "companyId"),
      primaryContactId: str(formData, "primaryContactId"),
      salespersonId: str(formData, "salespersonId"),
      orderType: str(formData, "orderType") ?? "order",
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
      deliveryType: str(formData, "deliveryType"),
      openingSize: str(formData, "openingSize"),
      installationNeeded: bool(formData, "installationNeeded"),
      designStatus: str(formData, "designStatus") ?? "none",
      locationName: str(formData, "locationName"),
      deliveryAddress: str(formData, "deliveryAddress"),
      notes: str(formData, "notes"),
    },
  });

  await logActivity("opportunity", id, "opportunity_updated", `"${updated.title}" updated`);
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

  const updated = await prisma.opportunity.update({
    where: { id },
    data: { stage: "lost", lostReason },
  });
  await logActivity(
    "opportunity",
    id,
    "stage_changed",
    `"${updated.title}" marked Lost — reason: ${lostReason}`
  );

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

/**
 * Mark Won: promote the opportunity into an Order, carry its line items over,
 * and stage the first payment.
 */
export async function markOpportunityWon(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing opportunity id");

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: { lineItems: true },
  });
  if (!opportunity) throw new Error("Opportunity not found");

  const value = opportunity.value ?? 0;
  const isProject = opportunity.orderType === "project";
  const paymentType = isProject ? "deposit" : "full";
  const paymentAmount = Math.round(isProject ? value * 0.3 : value);

  const order = await prisma.$transaction(async (tx) => {
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

    await tx.opportunity.update({ where: { id: opportunity.id }, data: { stage: "won" } });

    await tx.payment.create({
      data: {
        orderId: created.id,
        type: paymentType,
        amount: paymentAmount,
        status: "pending",
        notes: isProject ? "30% deposit generated on win" : "Full payment generated on win",
      },
    });

    return created;
  });

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
    `Order created from opportunity "${opportunity.title}" (${paymentType} payment of $${paymentAmount} pending)`
  );

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${opportunity.id}`);
  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}
