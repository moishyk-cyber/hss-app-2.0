import { FLOW_STEPS, opportunityBall, type FlowStepKey, type OrderBallInput } from "./ballInCourt";
import { dealJourney, intakeIssues, type DealFacts, type DealRequirements, type ValidationIssue } from "./dealWorkflow";

export const PIPELINE_WORKFLOW_OPTIONS = [
  ...FLOW_STEPS.map(step => ({ value: step.key as string, label: step.label as string })),
  { value: "complete", label: "Complete" },
  { value: "lost", label: "Lost" },
];
export const WORKFLOW_COLORS: Record<string, string> = {
  sales: "badge-gray", pricing: "badge-yellow", clientQuote: "badge-blue", close: "badge-blue",
  deposit: "badge-orange", pos: "badge-yellow", delivery: "badge-blue", service: "badge-green",
  complete: "badge-green", lost: "badge-red",
};
export type PipelineOrder = OrderBallInput & { id: string };

/** The board follows saved work; choosing a lane never invents quotes, money or deliveries. */
export function pipelineWorkflowStep(deal: DealFacts, required: DealRequirements, order?: PipelineOrder | null): FlowStepKey | "complete" | "lost" {
  if (deal.stage === "lost") return "lost";
  if (order?.status === "complete") return "complete";
  const journey = dealJourney(deal, required, order);
  // Confirmed orders have already passed sales, including historical/direct orders.
  const pending = journey.find((step, index) => !(order && index < 4) && !["complete", "not_required", "stopped"].includes(step.state));
  return pending?.key as FlowStepKey ?? "service";
}

export function pipelineWorkflowHref(id: string, step: string): string {
  const anchor: Record<string, string> = { sales: "deal-intake", pricing: "line-items", clientQuote: "client-quote", close: "close", deposit: "payments", pos: "purchase-orders", delivery: "delivery", service: "service" };
  return `/records/${id}#${anchor[step] ?? "deal-intake"}`;
}

/** Direct board moves only advance; saved prerequisite changes can still move cards back. */
export function canAdvancePipelineCard(current: string, target: string): boolean {
  const from = FLOW_STEPS.findIndex(step => step.key === current);
  const to = FLOW_STEPS.findIndex(step => step.key === target);
  return from >= 0 && to > from;
}

export type PipelineMoveResult = { ok: true; step: string } | { ok: false; title: string; message: string; issues: ValidationIssue[]; href: string };
export function validatePipelineWorkflowMove(deal: DealFacts, required: DealRequirements, order: PipelineOrder | null, target: FlowStepKey): PipelineMoveResult {
  const current = pipelineWorkflowStep(deal, required, order);
  if (current === target) return { ok: true, step: current };
  const targetIndex = FLOW_STEPS.findIndex(step => step.key === target);
  const currentIndex = FLOW_STEPS.findIndex(step => step.key === current);
  const href = pipelineWorkflowHref(deal.id, current);
  if (["complete", "lost"].includes(current)) return { ok: false, title: "This record is closed", message: "Reopen the record from its detail page before changing its workflow.", issues: [], href };
  if (targetIndex < currentIndex) return {
    ok: false, title: "Cards cannot move backwards", message: "Change the underlying record to reopen an earlier step. The board will update automatically.",
    issues: [], href,
  };
  const journey = dealJourney(deal, required, order);
  const issues = journey.slice(0, targetIndex).flatMap((step, index) => {
    if ((order && index < 4) || ["complete", "not_required"].includes(step.state)) return [];
    return [{ field: step.key, message: `${step.label}: ${step.completion}`, href: pipelineWorkflowHref(deal.id, step.key) }];
  });
  return { ok: false, title: `Before moving to ${FLOW_STEPS[targetIndex].label}`, message: "Nothing has changed. Complete the required work on the record; the card will advance automatically.", issues, href: issues[0]?.href ?? href };
}

/** A current action badge uses the same evidence as the detail workflow. */
export function pipelineWorkflowBall(deal: DealFacts, required: DealRequirements, order: PipelineOrder | null) {
  const step = pipelineWorkflowStep(deal, required, order);
  const original = opportunityBall({ ...deal, intakeComplete: intakeIssues(deal, required).length === 0, order });
  const entry = FLOW_STEPS.find(candidate => candidate.key === step);
  return entry ? { ...original, step: entry.key, court: entry.court, hint: original.step === entry.key ? original.hint : `Review ${entry.label}` } : original;
}

/** Only a named workflow step can select a focused form; other query values use the full record. */
export function readWorkflowStep(value: unknown): FlowStepKey | null {
  return typeof value === "string" && FLOW_STEPS.some(step => step.key === value) ? value as FlowStepKey : null;
}
export function pipelineWorkflowFormHref(href: string, step: string): string {
  const selected = readWorkflowStep(step);
  if (!selected) return href;
  const url = new URL(href, "http://workflow.local");
  url.searchParams.set("workflow", selected);
  return `${url.pathname}${url.search}${url.hash}`;
}

export type PipelineCardStep = { key: string; label: string; state: import("./dealWorkflow").JourneyState };
/** Compact evidence only: cards never receive the large per-item requirement lists. */
export function pipelineCardProgress(deal: DealFacts, required: DealRequirements, order?: PipelineOrder | null): PipelineCardStep[] {
  return dealJourney(deal, required, order).map(step => ({ key: step.key, label: step.label,
    state: order && ["sales", "pricing", "close"].includes(step.key) ? "complete" : step.state }));
}

export const INTAKE_WORKFLOW_STEPS = FLOW_STEPS.slice(0, 5);
export function isIntakeWorkflowStep(step: string) {
  return INTAKE_WORKFLOW_STEPS.some(entry => entry.key === step);
}
