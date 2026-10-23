"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/toast";
import type { FlowStepKey } from "@/lib/ballInCourt";
import { setStageHolder } from "./actions";

export function CourtHolderRow({ step, stepLabel, userId, users }: {
  step: FlowStepKey; stepLabel: string; userId: string; users: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState(userId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  function save(next: string) {
    const previous = selected;
    setSelected(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setStageHolder(step, next);
        if (result && !result.ok) throw new Error(result.message);
        toast({ kind: "success", message: `${stepLabel} assignee updated` });
        router.refresh();
      } catch (cause) {
        setSelected(previous);
        setError(cause instanceof Error ? cause.message : "Could not save. Please try again.");
      }
    });
  }
  return <li className="px-4 py-3" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor={`assignee-${step}`} className="text-[13.5px] font-medium text-ink">{stepLabel}</label>
      <div className="flex items-center gap-2">
        {pending && <span role="status" className="text-xs text-gray-dark">Saving…</span>}
        <select id={`assignee-${step}`} value={selected} disabled={pending} onChange={event => save(event.target.value)} className="input-klyne w-auto max-w-full py-1 text-[13px]">
          {!users.some(user => user.id === selected) && <option value="" disabled>Select an active teammate</option>}
          {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </div>
    </div>
    {step === "pricing" && <p className="mt-2 text-xs text-gray-dark">Also the default for new RFQ items. Existing item assignments are preserved.</p>}
    {error && <p role="alert" className="banner-alert mt-2 px-2.5 py-1.5 text-xs">{error}</p>}
  </li>;
}
