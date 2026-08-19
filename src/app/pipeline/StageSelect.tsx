"use client";

import { useTransition } from "react";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { changeOpportunityStage } from "./actions";

export function StageSelect({
  opportunityId,
  stage,
}: {
  opportunityId: string;
  stage: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Change stage"
      value={stage}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await changeOpportunityStage(opportunityId, next);
        });
      }}
      className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 disabled:opacity-50"
    >
      {OPPORTUNITY_STAGES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
