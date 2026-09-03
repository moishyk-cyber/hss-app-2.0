"use client";

// Shared interaction primitives - the smoothness kit.
// Every server-action control in the app should use these (or the same patterns)
// so nothing ever feels dead between click and response.

import { createPortal, useFormStatus } from "react-dom";
import { useTransition, useOptimistic, useRef, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActionResult } from "./actionResult";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Returned by a select's `confirm` callback when picking that value should be
 * double-checked first (role changes, deactivations). Return null for values
 * that can apply straight away.
 */
export type ConfirmSpec = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};

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
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  /** Accessible name - use where identical buttons repeat down a list. */
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} ${pending ? "opacity-60 cursor-progress" : ""}`}
      aria-busy={pending}
      aria-label={ariaLabel}
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
 * Shared optimistic-action plumbing for the custom dropdowns below: applies the
 * change instantly, runs the server action in a transition, surfaces failures,
 * and pulls a fresh server render so everything derived from the value
 * (steppers, badges, queues) updates immediately.
 */
function useOptimisticAction(value: string, action: (next: string) => Promise<ActionResult | void>) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function run(next: string) {
    startTransition(async () => {
      setOptimistic(next);
      setError(null);
      try {
        setError(errorFrom(await action(next)));
      } catch {
        setError("Something went wrong. Please try again.");
      }
      router.refresh();
    });
  }
  return { isPending, optimistic, error, run };
}

/**
 * Arrow-key navigation for the popover menus (a11y round, Sep 2): attach to the
 * wrapper element - portal children bubble key events through the React tree,
 * so this catches keys whether focus sits on the trigger or inside the menu.
 */
export function menuArrowNav(e: React.KeyboardEvent, menuRef: React.RefObject<HTMLElement | null>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const root = menuRef.current;
  if (!root) return;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>('[role="option"] button, [role="menuitem"]')
  ).filter((el) => !el.hasAttribute("disabled"));
  if (items.length === 0) return;
  e.preventDefault();
  const idx = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "ArrowDown" ? (idx + 1) % items.length : idx <= 0 ? items.length - 1 : idx - 1;
  items[next]?.focus();
}

/** Moves focus onto the selected (or first) option when a popover menu opens. */
export function useMenuFocusOnOpen(open: boolean, menuRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const el =
        menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"] button') ??
        menuRef.current?.querySelector<HTMLElement>('[role="option"] button');
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, menuRef]);
}

/** Dismiss-on-outside-click / Escape for the custom dropdown menus. */
export function useDismiss(
  open: boolean,
  close: () => void,
  refs: ReadonlyArray<React.RefObject<HTMLElement | null>>
) {
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close, ...refs]);
}

/**
 * Portal wrapper for the custom dropdown menus: renders at document.body so no
 * overflow container (tables, tab panels, cards) can clip the open menu. Fixed
 * position tracks the trigger on scroll/resize and flips above the trigger when
 * there's no room below.
 */
export function DropMenu({
  open,
  anchorRef,
  menuRef,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; up: boolean } | null>(null);

  useEffect(() => {
    // No cleanup needed here: `open` alone already gates the render bail-out
    // below, and the moment `open` flips true again `update()` runs before
    // anything reads `pos` - so there's nothing to reset while closed.
    if (!open) return;
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      const up = spaceBelow < 280 && r.top > spaceBelow;
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, minWidth: r.width, up });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        minWidth: pos.minWidth,
        zIndex: 60,
        ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/**
 * Select that applies its change INSTANTLY on screen (optimistic) and runs the
 * server action in a transition. Renders a styled popover menu, not the raw
 * browser dropdown (Aug 31 feedback: "fix all dropdowns").
 */
export function OptimisticSelect({
  value,
  options,
  action,
  className = "input-klyne",
  render,
  confirm,
  ariaLabel,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  action: (next: string) => Promise<ActionResult | void>;
  className?: string;
  /** Optional: render the current value as a badge/label next to the control. */
  render?: (optimisticValue: string, pending: boolean) => React.ReactNode;
  /** Return a ConfirmSpec to double-check a pick before it applies; null = apply now. */
  confirm?: (next: string) => ConfirmSpec | null;
  ariaLabel?: string;
}) {
  const { isPending, optimistic, error, run } = useOptimisticAction(value, action);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ next: string; spec: ConfirmSpec } | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [boxRef, menuRef]);
  useMenuFocusOnOpen(open, menuRef);
  const label = options.find((o) => o.value === optimistic)?.label ?? optimistic ?? "";

  function choose(next: string) {
    setOpen(false);
    if (next === optimistic) return;
    const spec = confirm?.(next);
    if (spec) setConfirming({ next, spec });
    else run(next);
  }

  return (
    <span
      ref={boxRef}
      className="relative inline-flex items-center gap-2"
      onKeyDown={(e) => menuArrowNav(e, menuRef)}
    >
      {render?.(optimistic, isPending)}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className={`${className} inline-flex cursor-pointer items-center justify-between gap-1.5 text-left ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-[9px] opacity-70">
          ▾
        </span>
      </button>
      <DropMenu open={open} anchorRef={boxRef} menuRef={menuRef}>
        <ul role="listbox" className="card card-flush max-h-64 overflow-y-auto py-1.5">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === optimistic}>
              <button
                type="button"
                onClick={() => choose(o.value)}
                className={`w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-hover ${
                  o.value === optimistic ? "font-semibold text-ink" : "text-gray-dark"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </DropMenu>
      {confirming ? (
        <ConfirmDialog
          open
          title={confirming.spec.title}
          confirmLabel={confirming.spec.confirmLabel}
          danger={confirming.spec.danger}
          onConfirm={() => {
            const next = confirming.next;
            setConfirming(null);
            run(next);
          }}
          onClose={() => setConfirming(null)}
        >
          {confirming.spec.body}
        </ConfirmDialog>
      ) : null}
      {error && <InlineError message={error} />}
    </span>
  );
}

/**
 * A status pill that IS the dropdown: looks like a .badge, click opens a styled
 * popover of the option pills, color + label flip optimistically the moment a
 * value is chosen.
 */
export function BadgeSelect({
  value,
  options,
  action,
  colorMap,
  fallback = "badge-gray",
  confirm,
  ariaLabel = "Change status",
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  action: (next: string) => Promise<ActionResult | void>;
  colorMap: Record<string, string>;
  fallback?: string;
  /** Return a ConfirmSpec to double-check a pick before it applies; null = apply now. */
  confirm?: (next: string) => ConfirmSpec | null;
  ariaLabel?: string;
}) {
  const { isPending, optimistic, error, run } = useOptimisticAction(value, action);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ next: string; spec: ConfirmSpec } | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [boxRef, menuRef]);
  useMenuFocusOnOpen(open, menuRef);
  const label = options.find((o) => o.value === optimistic)?.label ?? optimistic;

  function choose(next: string) {
    setOpen(false);
    if (next === optimistic) return;
    const spec = confirm?.(next);
    if (spec) setConfirming({ next, spec });
    else run(next);
  }

  return (
    <span
      ref={boxRef}
      className="relative inline-block"
      onKeyDown={(e) => menuArrowNav(e, menuRef)}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className={`badge cursor-pointer select-none ${colorMap[optimistic] ?? fallback} ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {isPending ? <Spinner className="mr-1" /> : null}
        {label}
        <span aria-hidden className="ml-1 text-[9px] opacity-70">
          ▾
        </span>
      </button>
      <DropMenu open={open} anchorRef={boxRef} menuRef={menuRef}>
        <ul role="listbox" className="card card-flush max-h-64 w-max overflow-y-auto p-1.5">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === optimistic}>
              <button
                type="button"
                onClick={() => choose(o.value)}
                className={`flex w-full items-center rounded-md px-1.5 py-1 transition-colors hover:bg-hover ${
                  o.value === optimistic ? "bg-hover" : ""
                }`}
              >
                <span className={`badge ${colorMap[o.value] ?? fallback}`}>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </DropMenu>
      {confirming ? (
        <ConfirmDialog
          open
          title={confirming.spec.title}
          confirmLabel={confirming.spec.confirmLabel}
          danger={confirming.spec.danger}
          onConfirm={() => {
            const next = confirming.next;
            setConfirming(null);
            run(next);
          }}
          onClose={() => setConfirming(null)}
        >
          {confirming.spec.body}
        </ConfirmDialog>
      ) : null}
      {error && <InlineError message={error} />}
    </span>
  );
}

/** Action button (not inside a form) that runs a server action in a transition with pending feedback. */
export function ActionButton({
  action,
  children,
  className = "btn btn-sm",
  ariaLabel,
  title,
}: {
  action: () => Promise<ActionResult | void>;
  children: React.ReactNode;
  className?: string;
  /** Accessible name - REQUIRED at call sites whose children are icon-only. */
  ariaLabel?: string;
  title?: string;
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
        aria-label={ariaLabel}
        title={title}
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
  ariaLabel = "Search",
}: {
  paramKey?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramKey) ?? "");
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function pushValue(next: string, debounceMs: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      if (next) sp.set(paramKey, next);
      else sp.delete(paramKey);
      startTransition(() => {
        const query = sp.toString();
        router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, {
          scroll: false,
        });
      });
    }, debounceMs);
  }

  return (
    <span className="relative inline-flex items-center">
      <input
        type="search"
        className={`${className} pr-8`}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          pushValue(next, 250);
        }}
      />
      {isPending ? (
        <Spinner className="absolute right-8 text-gray" />
      ) : value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            pushValue("", 0);
          }}
          className="absolute right-2.5 rounded px-0.5 text-gray transition-colors hover:text-ink"
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
