"use client";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import type { RfqStatusSource, RfqWorkflowSnapshot } from "./rfqStatusEndpoint";
const uncertainItems = new Set<string>();
let refreshTimer: number | undefined;
export function useRfqStatusAction(source: RfqStatusSource = "rfq") {
  const router = useRouter();
  return async (id: string, rfqStatus: string) => {
    if (uncertainItems.has(id)) return { ok: false as const, message: "Reload to check the saved status before making another change." };
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/line-items/${id}/rfq-status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfqStatus, source }), signal: controller.signal });
      const result = await response.json();
      if (!result.ok) {
        if (response.status >= 500) uncertainItems.add(id);
        return { ok: false as const, message: result.message || "Could not save the RFQ status." };
      }
      const workflow = result.workflow as RfqWorkflowSnapshot | null;
      const root = workflow ? Array.from(document.querySelectorAll<HTMLElement>("[data-workflow-opportunity]")).find(node => node.dataset.workflowOpportunity === workflow.opportunityId && !node.closest("[inert]") && node.querySelector(".pipeline-detail")?.getClientRects().length) : null;
      if (root && workflow) root.dispatchEvent(new CustomEvent("workflow:deal-saved", { bubbles: true, detail: workflow }));
      else {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => startTransition(() => router.refresh()), 150);
      }
      return { ok: true as const, skipRefresh: true };
    } catch {
      uncertainItems.add(id);
      return { ok: false as const, message: "Could not confirm the save. Reload to check the saved status before trying again." };
    } finally { window.clearTimeout(deadline); }
  };
}
