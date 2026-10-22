"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setSalesOrderSent } from "@/lib/workflowActions";
import { Spinner } from "@/lib/ui";

/** Sales order tracking inside Purchase, independent of PO availability. */
export function SalesOrderConfirmation({ orderId, sentAt }: { orderId: string; sentAt: Date | null }) {
  const [saved, setSaved] = useState(!!sentAt);
  const [sent, showSent] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>Sales order sent to customer</span>
      <div role="group" aria-label="Sales order sent to customer" aria-busy={pending} className="inline-flex rounded-lg border border-border bg-panel p-0.5">
        {[{ value: true, label: "Yes" }, { value: false, label: "No" }].map(option => <button
          key={option.label}
          type="button"
          aria-pressed={sent === option.value}
          disabled={pending}
          className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60 ${sent === option.value ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-gray-dark hover:text-ink"}`}
          onClick={() => {
            const next = option.value;
            if (next === sent) return;
            startTransition(async () => {
              showSent(next);
              setError(null);
              try {
                const result = await setSalesOrderSent(orderId, next);
                if (result.ok) setSaved(next);
                else setError(result.message);
              } catch { setError("Could not confirm the change. Reload to check the saved selection."); }
            });
          }}>{option.label}</button>)}
      </div>
    </div>
    {pending && <span role="status" className="flex items-center gap-2 text-xs text-gray-dark"><Spinner />Saving…</span>}
    {error && <p role="alert" className="banner-alert">{error}</p>}
  </div>;
}
