"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { REQUIRABLE_FIELDS, type RequirableEntity, type RequirableField } from "@/lib/fieldRequirements";
import { requirePermission } from "@/lib/permissionsServer";
import { setSetting, type SettingKey } from "@/lib/settings";
import { isRole } from "@/lib/permissions";
import { labelFor, USER_ROLES } from "@/lib/constants";
import { COURTS, type Court } from "@/lib/ballInCourt";

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
// App settings (plan §3C.4): the default customer-service assignee and the
// ball-in-court holders. Stored in AppSetting via @/lib/settings.
// ---------------------------------------------------------------------------

const COURT_SETTING_KEYS: Record<Court, { role: SettingKey; userId: SettingKey }> = {
  sales: { role: "court.sales.role", userId: "court.sales.userId" },
  office: { role: "court.office.role", userId: "court.office.userId" },
  billing: { role: "court.billing.role", userId: "court.billing.userId" },
  purchasing: { role: "court.purchasing.role", userId: "court.purchasing.userId" },
  service: { role: "court.service.role", userId: "court.service.userId" },
};

/** "Ball in court" card - one row per court, saved on change. */
export async function setCourtHolder(court: string, role: string, userId: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;

  if (!(court in COURT_SETTING_KEYS)) return { ok: false, message: "Not a recognised court." };
  const c = court as Court;
  if (!isRole(role)) return { ok: false, message: "Not a valid role." };
  if (userId) {
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
    if (!exists || !exists.active) return { ok: false, message: "Pick an active teammate." };
  }

  return safeAction(async () => {
    const keys = COURT_SETTING_KEYS[c];
    await Promise.all([setSetting(keys.role, role), setSetting(keys.userId, userId)]);
    await logActivity(
      "setting",
      court,
      "court_holder_changed",
      `${COURTS[c]} ball-in-court holder set to ${labelFor(USER_ROLES, role)}${
        userId ? ` (pinned to a person)` : ""
      }`
    );
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
  }, "Could not save that court holder. Please try again.");
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
