"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPoExpectedDate } from "@/lib/workflowActions";
import { PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";

export function PoExpectedDateField({ po }: { po: { id: string; poNumber: string | null; expectedDate: Date | string | null } }) {
  const initial = po.expectedDate ? new Date(po.expectedDate).toISOString().slice(0, 10) : "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function save() {
    setError(null);
    try {
      const result = await setPoExpectedDate(po.id, value);
      if (!result.ok) { setError(result.message); return; }
      toast({ kind: "success", message: "PO expected date saved" });
      router.refresh();
    } catch {
      setError("Could not save the expected date. Please try again.");
    }
  }

  return <form action={save} className="mt-2 flex flex-wrap items-end gap-2">
    <label className="block">
      <span className="field-label">Expected Date</span>
      <input type="date" aria-label={`Expected Date for ${po.poNumber ?? "purchase order"}`} value={value}
        onChange={event => setValue(event.target.value)} className="input-klyne px-2 py-1 text-xs" />
    </label>
    {value !== initial && <PendingButton className="btn btn-sm" pendingText="Saving…">Save date</PendingButton>}
    {error && <span role="alert" className="banner-alert w-full px-2 py-1 text-xs">{error}</span>}
  </form>;
}
