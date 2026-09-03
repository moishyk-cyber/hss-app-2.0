"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { REQUIRABLE_FIELDS, type RequirableEntity, type RequirableField } from "@/lib/fieldRequirements";
import { requirePermission } from "@/lib/permissionsServer";
import { setSetting } from "@/lib/settings";

/** Every place a required-field change could change what a form demands. */
function revalidateAffectedForms() {
  revalidatePath("/admin/settings");
  revalidatePath("/companies/new");
  revalidatePath("/companies", "layout");
  revalidatePath("/pipeline", "layout");
}

export async function setFieldRequired(
  entity: RequirableEntity,
  field: RequirableField,
  next: string
): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  const required = next === "required";
  const known = REQUIRABLE_FIELDS.some((f) => f.entity === entity && f.field === field);
  if (!known) return { ok: false, message: "Not a recognised field." };

  return safeAction(async () => {
    await prisma.fieldRequirement.upsert({
      where: { entity_field: { entity, field } },
      create: { entity, field, required },
      update: { required },
    });
    await logActivity(
      "field_requirement",
      `${entity}.${field}`,
      "field_requirement_changed",
      `${entity}.${field} set to ${required ? "required" : "optional"}`
    );
    revalidateAffectedForms();
  }, "Could not update that setting. Please try again.");
}

// ---------------------------------------------------------------------------
// App settings (plan §3C.4): company details for the PO PDF, and the default
// customer-service assignee. Stored in AppSetting via @/lib/settings.
// ---------------------------------------------------------------------------

/** "Company details (PO PDF)" card - one save for all five fields. */
export async function saveCompanySettings(formData: FormData): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim();

  return safeAction(async () => {
    await Promise.all([
      setSetting("company.name", name),
      setSetting("company.address", address),
      setSetting("company.phone", phone),
      setSetting("company.email", email),
      setSetting("po.pdfFooter", footer),
    ]);
    await logActivity("setting", "company", "setting_changed", "Company details (PO PDF) updated");
    revalidatePath("/admin/settings");
  }, "Could not save the company details. Please try again.");
}

/** "Customer service default assignee" select - the fallback used by /service intake. */
export async function setServiceDefaultAssignee(userId: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  if (userId) {
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
    if (!exists || !exists.active) return { ok: false, message: "Pick an active teammate." };
  }
  return safeAction(async () => {
    await setSetting("service.defaultAssigneeId", userId);
    await logActivity(
      "setting",
      "service.defaultAssigneeId",
      "setting_changed",
      `Default customer-service assignee set to ${userId || "unassigned"}`
    );
    revalidatePath("/admin/settings");
  }, "Could not save the default assignee. Please try again.");
}
