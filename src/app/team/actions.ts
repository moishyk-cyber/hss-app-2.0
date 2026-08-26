"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";

async function log(linkedId: string, action: string, detail: string) {
  await prisma.activityLog.create({
    data: { userName: "System", linkedType: "user", linkedId, action, detail },
  });
}

function refresh() {
  revalidatePath("/team");
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || "sales";
  if (!name || !email) return { ok: false, message: "Name and email are required." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, message: "Someone with that email already exists." };

  const user = await prisma.user.create({ data: { name, email, role } });
  await log(user.id, "user_created", `Added teammate ${name} (${role})`);
  refresh();
  return { ok: true };
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
  if (field === "email") {
    const existing = await prisma.user.findFirst({ where: { email: trimmed, NOT: { id } } });
    if (existing) return { ok: false, message: "Someone else already uses that email." };
  }
  await prisma.user.update({ where: { id }, data: { [field]: trimmed || "sales" } });
  await log(id, "user_updated", `Updated ${field}`);
  refresh();
  return { ok: true };
}

export async function setUserActive(id: string, active: string): Promise<ActionResult> {
  const isActive = active === "active";
  await prisma.user.update({ where: { id }, data: { active: isActive } });
  await log(id, "user_status_changed", isActive ? "Reactivated" : "Deactivated");
  refresh();
  return { ok: true };
}
