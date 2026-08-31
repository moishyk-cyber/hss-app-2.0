"use client";

import { STAGE_COLORS } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { changeOpportunityStage } from "./actions";
import { stageOptions } from "./_ui";

/**
 * The stage pill IS the dropdown - click it to move the deal.
 * Won/Lost are absent from the menu: closing a deal runs Mark Won / Mark Lost on
 * the detail page, which create the order and stage the payment.
 */
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
      options={stageOptions(stage)}
      colorMap={STAGE_COLORS}
      action={(next) => changeOpportunityStage(opportunityId, next)}
    />
  );
}
