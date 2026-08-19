"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function date(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function all(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((v) => (typeof v === "string" ? v : ""));
}

/** Snapshot the raw submission so the intake can always be audited later. */
function formSnapshot(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

type ParsedItem = { name: string; moreDetails: string | null; qty: number };

function parseItems(formData: FormData): ParsedItem[] {
  const names = all(formData, "itemName");
  const details = all(formData, "itemDetails");
  const qtys = all(formData, "itemQty");

  const items: ParsedItem[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = (names[i] ?? "").trim();
    if (!name) continue;
    const detail = (details[i] ?? "").trim();
    const qty = Number.parseInt((qtys[i] ?? "1").trim(), 10);
    items.push({
      name,
      moreDetails: detail === "" ? null : detail,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    });
  }
  return items;
}

/**
 * HSS "Sales Process 2.0" intake.
 *
 * Projects (and any order that still needs pricing) enter the sales pipeline as an
 * Opportunity whose items need quoting. A straight re-order with pricing already in
 * hand skips the pipeline and becomes an Order right away.
 */
export async function submitIntake(formData: FormData) {
  const clientMode = str(formData, "clientMode") ?? "existing";
  const orderType = str(formData, "orderType") === "project" ? "project" : "order";
  const needsPricing = formData.get("needsPricing") === "yes";
  const neededByDate = date(formData, "neededByDate");
  const items = parseItems(formData);
  const payload = JSON.stringify(formSnapshot(formData));

  const goesToPipeline = orderType === "project" || needsPricing;

  const result = await prisma.$transaction(async (tx) => {
    // --- client -----------------------------------------------------------
    let companyId: string | null = null;
    let companyName = "New client";

    if (clientMode === "new") {
      const company = await tx.company.create({
        data: {
          name: str(formData, "newCompanyName") ?? "New client",
          type: "customer",
          billingAddress: str(formData, "newCompanyAddress"),
          phone: str(formData, "newCompanyPhone"),
          phoneExt: str(formData, "newCompanyPhoneExt"),
          cellPhone: str(formData, "newCompanyCellPhone"),
          email: str(formData, "newCompanyEmail"),
          deliveryAddress: str(formData, "newCompanyDeliveryAddress"),
          locationName: str(formData, "newCompanyLocationName"),
        },
      });
      companyId = company.id;
      companyName = company.name;
    } else {
      companyId = str(formData, "companyId");
      if (companyId) {
        const company = await tx.company.findUnique({ where: { id: companyId } });
        companyName = company?.name ?? companyName;
      }
    }

    // --- contact ----------------------------------------------------------
    let contactId: string | null = null;
    const contactMode = str(formData, "contactMode") ?? "existing";

    if (clientMode === "new" || contactMode === "new") {
      const firstName = str(formData, "newContactFirstName");
      if (firstName) {
        const contact = await tx.contact.create({
          data: {
            firstName,
            lastName: str(formData, "newContactLastName"),
            title: str(formData, "newContactTitle"),
            email: str(formData, "newContactEmail"),
            phone: str(formData, "newContactPhone"),
            phoneExt: str(formData, "newContactPhoneExt"),
            cellPhone: str(formData, "newContactCellPhone"),
            companyId,
          },
        });
        contactId = contact.id;
      }
    } else {
      contactId = str(formData, "contactId");
    }

    const title = `${companyName} - ${new Date().toISOString().slice(0, 10)}`;
    const deliveryAddress =
      str(formData, "deliveryAddress") ?? str(formData, "newCompanyDeliveryAddress");

    // --- opportunity or order --------------------------------------------
    if (goesToPipeline) {
      const opportunity = await tx.opportunity.create({
        data: {
          title,
          companyId,
          primaryContactId: contactId,
          salespersonId: str(formData, "salespersonId"),
          stage: "new",
          orderType,
          needsPricing: true,
          neededByDate,
          deliveryAddress,
          locationName: str(formData, "locationName") ?? str(formData, "newCompanyLocationName"),
          submittedVia: "form",
          facilityType: orderType === "project" ? str(formData, "facilityType") : null,
          menu: orderType === "project" ? str(formData, "menu") : null,
          roomDimensions: orderType === "project" ? str(formData, "roomDimensions") : null,
          wallMeasurements: orderType === "project" ? str(formData, "wallMeasurements") : null,
          deliveryType: orderType === "project" ? str(formData, "deliveryType") : null,
          openingSize:
            orderType === "project" && str(formData, "deliveryType") === "inside"
              ? str(formData, "openingSize")
              : null,
          installationNeeded:
            orderType === "project" && formData.get("installationNeeded") === "yes",
          notes: str(formData, "notes"),
          lineItems: {
            create: items.map((item) => ({
              name: item.name,
              moreDetails: item.moreDetails,
              qty: item.qty,
              rfqStatus: "needs_pricing",
            })),
          },
        },
      });

      await tx.intakeSubmission.create({
        data: {
          payload,
          processed: true,
          resultType: "opportunity",
          resultId: opportunity.id,
        },
      });

      await tx.activityLog.create({
        data: {
          userName: "System",
          linkedType: "opportunity",
          linkedId: opportunity.id,
          action: "intake_submitted",
          detail: `Intake form created opportunity "${title}" with ${items.length} item(s) needing pricing`,
        },
      });

      return { type: "opportunity" as const, id: opportunity.id };
    }

    const order = await tx.order.create({
      data: {
        title,
        companyId,
        contactId,
        ownerId: str(formData, "salespersonId"),
        orderType,
        status: "new",
        neededByDate,
        deliveryAddress,
        notes: str(formData, "notes"),
        lineItems: {
          create: items.map((item) => ({
            name: item.name,
            moreDetails: item.moreDetails,
            qty: item.qty,
            rfqStatus: "approved",
          })),
        },
      },
    });

    await tx.intakeSubmission.create({
      data: { payload, processed: true, resultType: "order", resultId: order.id },
    });

    await tx.activityLog.create({
      data: {
        userName: "System",
        linkedType: "order",
        linkedId: order.id,
        action: "intake_submitted",
        detail: `Intake form created order "${title}" with ${items.length} pre-priced item(s)`,
      },
    });

    return { type: "order" as const, id: order.id };
  });

  revalidatePath("/pipeline");
  revalidatePath("/orders");
  revalidatePath("/companies");
  redirect(
    result.type === "opportunity" ? `/pipeline/${result.id}` : `/orders/${result.id}`
  );
}
