"use client";

import { SectionLink as Link } from "@/lib/SectionLink";
import { useState, useEffect, useRef } from "react";
import { useWorkflowSelection } from "@/lib/WorkflowSelection";
import type { JourneyStep, JourneyState } from "@/lib/dealWorkflow";

import { nextCompletedStep } from "@/lib/workflowProgress";

const LABELS: Record<JourneyState, string> = { complete: "Complete", in_progress: "In progress", waiting: "Waiting", to_do: "To do", not_required: "Not required", stopped: "Stopped" };

export function DealProgress({ steps: savedSteps, lost, orderHref }: { steps: JourneyStep[]; lost: boolean; orderHref?: string }) {
  const selection = useWorkflowSelection();
  const steps = savedSteps.map(step => {
    const updated = selection?.steps?.find(current => current.key === step.key);
    return updated && !["sales", "pricing", "close"].includes(step.key) ? { ...updated, action: updated.action ? { ...updated.action, href: updated.action.href.replace(/^\/orders\/[^#]+/, "") } : undefined, checks: updated.checks.map(check => ({ ...check, href: check.href ? check.href.replace(/^\/orders\/[^#]+/, "") || "#order-summary" : undefined })) } : step;
  }).filter(step => !(step.key === "quote" && selection?.quoteStatus === "not_needed")).map(step => {
    if (step.key !== "quote" || !selection?.quoteStatus) return step;
    const status = selection.quoteStatus;
    return { ...step, state: status === "accepted" ? "complete" as const : status === "sent" ? "waiting" as const : "to_do" as const,
      description: status === "accepted" ? "Customer approval is recorded. The quote step is complete." : status === "sent" ? "Waiting for customer approval. After approval, choose Quote Accepted in Quote status below." : "Prepare and send the quote, then choose Quote Sent in Quote status below.",
      checks: step.checks.map((check, index) => ({ ...check, complete: index === 0 ? check.complete : index === 1 ? ["sent", "accepted"].includes(status) : status === "accepted" })),
    };
  });
  const next = steps.find(s => !["complete", "not_required", "stopped"].includes(s.state));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = steps.find(s => s.key === (selection?.selectedKey ?? selectedKey)) ?? next ?? steps[2];
  const done = steps.filter(s => s.state === "complete" || s.state === "not_required").length;
  const checkRow = (check: JourneyStep["checks"][number], i: number) => <li key={i}>
    <span className={`deal-check ${check.complete ? "is-complete" : ""}`} aria-hidden="true">{check.complete ? "✓" : "○"}</span>
    <span className="sr-only">{check.complete ? "Complete: " : "Required: "}</span>
    {check.href && !lost ? <Link fullPage href={check.href}>{check.label}<span className="sr-only"> — open requirement</span></Link> : <span>{check.label}</span>}
  </li>;
  const previous = useRef(steps);
  const select = selection?.select;
  const signature = JSON.stringify(steps);
  useEffect(() => {
    const nextKey = nextCompletedStep(previous.current, steps, selection?.selectedKey ?? selected.key);
    previous.current = steps;
    if (nextKey) {
      setSelectedKey(nextKey); select?.(nextKey);
      requestAnimationFrame(() => document.getElementById("workflow-timeline")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
    }
  // Only evidence changes trigger advancement, never manual step selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return <section id="workflow-timeline" className="deal-progress scroll-mt-6" aria-label="Deal workflow">
    <div className="deal-progress-heading">
      <div><h2>Your next step</h2><p>{lost ? "This deal ended as Lost. Completed work stays on record." : next ? "Complete the work below to keep this deal moving." : "All workflow steps are complete."}</p></div>
      <span className="text-sm text-gray-dark">{lost ? "Closed · Lost" : `${done} of ${steps.length} steps resolved`}</span>
    </div>
    <ol className="deal-journey" aria-label="Workflow steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(76px, 1fr))` }}>
      {steps.map((s, i) => <li key={s.key}>
        <button type="button" aria-label={`${s.label}: ${LABELS[s.state]}`} aria-pressed={selected.key === s.key} aria-current={next?.key === s.key ? "step" : undefined} className="deal-step" data-state={s.state} onClick={() => { setSelectedKey(s.key); selection?.select(s.key); }}>
          <span className="deal-step-marker" aria-hidden="true">{s.state === "complete" ? "✓" : s.state === "not_required" ? "—" : s.state === "stopped" ? "×" : i + 1}</span>
          <span className="deal-step-label">{s.label}</span>
        </button>
      </li>)}
    </ol>
    <div className="deal-step-detail" aria-live="polite" aria-atomic="true">
      <div className="deal-step-intro">
        <div className="flex flex-wrap items-center gap-3"><h3>{selected.label}</h3><span className="deal-step-owner"><span className="sr-only">Responsible: </span>{selected.owner}</span>{selected.state === "waiting" ? <span className="badge badge-orange">Waiting</span> : null}</div>
        <p className="mt-2 text-sm text-gray-dark">{selected.description}</p>
        {selected.action && !lost ? <Link fullPage className="btn btn-primary btn-sm mt-4" href={selected.action.href}>{selected.action.label}</Link> : !orderHref && !["sales", "pricing", "close"].includes(selected.key) && !lost && !selected.checks.every(check => check.complete) ? <p className="mt-3 text-sm text-gray-dark">Available after the deal is won and its order is created.</p> : null}
      </div>
      <div>
        <h4 className="font-semibold text-sm mb-2">What completes this step</h4>
        <ul className="deal-requirements">
          {selected.checks.length ? selected.checks.slice(0, 4).map(checkRow) : <li>No active items yet. Add the requested items first.</li>}
        </ul>
        {selected.checks.length > 4 ? <details className="deal-more-requirements" key={`more-${selected.key}`}><summary>{selected.checks.length - 4} more requirements</summary><ul className="deal-requirements">{selected.checks.slice(4).map(checkRow)}</ul></details> : null}
        <details className="deal-completion-note" key={selected.key}><summary>Completion rule</summary><p>{selected.completion}</p></details>
      </div>
    </div>
    {orderHref ? <div className="deal-order-handoff"><span>Confirmed deal · fulfillment continues on its order</span><Link fullPage href={orderHref}>Open order →</Link></div> : null}
  </section>;
}
