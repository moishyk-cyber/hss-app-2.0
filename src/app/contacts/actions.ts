"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { isValidValue } from "@/lib/constants";
import { findCompanyByNormalizedName } from "../companies/nameMatch";
import { CONTACT_STATUSES } from "./_ui";
import { requirePermission } from "@/lib/permissionsServer";

function str(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readContactFields(formData: FormData) {
  return {
    firstName: str(formData, "firstName") ?? "Unnamed",
    lastName: str(formData, "lastName"),
    companyId: str(formData, "companyId"),
    title: str(formData, "title"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    phoneExt: str(formData, "phoneExt"),
    cellPhone: str(formData, "cellPhone"),
    status: str(formData, "status") ?? "active",
    notes: str(formData, "notes"),
  };
}

/**
 * The business may not exist yet - the form's combobox lets the user create one
 * inline, which arrives as `newCompanyName`. Create it, then attach the contact.
 *
 * If a business with that name (normalized) is already on file we LINK to it rather
 * than creating a duplicate. Linking is the right call here: the user typed the name
 * specifically to attach this person to that business, so the existing record is
 * exactly what they meant - unlike intake, where a match means the whole deal is
 * about to be filed under a second copy of the client.
 */
async function resolveCompanyId(formData: FormData, existing: string | null) {
  if (existing) return existing;
  const newName = str(formData, "newCompanyName");
  if (!newName) return null;

  const match = await findCompanyByNormalizedName(newName);
  if (match) return match.id;

  const company = await prisma.company.create({
    data: { name: newName, type: "customer" },
  });
  await logActivity(
    "company",
    company.id,
    "company_created",
    `Business "${company.name}" created while adding a contact`
  );
  revalidatePath("/companies");
  return company.id;
}

export async function createContact(formData: FormData) {
  const denied = await requirePermission("phonebook.edit");
  if (denied) redirect("/contacts/new?error=not_allowed");
  const data = readContactFields(formData);
  const back = str(formData, "returnTo");

  // Title stays free text on purpose (a fixed list hid people's real jobs); status
  // is a real enum and must not be persisted as something the badges can't render.
  if (!isValidValue(CONTACT_STATUSES, data.status)) {
    redirect("/contacts/new?error=invalid_value");
  }

  let companyId: string | null;
  try {
    companyId = await resolveCompanyId(formData, data.companyId);
  } catch (err) {
    console.error(err);
    redirect("/contacts/new?error=save_failed");
  }
  data.companyId = companyId;

  // Every contact belongs to a business - bounce back to the form if none was picked.
  if (!data.companyId) {
    redirect("/contacts/new?error=company_required");
  }

  try {
    const contact = await prisma.contact.create({ data });
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    await logActivity("contact", contact.id, "contact_created", `Contact "${fullName}" created`);
  } catch (err) {
    console.error(err);
    redirect("/contacts/new?error=save_failed");
  }

  revalidatePath("/contacts");
  revalidatePath("/phonebook");
  redirect(back ?? "/phonebook");
}

export async function updateContact(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing contact id");
  const denied = await requirePermission("phonebook.edit");
  if (denied) redirect(`/contacts/${id}/edit?error=not_allowed`);
  const data = readContactFields(formData);

  if (!isValidValue(CONTACT_STATUSES, data.status)) {
    redirect(`/contacts/${id}/edit?error=invalid_value`);
  }

  let companyId: string | null;
  try {
    companyId = await resolveCompanyId(formData, data.companyId);
  } catch (err) {
    console.error(err);
    redirect(`/contacts/${id}/edit?error=save_failed`);
  }
  data.companyId = companyId;

  if (!data.companyId) {
    redirect(`/contacts/${id}/edit?error=company_required`);
  }

  try {
    const contact = await prisma.contact.update({ where: { id }, data });
    await logActivity(
      "contact",
      contact.id,
      "contact_updated",
      `Contact "${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}" updated`
    );
  } catch (err) {
    console.error(err);
    redirect(`/contacts/${id}/edit?error=save_failed`);
  }

  revalidatePath("/contacts");
  revalidatePath("/phonebook");
  redirect("/phonebook");
}
