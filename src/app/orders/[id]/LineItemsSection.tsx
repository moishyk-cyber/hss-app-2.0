"use client";

import { useTransition } from "react";
import { DELIVERY_STATUSES, labelFor } from "@/lib/constants";
import { setLineItemDeliveryStatus } from "../actions";
import { DELIVERY_STATUS_COLORS, fmtDate } from "../utils";

type Item = {
  id: string;
  name: string;
  qty: number;
  supplier: { name: string } | null;
  unitCost: number | null;
  deliveryStatus: string;
  dateOrdered: Date | null;
  dateArrivedHss: Date | null;
  dateArrivedClient: Date | null;
  trackingUrl: string | null;
};

export default function LineItemsSection({ items }: { items: Item[] }) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">
        No line items on this order.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <th className="py-1.5 pr-3 font-medium">Item</th>
            <th className="py-1.5 pr-3 font-medium">Qty</th>
            <th className="py-1.5 pr-3 font-medium">Supplier</th>
            <th className="py-1.5 pr-3 font-medium">Cost</th>
            <th className="py-1.5 pr-3 font-medium">Delivery Status</th>
            <th className="py-1.5 pr-3 font-medium">Ordered / Arrived</th>
            <th className="py-1.5 pr-3 font-medium">Tracking</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-gray-900">{item.name}</td>
              <td className="py-1.5 pr-3 text-gray-700">{item.qty}</td>
              <td className="py-1.5 pr-3 text-gray-700">{item.supplier?.name ?? "—"}</td>
              <td className="py-1.5 pr-3 text-gray-700">{item.unitCost != null ? `$${item.unitCost}` : "—"}</td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      DELIVERY_STATUS_COLORS[item.deliveryStatus] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {labelFor(DELIVERY_STATUSES, item.deliveryStatus)}
                  </span>
                  <select
                    className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                    defaultValue={item.deliveryStatus}
                    disabled={pending}
                    onChange={(e) => startTransition(() => setLineItemDeliveryStatus(item.id, e.target.value))}
                  >
                    {DELIVERY_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
              <td className="py-1.5 pr-3 text-xs text-gray-500">
                <div>Ordered: {fmtDate(item.dateOrdered)}</div>
                <div>HSS: {fmtDate(item.dateArrivedHss)}</div>
                <div>Client: {fmtDate(item.dateArrivedClient)}</div>
              </td>
              <td className="py-1.5 pr-3">
                {item.trackingUrl ? (
                  <a href={item.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    Track
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
