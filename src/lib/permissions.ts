// Permission vocabulary and the shipped per-role defaults. Pure and
// client-safe (the Admin -> Permissions matrix renders from this). The server
// half (@/lib/permissionsServer) layers RolePermission overrides on top and
// answers "can the current identity do X?".
//
// Identity is the sidebar "Working as" picker, not a login - so this is
// workflow guidance (keep people on their own lane, avoid accidental clicks),
// not hard security.

import { USER_ROLES } from "@/lib/constants";

export const PERMISSIONS = [
  { key: "intake.create", label: "Create intake (new deals and orders)", group: "Sales" },
  { key: "deals.edit", label: "Edit deals", group: "Sales" },
  { key: "deals.close", label: "Close deals (Won / Lost)", group: "Sales" },
  { key: "terms.edit", label: "Set payment terms", group: "Sales" },
  { key: "pricing.edit", label: "Price items (RFQ queue)", group: "Purchasing" },
  { key: "quotes.edit", label: "Prepare and send quotes", group: "Purchasing" },
  { key: "pos.edit", label: "Create and advance purchase orders", group: "Purchasing" },
  { key: "deliveries.edit", label: "Schedule and update deliveries", group: "Purchasing" },
  { key: "payments.edit", label: "Add invoices and record payments", group: "Billing" },
  { key: "service.edit", label: "Log and update service issues", group: "Customer Service" },
  { key: "service.assign", label: "Assign service issues", group: "Customer Service" },
  { key: "files.edit", label: "Add and remove files", group: "General" },
  { key: "phonebook.edit", label: "Edit businesses and contacts", group: "General" },
  { key: "tasks.edit", label: "Create and update tasks", group: "General" },
  { key: "admin.manage", label: "Admin (users, settings, permissions)", group: "Admin" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type PermissionGroup = (typeof PERMISSIONS)[number]["group"];
export type Role = (typeof USER_ROLES)[number]["value"];

/** Group names in display order (first appearance in PERMISSIONS). */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = PERMISSIONS.reduce<PermissionGroup[]>(
  (groups, p) => (groups.includes(p.group) ? groups : [...groups, p.group]),
  []
);

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS.map((p) => p.key);

/** Shipped defaults. A RolePermission row overrides one cell; a missing row means this. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  sales: [
    "intake.create",
    "deals.edit",
    "deals.close",
    "terms.edit",
    "files.edit",
    "phonebook.edit",
    "tasks.edit",
    "service.edit",
  ],
  purchasing: [
    "pricing.edit",
    "quotes.edit",
    "pos.edit",
    "deliveries.edit",
    "files.edit",
    "phonebook.edit",
    "tasks.edit",
    "service.edit",
    "service.assign",
  ],
  billing: ["payments.edit", "terms.edit", "files.edit", "tasks.edit"],
  design: ["files.edit", "tasks.edit", "deals.edit"],
  viewer: [],
};

/** role -> permission -> allowed, for every role and permission. */
export type PermissionMatrix = Record<Role, Record<Permission, boolean>>;

export function isPermission(value: string | null | undefined): value is Permission {
  return !!value && ALL_PERMISSIONS.includes(value as Permission);
}

export function isRole(value: string | null | undefined): value is Role {
  return !!value && USER_ROLES.some((r) => r.value === value);
}

export function permissionLabel(permission: Permission): string {
  return PERMISSIONS.find((p) => p.key === permission)?.label ?? permission;
}

/** The shipped matrix with no overrides applied. */
export function defaultPermissionMatrix(): PermissionMatrix {
  const matrix = {} as PermissionMatrix;
  for (const role of USER_ROLES) {
    const allowed = DEFAULT_ROLE_PERMISSIONS[role.value];
    matrix[role.value] = Object.fromEntries(
      ALL_PERMISSIONS.map((p) => [p, allowed.includes(p)])
    ) as Record<Permission, boolean>;
  }
  return matrix;
}

/** Shipped defaults + RolePermission overrides (unknown roles/permissions are ignored). */
export function buildPermissionMatrix(
  overrides: ReadonlyArray<{ role: string; permission: string; allowed: boolean }>
): PermissionMatrix {
  const matrix = defaultPermissionMatrix();
  for (const o of overrides) {
    if (isRole(o.role) && isPermission(o.permission)) matrix[o.role][o.permission] = o.allowed;
  }
  return matrix;
}

/** Look one cell up; an unknown role is treated as viewer (nothing allowed). */
export function roleCan(matrix: PermissionMatrix, role: string | null | undefined, permission: Permission): boolean {
  const effective: Role = isRole(role) ? role : "viewer";
  return matrix[effective]?.[permission] ?? false;
}
