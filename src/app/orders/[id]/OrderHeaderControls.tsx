"use client";

import { ORDER_STATUSES, ORDER_URGENCIES, ORDER_STATUS_COLORS, URGENCY_COLORS, labelFor } from "@/lib/constants";
import { OptimisticSelect, PendingButton } from "@/lib/ui";
import { setOrderStatus, setOrderUrgency, updateOrderQbInvoice } from "../actions";

export function UrgencyStatusControls({
  orderId,
  urgency,
  status,
}: {
  orderId: string;
  urgency: string;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <OptimisticSelect
        value={urgency}
        options={ORDER_URGENCIES}
        action={(next) => setOrderUrgency(orderId, next)}
        className="input-klyne"
        render={(val, pending) => (
          <span className={`badge ${URGENCY_COLORS[val] ?? "badge-gray"} ${pending ? "opacity-60" : ""}`}>
            {labelFor(ORDER_URGENCIES, val)}
          </span>
        )}
      />
      <OptimisticSelect
        value={status}
        options={ORDER_STATUSES}
        action={(next) => setOrderStatus(orderId, next)}
        className="input-klyne"
        render={(val, pending) => (
          <span className={`badge ${ORDER_STATUS_COLORS[val] ?? "badge-gray"} ${pending ? "opacity-60" : ""}`}>
            {val.replace(/_/g, " ")}
          </span>
        )}
      />
    </div>
  );
}

export function QbInvoiceEdit({ orderId, value }: { orderId: string; value: string | null }) {
  async function handleSave(formData: FormData) {
    const next = String(formData.get("qbInvoice") ?? "");
    await updateOrderQbInvoice(orderId, next);
  }
  return (
    <form action={handleSave} className="flex items-center gap-1.5">
      <input name="qbInvoice" className="input-klyne w-36" placeholder="QB invoice #" defaultValue={value ?? ""} />
      <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
        Save
      </PendingButton>
    </form>
  );
}
