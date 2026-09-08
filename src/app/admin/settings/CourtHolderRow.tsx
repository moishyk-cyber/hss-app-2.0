"use client";

// One row of the "Ball in court" card: a role select and a set of person
// toggles (more than one person can hold a stage), saved together on change
// via setStageHolder. Plain controls (not OptimisticSelect) because a row
// edits two values together, not one.

import { useState, useTransition } from "react";
import { useToast } from "@/lib/toast";
import { USER_ROLES } from "@/lib/constants";
import type { Role } from "@/lib/permissions";
import type { FlowStepKey } from "@/lib/ballInCourt";
import { setStageHolder } from "./actions";

type UserOption = { id: string; name: string };

export function CourtHolderRow({
  step,
  stepLabel,
  role,
  userIds,
  users,
}: {
  step: FlowStepKey;
  stepLabel: string;
  role: Role;
  userIds: string[];
  users: UserOption[];
}) {
  const [optimisticRole, setOptimisticRole] = useState<Role>(role);
  const [optimisticUserIds, setOptimisticUserIds] = useState<string[]>(userIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function save(nextRole: Role, nextUserIds: string[]) {
    const prevRole = optimisticRole;
    const prevUserIds = optimisticUserIds;
    setOptimisticRole(nextRole);
    setOptimisticUserIds(nextUserIds);
    setError(null);
    startTransition(async () => {
      const result = await setStageHolder(step, nextRole, nextUserIds);
      if (result && result.ok === false) {
        setOptimisticRole(prevRole);
        setOptimisticUserIds(prevUserIds);
        setError(result.message);
      } else {
        toast({ kind: "success", message: `${stepLabel} holder updated` });
      }
    });
  }

  function togglePerson(id: string) {
    const next = optimisticUserIds.includes(id)
      ? optimisticUserIds.filter((u) => u !== id)
      : [...optimisticUserIds, id];
    save(optimisticRole, next);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13.5px] font-medium text-ink">{stepLabel}</span>
        <select
          value={optimisticRole}
          disabled={isPending}
          onChange={(e) => save(e.target.value as Role, optimisticUserIds)}
          aria-label={`${stepLabel} role`}
          className="input-klyne w-auto py-1 text-[13px]"
        >
          {USER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {users.map((u) => {
          const picked = optimisticUserIds.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              disabled={isPending}
              aria-pressed={picked}
              onClick={() => togglePerson(u.id)}
              className={`rounded-lg border px-2.5 py-1 text-[13px] transition-colors disabled:opacity-50 ${
                picked
                  ? "border-primary bg-hover text-ink"
                  : "border-border bg-surface text-gray-dark hover:bg-hover"
              }`}
            >
              {u.name}
            </button>
          );
        })}
        {optimisticUserIds.length === 0 ? (
          <span className="text-xs text-gray">Anyone in that role</span>
        ) : null}
      </div>
      {error && (
        <span role="alert" className="banner-alert mt-2 block px-2.5 py-1.5 text-xs">
          {error}
        </span>
      )}
    </li>
  );
}
