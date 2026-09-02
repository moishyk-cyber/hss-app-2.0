"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { REQUIRABLE_FIELDS, type RequirableEntity, type RequirableField } from "@/lib/fieldRequirements";

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
