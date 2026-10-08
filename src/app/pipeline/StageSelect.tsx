"use client";

import { OPPORTUNITY_STAGES, STAGE_COLORS, labelFor } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { changeOpportunityStage } from "./actions";
import { stageOptions } from "./_ui";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ValidationDialog } from "@/lib/ValidationDialog";
import type { ValidationIssue } from "@/lib/dealWorkflow";

/**
 * The stage pill IS the dropdown - click it to move the deal.
 * Won/Lost are absent from the menu: closing a deal runs Mark Won / Mark Lost on
 * the detail page, which create the order and stage the payment.
 *
 * A move announces itself with an Undo toast (Sep 2 QA: stage moves were
 * instant writes with no confirmation and no way back).
 */
export function StageSelect({
  opportunityId,
  stage,
}: {
  opportunityId: string;
  stage: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  return (
    <><BadgeSelect
      value={stage}
      options={stageOptions(stage)}
      colorMap={STAGE_COLORS}
      ariaLabel={`Deal stage: ${labelFor(OPPORTUNITY_STAGES, stage)}`}
      action={async (next) => {
        const previous = stage;
        const result = await changeOpportunityStage(opportunityId, next);
        if (result.ok === false) setIssues(result.issues ?? [{ field: "stage", message: result.message, href: `/pipeline/${opportunityId}` }]);
        if (!result || result.ok !== false) {
          toast({
            kind: "success",
            message: `Moved to ${labelFor(OPPORTUNITY_STAGES, next)}`,
            actionLabel: "Undo",
            onAction: () => changeOpportunityStage(opportunityId, previous),
          });
        }
        return result;
      }}
    /><ValidationDialog issues={issues} title="Before changing this deal’s stage" onClose={() => setIssues([])} onFix={() => {
      const target = issues[0]?.href ?? `/pipeline/${opportunityId}`;
      setIssues([]);
      router.push(target.startsWith("#") ? `/pipeline/${opportunityId}${target}` : target);
    }} /></>
  );
}
