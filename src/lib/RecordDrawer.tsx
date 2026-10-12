"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useDialogAccessibility } from "./useDialogAccessibility";

/** Intercepted routes reuse canonical record pages and retain the collection. */
export function RecordDrawer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const open = /^\/(tasks|service|companies|contacts|pipeline|orders|purchase-orders|deliveries)\/[^/]+(?:\/edit)?$/.test(pathname) || pathname === "/intake" || pathname === "/invoices/new";
  const isForm = /\/(new|edit)$/.test(pathname) || pathname === "/intake";
  const href = pathname + (searchParams.size ? `?${searchParams}` : "");
  useDialogAccessibility(panel, open, () => router.back());

  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const background = Array.from(shell?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement);
    const previous = background.map(node => node.inert);
    background.forEach(node => { node.inert = true; });
    return () => background.forEach((node, index) => { node.inert = previous[index]; });
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="record-drawer-backdrop" onClick={event => {
      if (event.target === event.currentTarget) router.back();
    }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={isForm ? "Record form" : "Record details"} tabIndex={-1} className="record-drawer">
        <div className="record-drawer-toolbar">
          <span className="record-drawer-title font-medium">{isForm ? "Record form" : "Record details"}</span>
          <div className="record-drawer-actions">
            {/* A document navigation intentionally leaves the intercepted route. */}
            <a href={href} className="record-drawer-expand">
              {isForm ? "Open full page" : "View details"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
              </svg>
            </a>
            <button type="button" className="record-drawer-close" onClick={() => router.back()} aria-label="Close record panel" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="record-drawer-content">{children}</div>
      </div>
    </div>, document.body,
  );
}
