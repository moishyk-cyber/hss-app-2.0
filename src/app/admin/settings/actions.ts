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
import { FLOW_STEPS, type FlowStepKey } from "@/lib/ballInCourt";

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
    const before = await prisma.fieldRequirement.findUnique({ where: { entity_field: { entity, field } } });
    await prisma.fieldRequirement.upsert({
      where: { entity_field: { entity, field } },
      create: { entity, field, required },
      update: { required },
    });
    await logActivity(
      "field_requirement",
      `${entity}.${field}`,
      "field_requirement_changed",
      `${entity}.${field} set to ${required ? "required" : "optional"}`,
      {
        previousValue: before ? (before.required ? "required" : "optional") : "optional (default)",
        newValue: required ? "required" : "optional",
      }
    );
    revalidateAffectedForms();
  }, "Could not update that setting. Please try again.");
}

// ---------------------------------------------------------------------------
// App settings (plan §3C.4): the default customer-service assignee and the
// ball-in-court holders. Stored in AppSetting via @/lib/settings.
// ---------------------------------------------------------------------------

const STEP_SETTING_KEYS: Record<FlowStepKey, { role: SettingKey; userIds: SettingKey }> = {
  sales: { role: "court.sales.role", userIds: "court.sales.userIds" },
  pricing: { role: "court.pricing.role", userIds: "court.pricing.userIds" },
  close: { role: "court.close.role", userIds: "court.close.userIds" },
  quote: { role: "court.quote.role", userIds: "court.quote.userIds" },
  terms: { role: "court.terms.role", userIds: "court.terms.userIds" },
  deposit: { role: "court.deposit.role", userIds: "court.deposit.userIds" },
  pos: { role: "court.pos.role", userIds: "court.pos.userIds" },
  delivery: { role: "court.delivery.role", userIds: "court.delivery.userIds" },
  service: { role: "court.service.role", userIds: "court.service.userIds" },
};

/** "Ball in court" card - one row per pipeline stage, saved on change. */
export async function setStageHolder(
  step: string,
  role: string,
  userIds: string[]
): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;

  if (!(step in STEP_SETTING_KEYS)) return { ok: false, message: "Not a recognised stage." };
  const s = step as FlowStepKey;
  if (!isRole(role)) return { ok: false, message: "Not a valid role." };

  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length > 0) {
    const active = await prisma.user.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true },
    });
    if (active.length !== ids.length) return { ok: false, message: "Pick active teammates." };
  }

  return safeAction(async () => {
    const keys = STEP_SETTING_KEYS[s];
    await Promise.all([setSetting(keys.role, role), setSetting(keys.userIds, ids.join(","))]);
    const stepLabel = FLOW_STEPS.find((f) => f.key === s)?.label ?? s;
    await logActivity(
      "setting",
      step,
      "court_holder_changed",
      `${stepLabel} ball-in-court holder set to ${labelFor(USER_ROLES, role)}${
        ids.length > 0 ? ` (pinned to ${ids.length} ${ids.length === 1 ? "person" : "people"})` : ""
      }`
    );
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
  }, "Could not save that stage holder. Please try again.");
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
