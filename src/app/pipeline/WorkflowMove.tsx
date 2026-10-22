"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RecordDrawer } from "@/lib/RecordDrawer";
import { RequirementsSpinner } from "@/lib/WorkflowRequirementsLoading";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { BadgeSelect } from "@/lib/ui";
import { INTAKE_WORKFLOW_STEPS, PIPELINE_WORKFLOW_OPTIONS, WORKFLOW_COLORS, canAdvancePipelineCard, pipelineWorkflowFormHref, type PipelineMoveResult } from "@/lib/pipelineWorkflow";
import { checkPipelineWorkflowMove } from "./actions";

export function usePipelineWorkflowMove() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<Extract<PipelineMoveResult, { ok: false }> | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const active = useRef<number | null>(null);
  const expectedPath = useRef<string | null>(null);
  const returnHref = useRef("");
  function cancelLoading() {
    active.current = null;
    const navigating = expectedPath.current !== null;
    expectedPath.current = null;
    setLoading(false);
    if (navigating) router.replace(returnHref.current, { scroll: false });
  }
  useEffect(() => {
    function formOpened(event: Event) {
      if ((event as CustomEvent<{ pathname: string }>).detail.pathname !== expectedPath.current) return;
      active.current = null;
      expectedPath.current = null;
      setLoading(false);
    }
    window.addEventListener("workflow:form-open", formOpened);
    return () => { active.current = null; window.removeEventListener("workflow:form-open", formOpened); };
  }, []);
  async function move(id: string, next: string) {
    if (active.current !== null) return { ok: false as const, message: "Requirements are already loading." };
    const request = ++sequence.current;
    active.current = request;
    returnHref.current = window.location.pathname + window.location.search;
    // Moves run inside a transition; the modal shell must commit before any network wait.
    flushSync(() => { setBlocked(null); setLoading(true); });
    try {
      const result = await checkPipelineWorkflowMove(id, next);
      if (active.current !== request) return { ok: false as const, message: "Move cancelled." };
      if (!result.ok) {
        const firstMissingStep = result.issues[0]?.field;
        if (firstMissingStep) {
          const href = pipelineWorkflowFormHref(result.href, firstMissingStep ?? next);
          expectedPath.current = new URL(href, window.location.origin).pathname;
          router.push(href, { scroll: false });
        } else {
          active.current = null;
          setLoading(false);
          setBlocked(result);
        }
        return { ok: false as const, message: result.message };
      }
      active.current = null;
      setLoading(false);
      router.refresh();
      return { ok: true as const, skipRefresh: true };
    } catch {
      const message = "The card has not moved. Please try again.";
      if (active.current === request) {
        active.current = null;
        setLoading(false);
        setBlocked({ ok: false, title: "Could not check this move", message, issues: [], href: `/pipeline/${id}` });
      }
      return { ok: false as const, message };
    }
  }
  const dialog = <>{loading && <RecordDrawer loadingRequirements onDismiss={cancelLoading}><RequirementsSpinner /></RecordDrawer>}<ConfirmDialog open={!!blocked} title={blocked?.title ?? "Before moving this card"} confirmLabel="Open record" cancelLabel="Stay on board" onClose={() => setBlocked(null)} onConfirm={() => {
    if (blocked) router.push(blocked.href);
    setBlocked(null);
  }}>
    <p>{blocked?.message}</p>
    {!!blocked?.issues.length && <ul className="mt-3 space-y-2" aria-label="Missing requirements">{blocked.issues.map(issue => <li key={issue.field}>{issue.message}</li>)}</ul>}
  </ConfirmDialog></>;
  return { move, dialog };
}

export function WorkflowMoveSelect({ id, title, step, action }: { id: string; title: string; step: string; action?: (next: string) => Promise<import("@/lib/actionResult").ActionResult> }) {
  const own = usePipelineWorkflowMove();
  const options = INTAKE_WORKFLOW_STEPS.filter(entry => entry.key === step || canAdvancePipelineCard(step, entry.key)).map(entry => ({ value: entry.key as string, label: entry.label as string }));
  if (["complete", "lost"].includes(step)) options.push(PIPELINE_WORKFLOW_OPTIONS.find(entry => entry.value === step)!);
  return <><BadgeSelect showError={false} value={step} options={options} colorMap={WORKFLOW_COLORS} ariaLabel={`Change next step for ${title}`} action={async next => {
    if (next === step) return { ok: true };
    return action ? action(next) : own.move(id, next);
  }} />{!action && own.dialog}</>;
}
