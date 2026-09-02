"use client";

// Avatar dropdown for picking a person (assignee, owner). Replaces the native
// <select> everywhere a user is chosen inline - each option shows the person's
// avatar circle next to their name (a native select can't render images).
// Optimistic, and pulls a fresh server render after the action like the other
// controls in ui.tsx.

import { useRef, useState, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { DropMenu, menuArrowNav, useDismiss, useMenuFocusOnOpen } from "./ui";
import type { ActionResult } from "./actionResult";

type UserOption = { id: string; name: string };

export function UserSelect({
  value,
  users,
  action,
  allowUnassigned = true,
  className = "",
}: {
  /** Current user id, or "" for unassigned. */
  value: string;
  users: UserOption[];
  action: (next: string) => Promise<ActionResult | void>;
  allowUnassigned?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const current = users.find((u) => u.id === optimistic) ?? null;

  useDismiss(open, () => setOpen(false), [boxRef, menuRef]);
  useMenuFocusOnOpen(open, menuRef);

  function pick(nextId: string) {
    setOpen(false);
    if (nextId === optimistic) return;
    startTransition(async () => {
      setOptimistic(nextId);
      setError(null);
      try {
        const result = await action(nextId);
        if (result && result.ok === false) setError(result.message);
      } catch {
        setError("Something went wrong. Please try again.");
      }
      router.refresh();
    });
  }

  const rows: UserOption[] = allowUnassigned ? [{ id: "", name: "Unassigned" }, ...users] : users;

  return (
    <div
      ref={boxRef}
      className={`relative inline-block ${className}`}
      onKeyDown={(e) => menuArrowNav(e, menuRef)}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change assignee"
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border border-border bg-panel py-0.5 pl-0.5 pr-2 text-xs font-medium text-gray-dark transition-colors hover:bg-hover hover:text-ink ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {current ? (
          <Avatar name={current.name} kind="person" size="sm" />
        ) : (
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[11px] text-gray"
          >
            ?
          </span>
        )}
        <span className="max-w-28 truncate">{current ? current.name : "Unassigned"}</span>
        <span aria-hidden className="text-[9px] opacity-70">
          ▾
        </span>
      </button>

      <DropMenu open={open} anchorRef={boxRef} menuRef={menuRef}>
        <ul role="listbox" className="card card-flush max-h-64 w-48 overflow-y-auto py-1.5">
          {rows.map((u) => (
            <li key={u.id || "unassigned"} role="option" aria-selected={u.id === optimistic}>
              <button
                type="button"
                onClick={() => pick(u.id)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-hover ${
                  u.id === optimistic ? "font-semibold text-ink" : "text-gray-dark"
                }`}
              >
                {u.id ? (
                  <Avatar name={u.name} kind="person" size="sm" />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[11px] text-gray"
                  >
                    ?
                  </span>
                )}
                <span className="truncate">{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </DropMenu>

      {error ? (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-64 px-2.5 py-1.5 text-xs">
          {error}
        </span>
      ) : null}
    </div>
  );
}
