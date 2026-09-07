"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { recomputeOrderStatus } from "@/lib/flow";
import { currentUserId, currentUserName } from "@/lib/identityServer";
import { roundCents } from "@/lib/money";
import { findCompanyByNormalizedName } from "../companies/nameMatch";
import { requirePermission } from "@/lib/permissionsServer";
import { MAX_UPLOAD_BYTES, storagePathFor, uploadObject, uploadsConfigured } from "@/lib/storage";

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

function parseHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/** Google Drive share links get their own source so the Files list can label them. */
function sourceForUrl(url: URL): "link" | "google_drive" {
  const host = url.hostname.toLowerCase();
  return host === "drive.google.com" || host === "docs.google.com" ? "google_drive" : "link";
}

/** Drawings we accept as a direct upload: PDFs and images. */
function isAllowedDrawingMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

/**
 * Save the optional drawing/attachment (a pasted link, an uploaded PDF/image,
 * or both) as Document row(s) on the record the intake just created. Runs
 * AFTER the record is committed - a storage hiccup here must never roll back
 * or block an otherwise-successful intake, so every failure is swallowed and
 * logged rather than thrown.
 */
async function saveDrawingAttachment(
  formData: FormData,
  linkedType: "order" | "opportunity",
  linkedId: string
): Promise<void> {
  const uploadedBy = await currentUserName();

  const link = str(formData, "drawingLink");
  if (link) {
    const url = parseHttpUrl(link);
    if (url) {
      try {
        await prisma.document.create({
          data: {
            linkedType,
            linkedId,
            kind: "drawing",
            fileUrl: url.toString(),
            source: sourceForUrl(url),
            uploadedBy,
          },
        });
      } catch (err) {
        console.error("intake drawing link save failed", err);
      }
    }
  }

  const file = formData.get("drawingFile");
  if (file instanceof File && file.size > 0) {
    if (!isAllowedDrawingMime(file.type)) {
      console.error(`intake drawing upload skipped - unsupported type ${file.type}`);
    } else if (file.size > MAX_UPLOAD_BYTES) {
      console.error("intake drawing upload skipped - file over the 25 MB limit");
    } else if (!uploadsConfigured()) {
      console.error("intake drawing upload skipped - storage is not configured");
    } else {
      try {
        const storagePath = storagePathFor(linkedType, linkedId, file.name);
        await uploadObject(storagePath, await file.arrayBuffer(), file.type);
        await prisma.document.create({
          data: {
            linkedType,
            linkedId,
            kind: "drawing",
            fileUrl: storagePath,
            fileName: file.name,
            source: "upload",
            mimeType: file.type || null,
            sizeBytes: file.size,
            storagePath,
            uploadedBy,
          },
        });
      } catch (err) {
        console.error("intake drawing upload failed", err);
      }
    }
  }
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

type ParsedItem = {
  name: string;
  moreDetails: string | null;
  qty: number;
  /** Optional price typed on the call (Sep 3 plan A1.3) - null means "needs quoting". */
  unitPrice: number | null;
};

function parseItems(formData: FormData): ParsedItem[] {
  const names = all(formData, "itemName");
  const details = all(formData, "itemDetails");
  const qtys = all(formData, "itemQty");
  const prices = all(formData, "itemUnitPrice");

  const items: ParsedItem[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = (names[i] ?? "").trim();
    if (!name) continue;
    const detail = (details[i] ?? "").trim();
    const qty = Number.parseInt((qtys[i] ?? "1").trim(), 10);
    const rawPrice = (prices[i] ?? "").trim();
    const price = rawPrice === "" ? null : Number(rawPrice.replace(/[^0-9.]/g, ""));
    items.push({
      name,
      moreDetails: detail === "" ? null : detail,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unitPrice: price != null && Number.isFinite(price) && price > 0 ? roundCents(price) : null,
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
  const denied = await requirePermission("intake.create");
  if (denied) redirect("/intake?error=not_allowed");
  const clientMode = str(formData, "clientMode") ?? "existing";
  const orderType = str(formData, "orderType") === "project" ? "project" : "order";
  const needsPricing = formData.get("needsPricing") === "yes";
  const neededByDate = date(formData, "neededByDate");
  const items = parseItems(formData);
  const payload = JSON.stringify(formSnapshot(formData));
  // Terms only reach the form when the intake becomes an order straight away.
  // Free text since Sep 4 (client) - nothing is derived from it and no invoice
  // is created; those are added by hand on the order's Invoice tab.
  const termsNotes = str(formData, "termsNotes");

  const goesToPipeline = orderType === "project" || needsPricing;

  // Server-side backstop for the client-side gate (Sep 2 QA: an intake could
  // submit with zero real items and create an empty pipeline record).
  if (items.length === 0) {
    redirect("/intake?error=items_required");
  }

  // The salesperson dropdown is gone from the form (feedback: one more thing to fill
  // in mid-call, and it always meant "me"). Fall back to the sidebar identity - and
  // if there isn't one either, save it unassigned rather than blocking a live call.
  const salespersonId = await resolveSalesperson();

  async function resolveSalesperson(): Promise<string | null> {
    const picked = str(formData, "salespersonId");
    if (picked) return picked;
    const cookieId = await currentUserId();
    if (!cookieId) return null;
    // A cookie can outlive the user it names - an unknown id would break the insert.
    const user = await prisma.user.findUnique({
      where: { id: cookieId },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  // Duplicate-business guard, BEFORE the transaction: redirect() throws, and a throw
  // inside runIntakeTransaction would be caught below and reported as save_failed.
  // Matching is on the normalized name across ALL company types - the duplicate is as
  // likely to be filed as a lost_lead or a supplier as it is a customer.
  const proposedCompanyName = clientMode === "new" ? str(formData, "newCompanyName") : null;
  if (proposedCompanyName) {
    const existing = await findCompanyByNormalizedName(proposedCompanyName);
    if (existing) {
      redirect(
        `/intake?error=duplicate_company&company=${encodeURIComponent(existing.name)}`
      );
    }
  }

  // Idempotency guard, BEFORE the transaction (same reasoning as markOpportunityWon's
  // guard on the order): a fast double-submit - a double-click that lands before
  // PendingButton's pending state disables it, or a client/network retry - must not
  // create two opportunities for one phone call. Scoped to a same-company opportunity
  // created in the last few seconds, so a genuine second call to the same client later
  // the same day is unaffected. New-client submissions are already covered by the
  // duplicate-company guard above (the second attempt finds the company the first one
  // just created).
  if (goesToPipeline && clientMode === "existing") {
    const existingCompanyId = str(formData, "companyId");
    if (existingCompanyId) {
      const recentDuplicate = await prisma.opportunity.findFirst({
        where: { companyId: existingCompanyId, createdAt: { gte: new Date(Date.now() - 15_000) } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (recentDuplicate) redirect(`/pipeline/${recentDuplicate.id}`);
    }
  }

  let result;
  try {
    result = await runIntakeTransaction();
  } catch (err) {
    console.error(err);
    redirect("/intake?error=save_failed");
  }

  // After the commit too, same reasoning: a drawing attachment is a nice-to-have
  // add-on, not something that should ever undo an otherwise-successful intake.
  await saveDrawingAttachment(formData, result.type, result.id);

  // Logged after the commit: logActivity uses the global prisma client (so it can
  // attribute to the signed-in identity) and never throws, so it cannot roll the
  // intake back or fail it.
  await logActivity(
    result.type,
    result.id,
    "intake_submitted",
    result.type === "opportunity"
      ? `Intake form created opportunity "${result.title}" with ${items.length} item(s)${
          items.some((i) => i.unitPrice != null) ? " (some already priced)" : " needing pricing"
        }`
      : `Intake form created order "${result.title}" with ${items.length} pre-priced item(s)${
          termsNotes ? ` - terms: ${termsNotes}` : " - no terms written yet"
        }`
  );

  // Branch B skips the pipeline, so nothing else ever derives this order's status.
  if (result.type === "order") await recomputeOrderStatus(result.id);

  revalidatePath("/pipeline");
  revalidatePath("/orders");
  revalidatePath("/companies");
  redirect(
    result.type === "opportunity" ? `/pipeline/${result.id}` : `/orders/${result.id}`
  );

  async function runIntakeTransaction() {
    return prisma.$transaction(async (tx) => {
    // --- client -----------------------------------------------------------
    let companyId: string | null = null;
    let companyName = "New client";
    /** Address on file for the picked business - the default destination. */
    let companyDeliveryAddress: string | null = null;
    /** Set when this intake creates the business's first Location. */
    let createdLocationId: string | null = null;

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
      companyDeliveryAddress = company.deliveryAddress;
      // A new business's delivery address IS its first location (Sep 3 plan A1.2).
      if (company.deliveryAddress) {
        const firstLocation = await tx.location.create({
          data: {
            companyId: company.id,
            name: company.locationName ?? "Main location",
            address: company.deliveryAddress,
            isDefault: true,
          },
        });
        createdLocationId = firstLocation.id;
      }
    } else {
      companyId = str(formData, "companyId");
      if (companyId) {
        const company = await tx.company.findUnique({ where: { id: companyId } });
        companyName = company?.name ?? companyName;
        companyDeliveryAddress = company?.deliveryAddress ?? null;
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

    // --- location ---------------------------------------------------------
    // A picked location wins: its name and address are copied onto the deal or
    // order, which is what fulfillment actually reads (the Location row is the
    // link, the copies are the snapshot). A location typed on the call is saved
    // onto the business when the "save it" box is left ticked.
    let locationId: string | null = createdLocationId;
    let locationName = str(formData, "locationName") ?? str(formData, "newCompanyLocationName");
    let deliveryAddress =
      str(formData, "deliveryAddress") ??
      companyDeliveryAddress ??
      str(formData, "newCompanyDeliveryAddress");

    const pickedLocationId = str(formData, "locationId");
    if (pickedLocationId && companyId) {
      const picked = await tx.location.findUnique({ where: { id: pickedLocationId } });
      // A location from another business is a tampered payload - ignore it.
      if (picked && picked.companyId === companyId) {
        locationId = picked.id;
        locationName = picked.name;
        deliveryAddress = picked.address;
      }
    } else if (!locationId && companyId && formData.get("saveLocation") === "1" && deliveryAddress) {
      const existingLocations = await tx.location.count({ where: { companyId } });
      const created = await tx.location.create({
        data: {
          companyId,
          name: locationName ?? "Main location",
          address: deliveryAddress,
          isDefault: existingLocations === 0,
        },
      });
      locationId = created.id;
      locationName = created.name;
    }

    // --- opportunity or order --------------------------------------------
    if (goesToPipeline) {
      const opportunity = await tx.opportunity.create({
        data: {
          title,
          companyId,
          primaryContactId: contactId,
          salespersonId,
          stage: "new",
          orderType,
          // Carry the form's real answer. Hard-coding true told the RFQ queue every
          // deal needed quoting, including ones the salesperson had already priced.
          needsPricing,
          // The price is agreed at close, not at intake (the Close panel asks
          // for it). Item prices typed here still roll up via the RFQ pricing sync.
          value: null,
          neededByDate,
          locationId,
          deliveryAddress,
          locationName,
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
              unitPrice: item.unitPrice,
              // A price typed on the call is a quote in hand; everything else
              // still has to go through the RFQ queue.
              rfqStatus: item.unitPrice != null ? "quote_received" : "needs_pricing",
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

      return { type: "opportunity" as const, id: opportunity.id, title };
    }

    // Priced on the call: the order is worth what its item prices add up to.
    const itemsTotal = roundCents(
      items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0)
    );
    const orderValue = itemsTotal > 0 ? itemsTotal : null;

    const order = await tx.order.create({
      data: {
        title,
        companyId,
        contactId,
        ownerId: salespersonId,
        orderType,
        status: "new",
        orderValue,
        neededByDate,
        locationId,
        deliveryAddress,
        notes: str(formData, "notes"),
        termsNotes,
        lineItems: {
          create: items.map((item) => ({
            name: item.name,
            moreDetails: item.moreDetails,
            qty: item.qty,
            unitPrice: item.unitPrice,
            rfqStatus: "approved",
          })),
        },
      },
    });

    await tx.intakeSubmission.create({
      data: { payload, processed: true, resultType: "order", resultId: order.id },
    });

      return { type: "order" as const, id: order.id, title };
    });
  }
}
