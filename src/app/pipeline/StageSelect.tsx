"use client";

import { OPPORTUNITY_STAGES, STAGE_COLORS } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { changeOpportunityStage } from "./actions";

/** The stage pill IS the dropdown — click it to move the deal. */
export function StageSelect({
  opportunityId,
  stage,
}: {
  opportunityId: string;
  stage: string;
}) {
  return (
    <BadgeSelect
      value={stage}
      options={OPPORTUNITY_STAGES}
      colorMap={STAGE_COLORS}
      action={async (next) => {
        await changeOpportunityStage(opportunityId, next);
      }}
    />
  );
}
