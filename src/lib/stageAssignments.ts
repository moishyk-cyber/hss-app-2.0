import type { FlowStepKey } from "./ballInCourt";

export type AssignmentUser = { id: string; name?: string; active?: boolean };
export const STAGE_ASSIGNEE_KEYS = {
  sales: "court.sales.assigneeId", pricing: "court.pricing.assigneeId",
  clientQuote: "court.clientQuote.assigneeId", close: "court.close.assigneeId",
  deposit: "court.deposit.assigneeId", pos: "court.pos.assigneeId",
  delivery: "court.delivery.assigneeId", service: "court.service.assigneeId",
} as const satisfies Record<FlowStepKey, string>;

const DEFAULT_NAMES: Record<Exclude<FlowStepKey, "close">, string[]> = {
  sales: ["Herman Freund", "Herman"],
  pricing: ["Chaim Schwartz"], clientQuote: ["Chaim Schwartz"],
  deposit: ["Mrs Goldberger", "Mrs Golderberger"],
  pos: ["Chaim Schwartz"], delivery: ["Sam Freund", "Sam"], service: ["Chaim Schwartz"],
};

/** Exactly one active teammate. Never fan out to a whole role or silently substitute an inactive user. */
export function stageAssignee(step: FlowStepKey | null, salespersonId: string | null, users: readonly AssignmentUser[], settings: Record<string, string | null | undefined>): AssignmentUser | null {
  if (!step) return null;
  const configured = settings[STAGE_ASSIGNEE_KEYS[step]];
  if (step === "close") {
    // Closing is always a per-deal assignment; the intake creator is its initial salesperson.
    return users.find(user => user.active !== false && user.id === salespersonId) ?? null;
  }
  if (configured) return users.find(user => user.active !== false && user.id === configured) ?? null;
  for (const name of DEFAULT_NAMES[step]) {
    const matches = users.filter(user => user.active !== false && user.name?.trim().toLowerCase() === name.toLowerCase());
    if (matches.length === 1) return matches[0];
  }
  return null;
}
