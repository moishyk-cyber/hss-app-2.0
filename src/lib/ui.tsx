"use client";

// Shared interaction primitives — the smoothness kit.
// Every server-action control in the app should use these (or the same patterns)
// so nothing ever feels dead between click and response.

import { useFormStatus } from "react-dom";
import { useTransition, useOptimistic, useRef, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Submit button that instantly shows a pending state while its form's server action runs. */
export function PendingButton({
  children,
  className = "btn",
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} ${pending ? "opacity-60 cursor-progress" : ""}`}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner />
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

/**
 * Select that applies its change INSTANTLY on screen (optimistic) and runs the
 * server action in a transition. If the action throws, the value snaps back.
 */
export function OptimisticSelect({
  value,
  options,
  action,
  className = "input-klyne",
  render,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  action: (next: string) => Promise<void>;
  className?: string;
  /** Optional: render the current value as a badge/label next to the select. */
  render?: (optimisticValue: string, pending: boolean) => React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  return (
    <span className="inline-flex items-center gap-2">
      {render?.(optimistic, isPending)}
      <select
        className={`${className} ${isPending ? "opacity-60" : ""}`}
        value={optimistic}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            setOptimistic(next);
            await action(next);
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Action button (not inside a form) that runs a server action in a transition with pending feedback. */
export function ActionButton({
  action,
  children,
  className = "btn btn-sm",
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      aria-busy={isPending}
      className={`${className} ${isPending ? "opacity-60 cursor-progress" : ""}`}
      onClick={() => startTransition(async () => action())}
    >
      {isPending ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Debounced instant-search input: types stay instant locally, the URL updates
 * via a soft router.replace in a transition (server re-renders in background),
 * and a subtle spinner shows while results refresh. No submit button needed.
 */
export function InstantSearch({
  paramKey = "q",
  placeholder = "Search…",
  className = "input-klyne",
}: {
  paramKey?: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramKey) ?? "");
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <span className="relative inline-flex items-center">
      <input
        type="search"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const sp = new URLSearchParams(window.location.search);
            if (next) sp.set(paramKey, next);
            else sp.delete(paramKey);
            startTransition(() => {
              router.replace(`${window.location.pathname}?${sp.toString()}`, { scroll: false });
            });
          }, 250);
        }}
      />
      {isPending && <Spinner className="absolute right-8 text-gray" />}
    </span>
  );
}
