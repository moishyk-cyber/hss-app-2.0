import { cache } from "react";
import { getActiveUsers } from "@/lib/users";
import { getSettings } from "@/lib/settings";
import { FLOW_STEPS, type Ball, type FlowStepKey } from "@/lib/ballInCourt";
import { stageAssignee, STAGE_ASSIGNEE_KEYS } from "./stageAssignments";

export type StageHolder = { userId: string | null; userName: string | null };
export type StageHolders = Record<FlowStepKey, StageHolder>;

export const getStageHolders = cache(async (): Promise<StageHolders> => {
  const [settings, users] = await Promise.all([
    getSettings(Object.values(STAGE_ASSIGNEE_KEYS)), getActiveUsers(),
  ]);
  return Object.fromEntries(FLOW_STEPS.map(({ key }) => {
    const user = stageAssignee(key, null, users, settings);
    return [key, { userId: user?.id ?? null, userName: user?.name ?? null }];
  })) as StageHolders;
});

export function holderLabel(step: FlowStepKey, holders: StageHolders): string {
  return holders[step].userName ?? "Unassigned";
}

export function withHolder(ball: Ball, holders: StageHolders): Ball {
  if (!ball.step) return ball;
  if (ball.step === "close") return ball;
  return { ...ball, holder: holderLabel(ball.step, holders) };
}

/** Use the configured person in the detail guide too; closing retains the deal's salesperson. */
export function withJourneyHolders<T extends { key: string; owner: string }>(steps: T[], holders: StageHolders): T[] {
  return steps.map(step => step.key === "close" || !(step.key in holders) ? step : { ...step, owner: holderLabel(step.key as FlowStepKey, holders) });
}
