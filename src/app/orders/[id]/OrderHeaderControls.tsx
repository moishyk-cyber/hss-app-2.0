"use client";

import { useState, useTransition } from "react";
import { ORDER_STATUSES, ORDER_URGENCIES } from "@/lib/constants";
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
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label>
        <span className="field-label">Urgency</span>
        <select
          className="input-klyne"
          defaultValue={urgency}
          disabled={pending}
          onChange={(e) => startTransition(() => setOrderUrgency(orderId, e.target.value))}
        >
          {ORDER_URGENCIES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="field-label">Status</span>
        <select
          className="input-klyne"
          defaultValue={status}
          disabled={pending}
          onChange={(e) => startTransition(() => setOrderStatus(orderId, e.target.value))}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function QbInvoiceEdit({ orderId, value }: { orderId: string; value: string | null }) {
  const [val, setVal] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = val !== (value ?? "");
  return (
    <div className="flex items-center gap-1.5">
      <input
        className="input-klyne w-36"
        placeholder="QB invoice #"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      {dirty && (
        <button
          disabled={pending}
          className="btn btn-primary btn-sm"
          onClick={() => startTransition(() => updateOrderQbInvoice(orderId, val))}
        >
          Save
        </button>
      )}
    </div>
  );
}
