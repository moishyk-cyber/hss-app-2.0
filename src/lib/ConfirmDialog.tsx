"use client";

// Shared confirmation dialog for actions that are hard to reverse: marking a
// payment paid, changing someone's role, deactivating a teammate, closing a
// deal. Same accessible-dialog pattern as tasks/TaskModal.tsx (role=dialog,
// Escape, click-outside, focus on open, body scroll lock).
//
// Deliberately does NOT import from ./ui - ui.tsx imports this file for its
// confirm-before-run selects, and a cycle between the two client bundles is
// asking for trouble.

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the outlined-red danger style. */
  danger?: boolean;
  /** Disables both buttons and shows a spinner while the action runs. */
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[16vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card w-full max-w-md space-y-4 shadow-[var(--shadow-card-hover)] outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {children ? <div className="text-sm text-gray-dark">{children}</div> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"} ${
              pending ? "cursor-progress opacity-60" : ""
            }`}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
                />
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
