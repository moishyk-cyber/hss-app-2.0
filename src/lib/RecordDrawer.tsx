"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FLOW_STEPS } from "./ballInCourt";
import { readWorkflowStep } from "./pipelineWorkflow";
import { WorkflowFormCompletionProvider } from "./WorkflowFormContext";
import { lockDialogBackground } from "./dialogLocks";
import { createPortal } from "react-dom";
import { useDialogAccessibility } from "./useDialogAccessibility";

/** Intercepted routes reuse canonical record pages and retain the collection. */
export function RecordDrawer({ children, loadingRequirements = false, onDismiss }: { children: ReactNode; loadingRequirements?: boolean; onDismiss?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);
  const finishWorkflow = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    router.back();
  }, [router]);
  const open = loadingRequirements || /^\/carriers-truckers\/(new|edit)$/.test(pathname) || (/^\/(tasks|service|companies|contacts|records|pipeline|orders|purchase-orders|deliveries)\/[^/]+(?:\/edit)?$/.test(pathname) || pathname === "/intake" || pathname === "/invoices/new");
  const workflowStep = readWorkflowStep(searchParams.get("workflow"));
  const workflowMode = loadingRequirements || !!workflowStep;
  const dismiss = onDismiss ?? (() => router.back());
  const workflowLabel = FLOW_STEPS.find(step => step.key === workflowStep)?.label;
  const dialogLabel = loadingRequirements ? "Requirements" : workflowLabel ? `${workflowLabel} requirements` : undefined;
  const fullParams = new URLSearchParams(searchParams);
  fullParams.delete("workflow");
  const isForm = /\/(new|edit)$/.test(pathname) || pathname === "/intake";
  const href = pathname + (fullParams.size ? `?${fullParams}` : "");
  useDialogAccessibility(panel, open, dismiss);
  useEffect(() => { finishing.current = false; }, [pathname, workflowStep]);
  useEffect(() => {
    if (open && workflowStep && !loadingRequirements) window.dispatchEvent(new CustomEvent("workflow:form-open", { detail: { pathname, step: workflowStep } }));
  }, [open, workflowStep, loadingRequirements, pathname]);

  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const background = Array.from(shell?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement);
    return lockDialogBackground(background);
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={`record-drawer-backdrop ${workflowMode ? "workflow-form-backdrop" : ""}`} onClick={event => {
      if (event.target === event.currentTarget) dismiss();
    }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={dialogLabel ?? (isForm ? "Record form" : "Record details")} tabIndex={-1} className={`record-drawer ${workflowMode ? "workflow-form-dialog" : ""}`}>
        <div className="record-drawer-toolbar">
          <span className="record-drawer-title font-medium">{dialogLabel ?? (isForm ? "Record form" : "Record details")}</span>
          <div className="record-drawer-actions">
            {/* A document navigation intentionally leaves the intercepted route. */}
            {!loadingRequirements && <a href={href} className="record-drawer-expand">
              {isForm ? "Open full page" : "View details"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
              </svg>
            </a>}
            <button type="button" className="record-drawer-close" onClick={dismiss} aria-label={workflowMode ? "Close workflow form" : "Close record panel"} title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="record-drawer-content"><WorkflowFormCompletionProvider value={workflowStep ? finishWorkflow : null}>{children}</WorkflowFormCompletionProvider></div>
      </div>
    </div>, document.body,
  );
}
