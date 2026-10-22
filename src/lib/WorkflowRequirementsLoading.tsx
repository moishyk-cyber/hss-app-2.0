"use client";
import { useSearchParams } from "next/navigation";
import { Spinner } from "./ui";
import { DetailLoading } from "./PageLoading";
import { readWorkflowStep } from "./pipelineWorkflow";
export function RequirementsSpinner() {
  return <div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-dark"><Spinner /><span>Loading requirements…</span></div>;
}
export function WorkflowRequirementsLoading() {
  const params = useSearchParams();
  return readWorkflowStep(params.get("workflow")) ? <RequirementsSpinner /> : <DetailLoading />;
}
