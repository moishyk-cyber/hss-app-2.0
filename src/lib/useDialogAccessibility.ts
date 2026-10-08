"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Shared keyboard containment, dismissal, and return focus for short actions. */
export function useDialogAccessibility(panel: RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void, pending = false) {
  const close = useRef(onClose);
  const busy = useRef(pending);
  useEffect(() => { close.current = onClose; busy.current = pending; }, [onClose, pending]);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'
    ) ?? []).filter(el => el.getClientRects().length > 0);
    function onKey(event: KeyboardEvent) {
      // Only the frontmost dialog owns focus and dismissal when confirmations
      // open over a record panel.
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== panel.current) return;
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && panel.current?.querySelector('[role="listbox"]')) return;
      if (event.key === "Escape") { event.preventDefault(); if (!busy.current) close.current(); }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0];
      const last = targets.at(-1);
      if (!first || !last) { event.preventDefault(); panel.current?.focus(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel.current || !panel.current?.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || !panel.current?.contains(active))) {
        event.preventDefault(); first.focus();
      }
    }
    function contain(event: FocusEvent) {
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== panel.current) return;
      if (event.target instanceof Node && !panel.current?.contains(event.target)) panel.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", contain);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, panel]);
}
