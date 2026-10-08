// Server half of permissions: who is signed in, and can they do X?
//
// Identity is the signed login session set at /login (see identityServer.ts
// and session.ts), so these checks are real authorization. They fail closed:
// no session, or a session for a deleted/inactive user, passes nothing (bar
// the zero-users bootstrap below). admin.manage always means role "admin",
// even in open mode; open mode only relaxes the everyday permissions.

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/identityServer";
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
export const getRolePermissions = cache(async (): Promise<PermissionMatrix> => {
  try {
    const rows = await prisma.rolePermission.findMany();
    return buildPermissionMatrix(rows);
  } catch (err) {
    console.error("getRolePermissions failed - using shipped defaults", err);
    return defaultPermissionMatrix();
  }
});

/** The signed-in user, or null when there is no valid session (or the user is gone/inactive). */
export async function currentUser(): Promise<CurrentUser | null> {
  const { user } = await sessionUser();
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, role: isRole(user.role) ? user.role : "viewer" };
}

/**
 * Open mode: every role can do everything except Admin (admin.manage is
 * always role "admin" only - see can()). This is the shipped default (the
 * team asked for everything open while the app beds in); an admin flips it
 * to "off" on Admin > Permissions to start enforcing the matrix.
 */
export const permissionsOpenMode = cache(async (): Promise<boolean> => {
  return (await getSetting("permissions.openMode")) !== "off";
});

/**
 * Can the signed-in user do this?
 * - No user (no session, or deleted/inactive): false, EXCEPT that with zero
 *   users the app is unusable (nobody can create the first user), so
 *   admin.manage still passes as a bootstrap.
 * - admin.manage: only role "admin", regardless of open mode.
 * - Everything else: open mode says yes; otherwise the role matrix decides.
 */
export async function can(permission: Permission): Promise<boolean> {
  const user = await currentUser();
  if (!user) {
    if (permission === "admin.manage") {
      try {
        return (await prisma.user.count()) === 0;
      } catch {
        // Unreachable database - fail closed.
        return false;
      }
    }
    return false;
  }
  if (permission === "admin.manage") return user.role === "admin";
  if (await permissionsOpenMode()) return true;
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
  if (!user) {
    return {
      ok: false,
      message: "You're not signed in, or your account is no longer active. Sign in again or ask an admin.",
    };
  }
  return {
    ok: false,
    message: `You're signed in as ${user.name} (${labelFor(USER_ROLES, user.role)}), and "${permissionLabel(permission)}" is not allowed for that role. Ask an admin if you need it.`,
  };
}
