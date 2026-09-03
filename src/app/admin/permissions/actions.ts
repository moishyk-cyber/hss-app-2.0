"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/log";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { requirePermission } from "@/lib/permissionsServer";
import { isPermission, isRole, permissionLabel } from "@/lib/permissions";
import { USER_ROLES, labelFor } from "@/lib/constants";

/** Every place a role-permission change could change what someone can do. */
function refresh() {
  revalidatePath("/admin/permissions");
  // Nav (Admin item) and every action-denial message read the matrix fresh.
  revalidatePath("/", "layout");
}

export async function setRolePermission(
  role: string,
  permission: string,
  allowed: boolean
): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;

  if (!isRole(role)) return { ok: false, message: "Not a valid role." };
  if (!isPermission(permission)) return { ok: false, message: "Not a valid permission." };
  if (role === "admin") return { ok: false, message: "Admin always has every permission." };

  return safeAction(async () => {
    await prisma.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      create: { role, permission, allowed },
      update: { allowed },
    });
    await logActivity(
      "role_permission",
      `${role}.${permission}`,
      "role_permission_changed",
      `${labelFor(USER_ROLES, role)} ${allowed ? "granted" : "denied"} "${permissionLabel(permission)}"`
    );
    refresh();
  }, "Could not update that permission. Please try again.");
}

export async function resetRolePermissions(role: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;

  if (!isRole(role)) return { ok: false, message: "Not a valid role." };
  if (role === "admin") return { ok: false, message: "Admin has no overrides to reset." };

  return safeAction(async () => {
    await prisma.rolePermission.deleteMany({ where: { role } });
    await logActivity(
      "role_permission",
      role,
      "role_permission_reset",
      `${labelFor(USER_ROLES, role)} permissions reset to the shipped defaults`
    );
    refresh();
  }, "Could not reset that role. Please try again.");
}
