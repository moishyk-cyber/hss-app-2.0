// Server half of permissions: who is the current identity, and can they do X?
//
// Identity is the sidebar "Working as" cookie (see identityServer.ts), which
// anyone can switch - so these checks are workflow guidance (a friendly "that's
// billing's job" instead of a silent write), NOT hard security. Real auth is
// out of scope for this pass.

import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/identityServer";
import { getSetting } from "@/lib/settings";
import type { ActionResult } from "@/lib/actionResult";
import { USER_ROLES, labelFor } from "@/lib/constants";
import {
  buildPermissionMatrix,
  defaultPermissionMatrix,
  isRole,
  permissionLabel,
  roleCan,
  type Permission,
  type PermissionMatrix,
  type Role,
} from "@/lib/permissions";

export type CurrentUser = { id: string; name: string; role: Role };

/** Shipped defaults + RolePermission overrides. Falls back to the defaults if the table is unreachable. */
export async function getRolePermissions(): Promise<PermissionMatrix> {
  try {
    const rows = await prisma.rolePermission.findMany();
    return buildPermissionMatrix(rows);
  } catch (err) {
    console.error("getRolePermissions failed - using shipped defaults", err);
    return defaultPermissionMatrix();
  }
}

/** The "Working as" identity, or null when none is picked (or the user is gone/inactive). */
export async function currentUser(): Promise<CurrentUser | null> {
  const id = await currentUserId();
  if (!id) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, active: true },
    });
    if (!user || !user.active) return null;
    // A role string the app doesn't know (hand-edited row) gets viewer rights.
    return { id: user.id, name: user.name, role: isRole(user.role) ? user.role : "viewer" };
  } catch {
    return null;
  }
}

/**
 * Open mode: every role can do everything. This is the shipped default (the
 * team asked for everything open while the app beds in); an admin flips it
 * to "off" on Admin > Permissions to start enforcing the matrix.
 */
export async function permissionsOpenMode(): Promise<boolean> {
  return (await getSetting("permissions.openMode")) !== "off";
}

/**
 * Can the current identity do this? No identity = viewer, EXCEPT that with
 * zero users the app is unusable (nobody can be picked to create the first
 * user), so an empty identity still passes admin.manage as a bootstrap.
 */
export async function can(permission: Permission): Promise<boolean> {
  if (await permissionsOpenMode()) return true;
  const user = await currentUser();
  if (!user) {
    if (permission === "admin.manage") {
      try {
        if ((await prisma.user.count()) === 0) return true;
      } catch {
        // Unreachable database - fall through to the viewer answer.
      }
    }
    return roleCan(await getRolePermissions(), "viewer", permission);
  }
  return roleCan(await getRolePermissions(), user.role, permission);
}

/**
 * Guard for server actions that return ActionResult. Returns null when allowed,
 * otherwise the friendly denial to hand straight back:
 *   const denied = await requirePermission("pos.edit"); if (denied) return denied;
 */
export async function requirePermission(permission: Permission): Promise<ActionResult | null> {
  if (await can(permission)) return null;
  const user = await currentUser();
  const who = user ? `${user.name} (${labelFor(USER_ROLES, user.role)})` : "Nobody is picked in \"Working as\"";
  return {
    ok: false,
    message: `${who} can't do this: "${permissionLabel(permission)}" is not allowed for that role. Switch "Working as" in the sidebar or ask an admin.`,
  };
}
