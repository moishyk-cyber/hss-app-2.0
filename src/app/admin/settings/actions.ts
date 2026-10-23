"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { REQUIRABLE_FIELDS, type RequirableEntity, type RequirableField } from "@/lib/fieldRequirements";
import { requirePermission } from "@/lib/permissionsServer";
import { setSetting } from "@/lib/settings";
import { STAGE_ASSIGNEE_KEYS } from "@/lib/stageAssignments";
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

/** A single automatic assignee per stage. Closing stays specific to the deal. */
export async function setStageHolder(step: string, userId: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  if (!FLOW_STEPS.some(entry => entry.key === step)) return { ok: false, message: "Not a recognised stage." };
  if (step === "close") return { ok: false, message: "Reassign the salesperson on the deal to change who confirms it." };
  return safeAction(async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, active: true } });
    if (!user?.active) throw new Error("Pick an active teammate.");
    const key = STAGE_ASSIGNEE_KEYS[step as FlowStepKey];
    await setSetting(key, user.id);
    const label = FLOW_STEPS.find(entry => entry.key === step)!.label;
    await logActivity("setting", key, "court_holder_changed", `${label} automatically assigned to ${user.name}`);
    revalidatePath("/", "layout");
  }, "Could not save that stage assignee. Please try again.");
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

/** Compatibility for older clients; the Supplier Quotes setting is the source of truth. */
export async function setPricingDefaultAssignee(userId: string): Promise<ActionResult> {
  return setStageHolder("pricing", userId);
}
