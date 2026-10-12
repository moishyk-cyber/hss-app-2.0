"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPoAutoQuotesNumber } from "@/lib/workflowActions";
import { PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";

/** Inline edit for the AutoQuotes PO # - same 40-char validation as create. */
export function AutoQuotesField({ po }: { po: { id: string; autoQuotesPoNumber: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function handleSave(formData: FormData) {
    const value = String(formData.get("autoQuotesPoNumber") ?? "");
    if (value.trim().length > 40) {
      setError("AutoQuotes PO # is too long (max 40 characters).");
      return;
    }
    const result = await setPoAutoQuotesNumber(po.id, value);
    if (result.ok) {
      setError(null);
      setEditing(false);
      router.refresh();
      toast({ kind: "success", message: "AutoQuotes PO # saved" });
    } else {
      setError(result.message);
    }
  }

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-gray-dark">
        AQ#: {po.autoQuotesPoNumber || <span className="empty-value">not set</span>}
        <button
          type="button"
          className="text-gray transition-colors hover:text-ink hover:underline"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <form action={handleSave} className="flex flex-wrap items-center gap-2">
      <input
        aria-label="AutoQuotes PO number"
        name="autoQuotesPoNumber"
        maxLength={40}
        defaultValue={po.autoQuotesPoNumber ?? ""}
        placeholder="AutoQuotes PO #"
        autoFocus
        className="input-klyne w-40 px-2 py-1 text-xs"
      />
      <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="Saving…">
        Save
      </PendingButton>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <span role="alert" className="banner-alert px-2 py-1 text-xs">{error}</span>}
    </form>
  );
}

