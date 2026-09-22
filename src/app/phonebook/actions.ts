"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { requirePermission } from "@/lib/permissionsServer";

/**
 * Attach an orphaned contact to a business.
 * Every contact should belong to one - this is the fix-up path in the Phone Book.
 */
export async function assignContactCompany(contactId: string, companyId: string): Promise<ActionResult> {
  const denied = await requirePermission("phonebook.edit");
  if (denied) return denied;
  if (!contactId || !companyId) return { ok: false, message: "Pick a business first." };

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) return { ok: false, message: "That business could not be found." };

  return safeAction(async () => {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new Error("Contact not found");

    await prisma.contact.update({ where: { id: contactId }, data: { companyId: company.id } });

    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    await logActivity(
      "contact",
      contact.id,
      "contact_assigned",
      `Contact "${fullName}" assigned to business "${company.name}"`
    );

    revalidatePath("/phonebook");
    revalidatePath("/contacts");
    revalidatePath(`/companies/${company.id}`);
  }, "Could not assign the business. Please try again.");
}
