"use client";

// Shared interaction primitives - the smoothness kit.
// Every server-action control in the app should use these (or the same patterns)
// so nothing ever feels dead between click and response.

import { useFormStatus } from "react-dom";
import { useTransition, useOptimistic, useRef, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActionResult } from "./actionResult";

/** Pulls a failure message out of an action's result, if it failed. */
function errorFrom(result: ActionResult | void): string | null {
  return result && result.ok === false ? result.message : null;
}

/** Small inline banner anchored under a control, positioned so it doesn't reflow layout. */
function InlineError({ message }: { message: string }) {
  return (
    <span
      role="alert"
      className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-64 px-2.5 py-1.5 text-xs"
    >
      {message}
    </span>
  );
}

/**
 * Validation/error banner that announces itself and takes focus on mount, so a
 * keyboard or screen-reader user lands on the reason a save was rejected instead
 * of having to hunt for it.
 */
export function FormAlert({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} role="alert" tabIndex={-1} className="banner-alert mb-5">
      {children}
    </div>
  );
}

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
  action: (next: string) => Promise<ActionResult | void>;
  className?: string;
  /** Optional: render the current value as a badge/label next to the select. */
  render?: (optimisticValue: string, pending: boolean) => React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="relative inline-flex items-center gap-2">
      {render?.(optimistic, isPending)}
      <select
        className={`${className} ${isPending ? "opacity-60" : ""}`}
        value={optimistic}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            setOptimistic(next);
            setError(null);
            try {
              setError(errorFrom(await action(next)));
            } catch {
              setError("Something went wrong. Please try again.");
            }
            // Pull the fresh server render so the value sticks and everything
            // derived from it (steppers, badges, queues) updates immediately.
            router.refresh();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <InlineError message={error} />}
    </span>
  );
}

/**
 * A status pill that IS the dropdown: looks like a .badge, click opens the native
 * select menu, color + label flip optimistically the moment a value is chosen.
 * Replaces the old "badge + separate select" pairs.
 */
export function BadgeSelect({
  value,
  options,
  action,
  colorMap,
  fallback = "badge-gray",
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  action: (next: string) => Promise<ActionResult | void>;
  colorMap: Record<string, string>;
  fallback?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const label = options.find((o) => o.value === optimistic)?.label ?? optimistic;
  return (
    <span
      className={`badge relative cursor-pointer select-none ${colorMap[optimistic] ?? fallback} ${
        isPending ? "opacity-60" : ""
      }`}
    >
      {isPending ? <Spinner className="mr-1" /> : null}
      {label}
      <span aria-hidden className="ml-1 text-[9px] opacity-70">
        ▾
      </span>
      <select
        aria-label="Change status"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={optimistic}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            setOptimistic(next);
            setError(null);
            try {
              setError(errorFrom(await action(next)));
            } catch {
              setError("Something went wrong. Please try again.");
            }
            // Pull the fresh server render so the pill sticks and everything
            // derived from it (steppers, badges, queues) updates immediately.
            router.refresh();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <InlineError message={error} />}
    </span>
  );
}

/** Action button (not inside a form) that runs a server action in a transition with pending feedback. */
export function ActionButton({
  action,
  children,
  className = "btn btn-sm",
}: {
  action: () => Promise<ActionResult | void>;
  children: React.ReactNode;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        className={`${className} ${isPending ? "opacity-60 cursor-progress" : ""}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              setError(errorFrom(await action()));
            } catch {
              setError("Something went wrong. Please try again.");
            }
            // Fresh server render so downstream state (stepper, badges) updates.
            router.refresh();
          })
        }
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
      {error && <InlineError message={error} />}
    </span>
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
