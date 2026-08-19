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
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Urgency
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
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
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Status
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
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
        className="w-36 rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder="QB invoice #"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      {dirty && (
        <button
          disabled={pending}
          className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700"
          onClick={() => startTransition(() => updateOrderQbInvoice(orderId, val))}
        >
          Save
        </button>
      )}
    </div>
  );
}
