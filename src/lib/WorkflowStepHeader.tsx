"use client";
import { useEffect, useRef } from "react";
import { useWorkflowSelection } from "./WorkflowSelection";
import { useWorkflowFormCompletion } from "./WorkflowFormContext";
import type { JourneyStep } from "./dealWorkflow";

/** A focused work form uses the same instructions and completion evidence as the detail page. */
export function WorkflowStepHeader({ title, step }: { title: string; step: JourneyStep }) {
  const selection = useWorkflowSelection();
  const finish = useWorkflowFormCompletion();
  const current = selection?.steps?.find(saved => saved.key === step.key) ?? step;
  const complete = ["complete", "not_required"].includes(current.state);
  const previous = useRef({ key: step.key, complete });
  useEffect(() => {
    const becameComplete = previous.current.key === step.key && !previous.current.complete && complete;
    previous.current = { key: step.key, complete };
    if (becameComplete) finish?.();
  }, [step.key, complete, finish]);
  return <header className="space-y-2 mb-5">
    <h1 className="text-lg font-semibold text-ink">{title}</h1>
    <p className="text-sm text-gray-dark">{current.description}</p>
    {complete && <p role="status" className="text-sm text-ink">This step is complete. Your changes have been saved.</p>}
  </header>;
}
