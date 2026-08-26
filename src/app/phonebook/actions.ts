"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction, type ActionResult } from "@/lib/actionResult";

/**
 * Attach an orphaned contact to a business.
 * Every contact should belong to one — this is the fix-up path in the Phone Book.
 */
export async function assignContactCompany(contactId: string, companyId: string): Promise<ActionResult> {
  if (!contactId || !companyId) return { ok: false, message: "Pick a business first." };

  return safeAction(async () => {
    const [contact, company] = await Promise.all([
      prisma.contact.findUnique({ where: { id: contactId } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }),
    ]);
    if (!contact || !company) throw new Error("Contact or business not found");

    await prisma.contact.update({ where: { id: contactId }, data: { companyId: company.id } });

    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    await prisma.activityLog.create({
      data: {
        userName: "System",
        linkedType: "contact",
        linkedId: contact.id,
        action: "contact_assigned",
        detail: `Contact "${fullName}" assigned to business "${company.name}"`,
      },
    });

    revalidatePath("/phonebook");
    revalidatePath("/contacts");
    revalidatePath(`/companies/${company.id}`);
  }, "Could not assign the business. Please try again.");
}
