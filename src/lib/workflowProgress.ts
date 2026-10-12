import type { JourneyStep } from "./dealWorkflow";
const resolved = (step: JourneyStep) => ["complete", "not_required", "stopped"].includes(step.state);
/** Advance only when the step being worked on becomes resolved. */
export function nextCompletedStep(previous: JourneyStep[], current: JourneyStep[], selected: string): string | null {
  const before = previous.find(step => step.key === selected);
  const after = current.find(step => step.key === selected);
  if (!before || resolved(before) || (after && !resolved(after))) return null;
  const position = previous.findIndex(step => step.key === selected);
  return current.find(step => previous.findIndex(old => old.key === step.key) > position && !resolved(step))?.key ?? current.find(step => !resolved(step))?.key ?? after?.key ?? null;
}
