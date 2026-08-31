"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { isValidValue, USER_ROLES } from "@/lib/constants";

async function log(linkedId: string, action: string, detail: string) {
  await logActivity("user", linkedId, action, detail);
}

function refresh() {
  revalidatePath("/team");
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || "sales";
  if (!name || !email) return { ok: false, message: "Name and email are required." };
  if (!isValidValue(USER_ROLES, role)) return { ok: false, message: "Not a valid role." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, message: "Someone with that email already exists." };

  return safeAction(async () => {
    const user = await prisma.user.create({ data: { name, email, role } });
    await log(user.id, "user_created", `Added teammate ${name} (${role})`);
    refresh();
  }, "Could not add the teammate. Please try again.");
}

export async function updateUserField(
  id: string,
  field: "name" | "email" | "role",
  value: string
): Promise<ActionResult> {
  const trimmed = value.trim();
  if ((field === "name" || field === "email") && !trimmed) {
    return { ok: false, message: `${field === "name" ? "Name" : "Email"} can't be empty.` };
  }
  if (field === "role" && !isValidValue(USER_ROLES, trimmed)) {
    return { ok: false, message: "Not a valid role." };
  }
  if (field === "email") {
    const existing = await prisma.user.findFirst({ where: { email: trimmed, NOT: { id } } });
    if (existing) return { ok: false, message: "Someone else already uses that email." };
  }

  return safeAction(async () => {
    await prisma.user.update({ where: { id }, data: { [field]: trimmed || "sales" } });
    await log(id, "user_updated", `Updated ${field}`);
    refresh();
  }, "Could not update the teammate. Please try again.");
}

export async function setUserActive(id: string, active: string): Promise<ActionResult> {
  const isActive = active === "active";
  return safeAction(async () => {
    await prisma.user.update({ where: { id }, data: { active: isActive } });
    await log(id, "user_status_changed", isActive ? "Reactivated" : "Deactivated");
    refresh();
  }, "Could not update the teammate's status. Please try again.");
}
