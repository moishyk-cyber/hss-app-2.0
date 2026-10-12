"use client";
import { useState } from "react";
import { ActionButton } from "@/lib/ui";
import { ValidationDialog } from "@/lib/ValidationDialog";
import { highlightSection } from "@/lib/SectionLink";
import { markOrderComplete } from "@/lib/workflowActions";
import { useWorkflowSelection } from "@/lib/WorkflowSelection";
import type { JourneyStep } from "@/lib/dealWorkflow";

export function CloseoutControl({ orderId, step }: { orderId: string; step: JourneyStep }) {
  const selection = useWorkflowSelection();
  const current = selection?.steps?.find(item => item.key === "service") ?? step;
  const issues = current.checks.filter(check => !check.complete && check.label !== "Order marked complete").map(check => ({ field: check.label, message: check.label, href: check.href?.replace(/^\/orders\/[^#]+/, "") }));
  const [showIssues, setShowIssues] = useState(false);
  return <div id="order-complete" className="mt-5 border-t border-border pt-4 space-y-3">
    <h3 className="text-sm font-semibold">Finish this order</h3>
    {current.state === "complete" ? <p className="text-sm text-gray-dark">All requirements are met. This order is complete.</p> : <>
      <p className="text-sm text-gray-dark">Confirm the quote, terms, payment and delivery requirements, and resolve any open service issues.</p>
      {issues.length ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowIssues(true)}>Mark complete</button> : <ActionButton action={() => markOrderComplete(orderId)} className="btn btn-primary btn-sm">Mark complete</ActionButton>}
    </>}
    {showIssues ? <ValidationDialog title="Complete these requirements first" issues={issues} onClose={() => setShowIssues(false)} onFix={() => { setShowIssues(false); if (issues[0]?.href) requestAnimationFrame(() => highlightSection(issues[0].href!)); }} /> : null}
  </div>;
}
