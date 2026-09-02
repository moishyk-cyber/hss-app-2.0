"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { COMPANY_TYPES, COMPANY_VERTICALS, isValidValue } from "@/lib/constants";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { findCompanyByNormalizedName } from "./nameMatch";

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
