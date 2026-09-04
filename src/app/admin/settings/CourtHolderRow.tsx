"use client";

// One row of the "Ball in court" card: a role select and a person select,
// saved together on change via setCourtHolder. Plain selects (not
// OptimisticSelect) because a row edits two values together, not one.

import { useState, useTransition } from "react";
import { useToast } from "@/lib/toast";
import { USER_ROLES } from "@/lib/constants";
import type { Role } from "@/lib/permissions";
import type { Court } from "@/lib/ballInCourt";
import { setCourtHolder } from "./actions";

type UserOption = { id: string; name: string };

export function CourtHolderRow({
  court,
  courtLabel,
  role,
  userId,
  users,
}: {
  court: Court;
  courtLabel: string;
  role: Role;
  userId: string;
  users: UserOption[];
}) {
  const [optimisticRole, setOptimisticRole] = useState<Role>(role);
  const [optimisticUserId, setOptimisticUserId] = useState(userId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function save(nextRole: Role, nextUserId: string) {
    const prevRole = optimisticRole;
    const prevUserId = optimisticUserId;
    setOptimisticRole(nextRole);
    setOptimisticUserId(nextUserId);
    setError(null);
    startTransition(async () => {
      const result = await setCourtHolder(court, nextRole, nextUserId);
      if (result && result.ok === false) {
        setOptimisticRole(prevRole);
        setOptimisticUserId(prevUserId);
        setError(result.message);
      } else {
        toast({ kind: "success", message: `${courtLabel} holder updated` });
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span className="text-[13.5px] font-medium text-ink">{courtLabel}</span>
      <div className="flex items-center gap-2">
        <select
          value={optimisticRole}
          disabled={isPending}
          onChange={(e) => save(e.target.value as Role, optimisticUserId)}
          aria-label={`${courtLabel} role`}
          className="input-klyne w-auto py-1 text-[13px]"
        >
          {USER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={optimisticUserId}
          disabled={isPending}
          onChange={(e) => save(optimisticRole, e.target.value)}
          aria-label={`${courtLabel} person`}
          className="input-klyne w-auto py-1 text-[13px]"
        >
          <option value="">Anyone in that role</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <span role="alert" className="banner-alert w-full px-2.5 py-1.5 text-xs">
          {error}
        </span>
      )}
    </li>
  );
}
