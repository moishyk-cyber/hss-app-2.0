"use client";

// Trucker picker on the deliveries list (Aug 31 feedback, two rounds):
// a grey pill that opens a searchable menu of every trucker on file, with an
// "Add «name»" row when nothing matches - so new truckers can be created right
// here, same escape hatch as the business/contact/vendor comboboxes.
// Menu renders through the shared DropMenu portal so the list card can't clip it.

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DropMenu, useDismiss, Spinner } from "@/lib/ui";
import { setPoTrucker } from "../orders/actions";

export function TruckerSelect({
  poId,
  value,
  truckers,
}: {
  poId: string;
  value: string | null;
  truckers: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useDismiss(open, () => setOpen(false), [boxRef, menuRef]);

  const known = [...new Set(optimistic ? [...truckers, optimistic] : truckers)].sort();
  const trimmed = query.trim();
  const matches = trimmed
    ? known.filter((t) => t.toLowerCase().includes(trimmed.toLowerCase()))
    : known;
  const canAdd = trimmed !== "" && !known.some((t) => t.toLowerCase() === trimmed.toLowerCase());

  function pick(next: string) {
    setOpen(false);
    setQuery("");
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      setError(null);
      try {
        const result = await setPoTrucker(poId, next);
        if (result && result.ok === false) setError(result.message);
      } catch {
        setError("Something went wrong. Please try again.");
      }
      router.refresh();
    });
  }

  return (
    <span ref={boxRef} className="relative block w-full">
      {/* Full column width with the caret pinned right, so the pills form one
          straight, even column down the list. */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-1 rounded-full border border-border bg-hover px-2.5 py-1 text-[12px] transition-colors hover:text-ink ${
          optimistic ? "text-ink" : "text-gray-dark"
        } ${isPending ? "opacity-60" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-1">
          {isPending ? <Spinner /> : null}
          <span className="truncate">{optimistic || "No trucker yet"}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[9px] opacity-70">
          ▾
        </span>
      </button>

      <DropMenu open={open} anchorRef={boxRef} menuRef={menuRef}>
        <div className="card card-flush w-52 py-1.5">
          <div className="px-2 pb-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canAdd) pick(trimmed);
                  else if (matches.length === 1) pick(matches[0]);
                }
              }}
              placeholder="Search or add a trucker…"
              className="input-klyne w-full px-2 py-1 text-xs"
              aria-label="Search truckers"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {optimistic ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick("")}
                  className="w-full px-3 py-1.5 text-left text-[13px] text-gray transition-colors hover:bg-hover"
                >
                  Clear trucker
                </button>
              </li>
            ) : null}
            {matches.map((t) => (
              <li key={t} role="option" aria-selected={t === optimistic}>
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className={`w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-hover ${
                    t === optimistic ? "font-semibold text-ink" : "text-gray-dark"
                  }`}
                >
                  {t}
                </button>
              </li>
            ))}
            {canAdd ? (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pick(trimmed)}
                  className="w-full border-t border-border px-3 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-hover"
                >
                  ＋ Add “{trimmed}”
                </button>
              </li>
            ) : null}
            {matches.length === 0 && !canAdd ? (
              <li className="px-3 py-2 text-[13px] text-gray">No truckers yet - type a name to add one.</li>
            ) : null}
          </ul>
        </div>
      </DropMenu>

      {error ? (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-64 px-2.5 py-1.5 text-xs">
          {error}
        </span>
      ) : null}
    </span>
  );
}
