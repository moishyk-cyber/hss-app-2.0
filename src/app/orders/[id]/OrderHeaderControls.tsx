"use client";

import { useState } from "react";
import { ORDER_STATUSES, ORDER_URGENCIES, ORDER_STATUS_COLORS, URGENCY_COLORS } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect, PendingButton } from "@/lib/ui";
import { setOrderOwner, setOrderStatus, setOrderUrgency, updateOrderQbInvoice } from "../actions";

export function UrgencyStatusControls({
  orderId,
  urgency,
  status,
  ownerId,
  users,
}: {
  orderId: string;
  urgency: string;
  status: string;
  ownerId: string | null;
  users: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Urgency
        </span>
        <BadgeSelect
          value={urgency}
          options={ORDER_URGENCIES}
          action={(next) => setOrderUrgency(orderId, next)}
          colorMap={URGENCY_COLORS}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Status
        </span>
        <BadgeSelect
          value={status}
          options={ORDER_STATUSES}
          action={(next) => setOrderStatus(orderId, next)}
          colorMap={ORDER_STATUS_COLORS}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Owner
        </span>
        <OptimisticSelect
          value={ownerId ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          action={(next) => setOrderOwner(orderId, next)}
        />
      </label>
    </div>
  );
}

export function QbInvoiceEdit({ orderId, value }: { orderId: string; value: string | null }) {
  const [error, setError] = useState<string | null>(null);

  async function handleSave(formData: FormData) {
    const next = String(formData.get("qbInvoice") ?? "");
    const result = await updateOrderQbInvoice(orderId, next);
    setError(result.ok ? null : result.message);
  }
  return (
    <form action={handleSave} className="flex items-center gap-1.5">
      <input name="qbInvoice" className="input-klyne w-36" placeholder="QB invoice #" defaultValue={value ?? ""} />
      <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
        Save
      </PendingButton>
      {error && <span role="alert" className="text-xs text-red">{error}</span>}
    </form>
  );
}
