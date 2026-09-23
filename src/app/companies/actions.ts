"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { COMPANY_TYPES, COMPANY_VERTICALS, isValidValue } from "@/lib/constants";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { findCompanyByNormalizedName } from "./nameMatch";
import { requirePermission } from "@/lib/permissionsServer";
import { cleanText, TEXT_LIMITS } from "@/lib/input";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "1";
}

/** Whole percent, clamped to 0-100. Anything unparseable falls back to the house default. */
function percent(formData: FormData, key: string, fallback: number): number {
  const raw = str(formData, key);
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function readCompanyFields(formData: FormData) {
  return {
    name: str(formData, "name") ?? "Untitled company",
    type: str(formData, "type") ?? "customer",
    vertical: str(formData, "vertical"),
    priorityClient: bool(formData, "priorityClient"),
    requiresDeposit: bool(formData, "requiresDeposit"),
    depositPercent: percent(formData, "depositPercent", 30),
    phone: str(formData, "phone"),
    phoneExt: str(formData, "phoneExt"),
    cellPhone: str(formData, "cellPhone"),
    email: str(formData, "email"),
    website: str(formData, "website"),
    deliveryAddress: str(formData, "deliveryAddress"),
    billingAddress: str(formData, "billingAddress"),
    locationName: str(formData, "locationName"),
    zip: str(formData, "zip"),
    notes: str(formData, "notes"),
  };
}

/** True when type/vertical hold values this app actually recognises. */
function companyEnumsValid(data: ReturnType<typeof readCompanyFields>): boolean {
  if (!isValidValue(COMPANY_TYPES, data.type)) return false;
  if (data.vertical && !isValidValue(COMPANY_VERTICALS, data.vertical)) return false;
  return true;
}

/** Server-side backstop for whatever the Settings tab currently requires (native `required` is client-only). */
async function companyMeetsRequirements(data: ReturnType<typeof readCompanyFields>): Promise<boolean> {
  const req = await getFieldRequirements();
  if (req["company.phone"] && !data.phone) return false;
  if (req["company.email"] && !data.email) return false;
  return true;
}

export async function createCompany(formData: FormData) {
  const denied = await requirePermission("phonebook.edit");
  if (denied) redirect("/companies/new?error=not_allowed");
  const data = readCompanyFields(formData);
  if (!companyEnumsValid(data)) redirect("/companies/new?error=invalid_value");
  if (!(await companyMeetsRequirements(data))) redirect("/companies/new?error=missing_required");

  // Same guard as intake: one kitchen, one record. Checked across all types, since a
  // duplicate is as likely to be filed as a supplier or a lost lead as a customer.
  const existing = await findCompanyByNormalizedName(data.name);
  if (existing) {
    redirect(
      `/companies/new?error=duplicate_company&company=${encodeURIComponent(existing.name)}`
    );
  }

  let company;
  try {
    company = await prisma.company.create({ data });
    await logActivity(
      "company",
      company.id,
      "company_created",
      `Company "${company.name}" created`
    );
  } catch (err) {
    console.error(err);
    redirect("/companies/new?error=save_failed");
  }
  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing company id");
  const denied = await requirePermission("phonebook.edit");
  if (denied) redirect(`/companies/${id}/edit?error=not_allowed`);
  const data = readCompanyFields(formData);
  if (!companyEnumsValid(data)) redirect(`/companies/${id}/edit?error=invalid_value`);
  if (!(await companyMeetsRequirements(data))) redirect(`/companies/${id}/edit?error=missing_required`);

  try {
    const company = await prisma.company.update({ where: { id }, data });
    await logActivity(
      "company",
      company.id,
      "company_updated",
      `Company "${company.name}" updated`
    );
  } catch (err) {
    console.error(err);
    redirect(`/companies/${id}/edit?error=save_failed`);
  }
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  redirect(`/companies/${id}`);
}

// ---------------------------------------------------------------------------
// Locations - the physical sites a business takes delivery at.
//
// The free-text locationName / deliveryAddress on Opportunity and Order stay the
// snapshot fulfillment actually uses; picking a Location copies its name and
// address into them (see the intake form and the Close panel). That is why these
// actions never rewrite a deal's address behind its back: reassigning a deleted
// location only re-points the foreign key.
// ---------------------------------------------------------------------------

export type LocationInput = {
  name: string;
  address: string;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryNotes?: string | null;
};

/** Shared shape/validation for create + update. Returns null when the input is unusable. */
function readLocationInput(input: LocationInput): {
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryNotes: string | null;
} | null {
  const name = cleanText(input.name, TEXT_LIMITS.short);
  const address = cleanText(input.address, TEXT_LIMITS.medium);
  if (!name || !address) return null;
  return {
    name,
    address,
    contactName: cleanText(input.contactName, TEXT_LIMITS.short) || null,
    contactPhone: cleanText(input.contactPhone, TEXT_LIMITS.short) || null,
    deliveryNotes: cleanText(input.deliveryNotes, TEXT_LIMITS.long) || null,
  };
}

function revalidateLocations(companyId: string) {
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/phonebook");
  // The location pickers on intake, the Close panel and the deal edit form all
  // read this list.
  revalidatePath("/intake");
  revalidatePath("/pipeline");
  revalidatePath("/orders");
}

export async function createLocation(companyId: string, input: LocationInput): Promise<ActionResult> {
  const denied = await requirePermission("phonebook.edit");
  if (denied) return denied;
  const data = readLocationInput(input);
  if (!data) return { ok: false, message: "A location needs a name and an address." };
  return safeAction(async () => {
    const existingCount = await prisma.location.count({ where: { companyId } });
    const location = await prisma.location.create({
      data: { ...data, companyId, isDefault: existingCount === 0 },
    });
    await logActivity(
      "company",
      companyId,
      "location_added",
      `Location "${location.name}" added (${location.address})`
    );
    revalidateLocations(companyId);
  }, "Could not add the location. Please try again.");
}

export async function updateLocation(locationId: string, input: LocationInput): Promise<ActionResult> {
  const denied = await requirePermission("phonebook.edit");
  if (denied) return denied;
  const data = readLocationInput(input);
  if (!data) return { ok: false, message: "A location needs a name and an address." };
  return safeAction(async () => {
    const location = await prisma.location.update({ where: { id: locationId }, data });
    await logActivity(
      "company",
      location.companyId,
      "location_updated",
      `Location "${location.name}" updated (${location.address})`
    );
    revalidateLocations(location.companyId);
  }, "Could not save the location. Please try again.");
}

/** Exactly one default per business - the picker prefills with it. */
export async function setDefaultLocation(locationId: string): Promise<ActionResult> {
  const denied = await requirePermission("phonebook.edit");
  if (denied) return denied;
  return safeAction(async () => {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, companyId: true },
    });
    if (!location) throw new Error("Location not found");
    await prisma.$transaction([
      prisma.location.updateMany({
        where: { companyId: location.companyId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.location.update({ where: { id: location.id }, data: { isDefault: true } }),
    ]);
    await logActivity(
      "company",
      location.companyId,
      "location_default_set",
      `Location "${location.name}" is now the default site`
    );
    revalidateLocations(location.companyId);
  }, "Could not set the default location. Please try again.");
}

/**
 * Delete a location. A location a deal or an order points at is never silently
 * dropped: the call is refused with a count, and the card then offers to move
 * those records to another location (pass `reassignToId`) before deleting.
 */
export async function deleteLocation(
  locationId: string,
  reassignToId?: string | null
): Promise<ActionResult> {
  const denied = await requirePermission("phonebook.edit");
  if (denied) return denied;
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      companyId: true,
      isDefault: true,
      _count: { select: { opportunities: true, orders: true, serviceIssues: true } },
    },
  });
  if (!location) return { ok: false, message: "That location no longer exists." };

  const referenced =
    location._count.opportunities + location._count.orders + location._count.serviceIssues;
  const target = reassignToId ?? null;

  if (referenced > 0 && !target) {
    const parts = [
      location._count.opportunities > 0
        ? `${location._count.opportunities} deal${location._count.opportunities === 1 ? "" : "s"}`
        : null,
      location._count.orders > 0
        ? `${location._count.orders} order${location._count.orders === 1 ? "" : "s"}`
        : null,
      location._count.serviceIssues > 0
        ? `${location._count.serviceIssues} service issue${location._count.serviceIssues === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    return {
      ok: false,
      message: `${parts.join(" and ")} still point at this location - pick another location to move them to first.`,
    };
  }

  if (target) {
    const replacement = await prisma.location.findUnique({
      where: { id: target },
      select: { id: true, companyId: true },
    });
    if (!replacement || replacement.companyId !== location.companyId || replacement.id === location.id) {
      return { ok: false, message: "Pick another location on this business to move them to." };
    }
  }

  return safeAction(async () => {
    await prisma.$transaction(async (tx) => {
      if (target) {
        await tx.opportunity.updateMany({ where: { locationId }, data: { locationId: target } });
        await tx.order.updateMany({ where: { locationId }, data: { locationId: target } });
        await tx.serviceIssue.updateMany({ where: { locationId }, data: { locationId: target } });
      }
      await tx.location.delete({ where: { id: locationId } });
      // The business must keep a default site once it still has any.
      if (location.isDefault) {
        const next = await tx.location.findFirst({
          where: { companyId: location.companyId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (next) await tx.location.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    await logActivity(
      "company",
      location.companyId,
      "location_deleted",
      `Location "${location.name}" deleted${target ? " - its deals and orders were moved to another location" : ""}`
    );
    revalidateLocations(location.companyId);
  }, "Could not delete the location. Please try again.");
}
