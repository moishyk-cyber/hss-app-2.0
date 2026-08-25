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

async function logActivity(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "contact", linkedId, action, detail },
  });
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
 * The business may not exist yet — the form's combobox lets the user create one
 * inline, which arrives as `newCompanyName`. Create it, then attach the contact.
 */
async function resolveCompanyId(formData: FormData, existing: string | null) {
  if (existing) return existing;
  const newName = str(formData, "newCompanyName");
  if (!newName) return null;

  const company = await prisma.company.create({
    data: { name: newName, type: "customer" },
  });
  await prisma.activityLog.create({
    data: {
      userName: "System",
      linkedType: "company",
      linkedId: company.id,
      action: "company_created",
      detail: `Business "${company.name}" created while adding a contact`,
    },
  });
  revalidatePath("/companies");
  return company.id;
}

export async function createContact(formData: FormData) {
  const data = readContactFields(formData);
  data.companyId = await resolveCompanyId(formData, data.companyId);

  // Every contact belongs to a business — bounce back to the form if none was picked.
  if (!data.companyId) {
    redirect("/contacts/new?error=company_required");
  }

  const contact = await prisma.contact.create({ data });
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  await logActivity(contact.id, "contact_created", `Contact "${fullName}" created`);
  revalidatePath("/contacts");
  revalidatePath("/phonebook");
  const back = str(formData, "returnTo");
  redirect(back ?? "/phonebook");
}

export async function updateContact(formData: FormData) {
  const id = str(formData, "id");
  if (!id) throw new Error("Missing contact id");
  const data = readContactFields(formData);
  data.companyId = await resolveCompanyId(formData, data.companyId);

  if (!data.companyId) {
    redirect(`/contacts/${id}/edit?error=company_required`);
  }

  const contact = await prisma.contact.update({ where: { id }, data });
  await logActivity(
    contact.id,
    "contact_updated",
    `Contact "${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}" updated`
  );
  revalidatePath("/contacts");
  revalidatePath("/phonebook");
  redirect("/phonebook");
}
