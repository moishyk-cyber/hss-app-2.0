"use client";

import { useState, useTransition } from "react";
import { USER_ROLES } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect, Spinner } from "@/lib/ui";
import type { ActionResult } from "@/lib/actionResult";
import { updateUserField, setUserActive } from "./actions";

const ACTIVE_STATES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;
const ACTIVE_COLORS: Record<string, string> = { active: "badge-green", inactive: "badge-gray" };

function InlineField({
  id,
  field,
  initial,
  placeholder,
  type = "text",
}: {
  id: string;
  field: "name" | "email";
  initial: string;
  placeholder?: string;
  type?: string;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (value.trim() === initial) return;
    startTransition(async () => {
      setError(null);
      const result: ActionResult = await updateUserField(id, field, value);
      if (!result.ok) {
        setError(result.message);
        setValue(initial);
      }
    });
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      <input
        className="input-klyne w-full min-w-0"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {pending && <Spinner className="text-gray shrink-0" />}
      {error && (
        <span role="alert" className="banner-warn absolute left-0 top-full z-10 mt-1 w-max max-w-64 px-2.5 py-1.5 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}

export function UserRow({
  user,
}: {
  user: { id: string; name: string; email: string; role: string; active: boolean };
}) {
  return (
    <tr>
      <td className="min-w-[160px]">
        <InlineField id={user.id} field="name" initial={user.name} placeholder="Full name" />
      </td>
      <td className="min-w-[200px]">
        <InlineField id={user.id} field="email" initial={user.email} type="email" placeholder="email@hsskitchens.com" />
      </td>
      <td className="min-w-[140px]">
        <OptimisticSelect
          value={user.role}
          options={USER_ROLES}
          action={(next) => updateUserField(user.id, "role", next)}
        />
      </td>
      <td>
        <BadgeSelect
          value={user.active ? "active" : "inactive"}
          options={ACTIVE_STATES}
          colorMap={ACTIVE_COLORS}
          action={(next) => setUserActive(user.id, next)}
        />
      </td>
    </tr>
  );
}
