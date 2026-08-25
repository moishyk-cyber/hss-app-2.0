"use client";

import { OPPORTUNITY_STAGES, STAGE_COLORS, labelFor } from "@/lib/constants";
import { OptimisticSelect } from "@/lib/ui";
import { changeOpportunityStage } from "./actions";

export function StageSelect({
  opportunityId,
  stage,
}: {
  opportunityId: string;
  stage: string;
}) {
  return (
    // OptimisticSelect renders an inline-flex span — stretch it across the card.
    <div className="[&>span]:flex [&>span]:w-full">
      <OptimisticSelect
        value={stage}
        options={OPPORTUNITY_STAGES}
        className="input-klyne min-w-0 flex-1 bg-panel px-2 py-1 text-xs"
        action={async (next) => {
          await changeOpportunityStage(opportunityId, next);
        }}
        render={(optimisticStage) => (
          <span className={`badge shrink-0 ${STAGE_COLORS[optimisticStage] ?? "badge-gray"}`}>
            {labelFor(OPPORTUNITY_STAGES, optimisticStage)}
          </span>
        )}
      />
    </div>
  );
}
