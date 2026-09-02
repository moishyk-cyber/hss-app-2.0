"use client";

import { useState, useTransition } from "react";
import { USER_ROLES, labelFor } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect, Spinner } from "@/lib/ui";
import { Avatar } from "@/lib/Avatar";
import type { ActionResult } from "@/lib/actionResult";
import { updateUserField, setUserActive } from "./actions";

/* --- glyphs (copied inline per this round's instructions - not imported
   from phonebook/_ui, which is off-limits this round) -------------------- */

function MailIcon() {
  return (
    <span className="field-icon" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    </span>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

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
  inputClassName = "",
  autoFocus = false,
  ariaLabel,
}: {
  id: string;
  field: "name" | "email";
  initial: string;
  placeholder?: string;
  type?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** Accessible name - the same-looking inputs repeat down the table. */
  ariaLabel?: string;
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
    <span className="relative inline-flex min-w-0 flex-1 items-center gap-2">
      <input
        className={`input-klyne w-full min-w-0 ${inputClassName}`}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
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

/**
 * Email as a mailto icon link, phonebook-style - clicking the address composes
 * a message. A row still needs to be able to correct a typo'd address, so the
 * small pencil control swaps in the same inline editor the name field uses.
 */
function EmailCell({ id, initial, name }: { id: string; initial: string; name: string }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <span onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
      }}>
        <InlineField
          id={id}
          field="email"
          initial={initial}
          type="email"
          placeholder="email@hsskitchens.com"
          ariaLabel={`Email for ${name}`}
          autoFocus
        />
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <a
        href={`mailto:${initial}`}
        className="inline-flex min-w-0 items-center gap-2 text-[13px] text-gray-dark transition-colors hover:text-ink"
        title={initial}
      >
        <MailIcon />
        <span className="truncate">{initial}</span>
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${initial}`}
        className="shrink-0 text-gray transition-colors hover:text-ink"
      >
        <PencilIcon />
      </button>
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
      <td className="min-w-[200px]">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={user.name} kind="person" size="md" />
          <InlineField
            id={user.id}
            field="name"
            initial={user.name}
            placeholder="Full name"
            ariaLabel={`Full name for ${user.email}`}
            inputClassName="font-semibold text-ink"
          />
        </span>
      </td>
      <td className="min-w-[200px]">
        <EmailCell id={user.id} initial={user.email} name={user.name} />
      </td>
      <td className="min-w-[140px]">
        {/* Role changes apply everywhere at once - a stray click shouldn't
            escalate anyone, so the pick is confirmed first (Sep 2 QA P2). */}
        <OptimisticSelect
          value={user.role}
          options={USER_ROLES}
          action={(next) => updateUserField(user.id, "role", next)}
          ariaLabel={`Role for ${user.name}: ${labelFor(USER_ROLES, user.role)}`}
          confirm={(next) => ({
            title: `Change ${user.name}'s role?`,
            body: `${user.name} goes from ${labelFor(USER_ROLES, user.role)} to ${labelFor(
              USER_ROLES,
              next
            )}. The change applies immediately and is logged.`,
            confirmLabel: "Change role",
          })}
        />
      </td>
      <td>
        <BadgeSelect
          value={user.active ? "active" : "inactive"}
          options={ACTIVE_STATES}
          colorMap={ACTIVE_COLORS}
          action={(next) => setUserActive(user.id, next)}
          ariaLabel={`Status for ${user.name}: ${user.active ? "Active" : "Inactive"}`}
          confirm={(next) =>
            next === "inactive"
              ? {
                  title: `Deactivate ${user.name}?`,
                  body: `${user.name} disappears from every assignee and owner picker. Nothing they currently own is reassigned, and they can be reactivated here any time.`,
                  confirmLabel: "Deactivate",
                  danger: true,
                }
              : {
                  title: `Reactivate ${user.name}?`,
                  body: `${user.name} shows up again in every assignee and owner picker.`,
                  confirmLabel: "Reactivate",
                }
          }
        />
      </td>
    </tr>
  );
}
