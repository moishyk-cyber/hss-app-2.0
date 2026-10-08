"use client";

import { createContext, useContext, useEffect, useRef, useState, startTransition, type ReactNode } from "react";

import { useRouter } from "next/navigation";
import type { PaymentGate } from "./flowRules";
import type { JourneyStep } from "./dealWorkflow";

export type WorkflowPayment = { id: string; type: string; amount: number; status: string; quickbooksRef: string | null; date: string | null; dueDate: string | null; source: string; dueNote: string | null };

const WorkflowSelection = createContext<{ selectedKey: string; select: (key: string) => void; steps?: JourneyStep[]; paymentState?: { payments: WorkflowPayment[]; gate: PaymentGate }; quoteStatus?: string; recordQuoteStatus: (status: string) => void } | null>(null);
export const useWorkflowSelection = () => useContext(WorkflowSelection);

/** One selection controls both the guide and its work area, preserving form drafts. */
export function WorkflowSelectionProvider({ initialKey, stepKeys, orderId, revision, children }: { initialKey: string; stepKeys?: string[]; orderId?: string; revision?: string; children: ReactNode }) {
  const router = useRouter();
  const [uncertain, setUncertain] = useState(false);
  const [snapshotRevision, setSnapshotRevision] = useState(revision);
  const [paymentState, setPaymentState] = useState<{ payments: WorkflowPayment[]; gate: PaymentGate }>();
  const [steps, setSteps] = useState<JourneyStep[]>();
  const [chosenKey, select] = useState(initialKey);
  const [quoteStatus, setQuoteStatus] = useState<string>();
  function recordQuoteStatus(status: string) { setQuoteStatus(status);  }
  const selectedKey = stepKeys && !stepKeys.includes(chosenKey) && chosenKey !== "files" ? initialKey : chosenKey;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function saved(event: Event) {
      const detail = (event as CustomEvent<{ orderId: string; steps: JourneyStep[]; payments: WorkflowPayment[]; gate: PaymentGate }>).detail;
      if (detail.orderId !== orderId) return;
      setSnapshotRevision(revision);
      setSteps(detail.steps);
      if (detail.payments && detail.gate) setPaymentState({ payments: detail.payments, gate: detail.gate });
      // Let the form/button promise settle before refreshing other page data.
      window.setTimeout(() => startTransition(() => router.refresh()), 100);
    }
    function unknownSave() { setUncertain(true); }
    function reveal(event: Event) {
      const { keys, preferred } = (event as CustomEvent<{ keys: string[]; preferred: string }>).detail;
      select(current => keys.includes(preferred) ? preferred : keys.includes(current) ? current : keys[0]);
    }
    const node = root.current;
    node?.addEventListener("workflow:reveal", reveal);
    node?.addEventListener("workflow:saved", saved);
    node?.addEventListener("workflow:uncertain", unknownSave);
    return () => { node?.removeEventListener("workflow:reveal", reveal); node?.removeEventListener("workflow:saved", saved); node?.removeEventListener("workflow:uncertain", unknownSave); };
  }, [orderId, revision, router]);
  return <WorkflowSelection.Provider value={{ selectedKey, select, steps: snapshotRevision === revision ? steps : undefined, paymentState: snapshotRevision === revision ? paymentState : undefined, quoteStatus, recordQuoteStatus }}><div ref={root} data-workflow-order={orderId} className="contents" onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    const href = anchor?.getAttribute("href") ?? "";
    if (href === "#close") select("close");
    else if (href.startsWith("#deal-")) select("sales");
    else if (href === "#line-items" || href.startsWith("#pricing-")) select("pricing");
  }}>{uncertain ? <div role="alert" className="banner-warn mb-4 flex items-center justify-between gap-4"><span>We couldn’t confirm the last save. Check the saved state before making another change.</span><button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>Reload saved state</button></div> : null}{children}</div></WorkflowSelection.Provider>;
}

export function WorkflowPanel({ when, children }: { when: string[]; children: ReactNode }) {
  const selection = useWorkflowSelection();
  return <div data-workflow-steps={when.join(",")} hidden={!!selection && !when.includes(selection.selectedKey)}>{children}</div>;
}
