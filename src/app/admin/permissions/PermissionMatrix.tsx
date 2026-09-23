"use client";

// Matrix of permissions (rows, grouped) x roles (columns) with a toggle per
// cell. Admin is locked on - it always has every permission, so its column
// is shown checked and disabled rather than wired to an action.

import { Fragment, useState, useTransition } from "react";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { USER_ROLES, labelFor } from "@/lib/constants";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  permissionLabel,
  type Permission,
  type PermissionMatrix as Matrix,
  type Role,
} from "@/lib/permissions";
import { setRolePermission, resetRolePermissions } from "./actions";

const ROLES = USER_ROLES.map((r) => r.value) as Role[];

function Cell({
  role,
  permission,
  allowed,
}: {
  role: Role;
  permission: Permission;
  allowed: boolean;
}) {
  const [optimistic, setOptimistic] = useState(allowed);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (role === "admin") {
    return (
      <input
        type="checkbox"
        checked
        disabled
        aria-label={`${permissionLabel(permission)} for Admin: always allowed`}
        className="h-4 w-4 cursor-not-allowed accent-[var(--primary)] opacity-60"
      />
    );
  }

  // Admin access comes from the Admin role only (can() ignores the matrix for
  // it), so this cell is never grantable for another role.
  if (permission === "admin.manage") {
    return (
      <input
        type="checkbox"
        checked={false}
        disabled
        aria-label={`${permissionLabel(permission)} for ${labelFor(USER_ROLES, role)}: only the Admin role`}
        title="Admin access comes from the Admin role. Change the teammate's role on Admin > Team."
        className="h-4 w-4 cursor-not-allowed accent-[var(--primary)] opacity-40"
      />
    );
  }

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    startTransition(async () => {
      const result = await setRolePermission(role, permission, next);
      if (result && result.ok === false) {
        setOptimistic(!next);
        setError(result.message);
      }
    });
  }

  return (
    <span className="relative inline-flex">
      <input
        type="checkbox"
        checked={optimistic}
        disabled={isPending}
        onChange={toggle}
        aria-label={`${permissionLabel(permission)} for ${labelFor(USER_ROLES, role)}: ${
          optimistic ? "allowed" : "not allowed"
        }`}
        className={`h-4 w-4 cursor-pointer accent-[var(--primary)] ${isPending ? "opacity-60" : ""}`}
      />
      {error && (
        <span
          role="alert"
          className="banner-alert absolute left-1/2 top-full z-10 mt-1 w-max max-w-64 -translate-x-1/2 px-2.5 py-1.5 text-xs"
        >
          {error}
        </span>
      )}
    </span>
  );
}

function ResetRoleButton({ role }: { role: Role }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const roleLabel = labelFor(USER_ROLES, role);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-[11px] font-medium text-gray-dark underline decoration-dotted underline-offset-2 hover:text-ink"
        onClick={() => setConfirming(true)}
      >
        Reset to defaults
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Reset ${roleLabel} to the shipped defaults?`}
        confirmLabel="Reset"
        danger
        pending={isPending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await resetRolePermissions(role);
            if (result && result.ok === false) {
              setError(result.message);
            }
            setConfirming(false);
          });
        }}
        onClose={() => setConfirming(false)}
      >
        Every permission for {roleLabel} goes back to what HSS ships by default. This can&apos;t
        be undone, though any cell can be toggled again afterward.
      </ConfirmDialog>
      {error && (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-64 px-2.5 py-1.5 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}

export function PermissionMatrixTable({ matrix }: { matrix: Matrix }) {
  return (
    <div className="card card-flush overflow-hidden overflow-x-auto">
      <table className="table-klyne min-w-[720px]">
        <thead>
          <tr>
            <th></th>
            {ROLES.map((role) => (
              <th key={role} className="text-center">
                {labelFor(USER_ROLES, role)}
              </th>
            ))}
          </tr>
          <tr>
            <th className="border-b-0"></th>
            {ROLES.map((role) => (
              <th key={role} className="border-b-0 pt-0 text-center">
                {role === "admin" ? null : <ResetRoleButton role={role} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_GROUPS.map((group) => (
            <Fragment key={group}>
              <tr>
                <td
                  colSpan={ROLES.length + 1}
                  className="bg-hover text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-dark"
                >
                  {group}
                </td>
              </tr>
              {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <tr key={p.key}>
                  <td className="text-[13px] text-ink">{p.label}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="text-center">
                      <Cell role={role} permission={p.key} allowed={matrix[role][p.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
