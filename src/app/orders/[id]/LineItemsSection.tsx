"use client";

import { DELIVERY_STATUSES, labelFor } from "@/lib/constants";
import { setLineItemDeliveryStatus } from "../actions";
import { DELIVERY_STATUS_COLORS, fmtDate } from "../utils";
import { OptimisticSelect } from "@/lib/ui";

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
  if (items.length === 0) {
    return <div className="empty-state">No line items on this order.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-klyne min-w-[820px]">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Supplier</th>
            <th>Cost</th>
            <th>Delivery Status</th>
            <th>Ordered / Arrived</th>
            <th>Tracking</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="transition-colors">
              <td className="font-medium text-ink">{item.name}</td>
              <td className="text-gray-dark">{item.qty}</td>
              <td className="text-gray-dark">{item.supplier?.name ?? "—"}</td>
              <td className="text-gray-dark">{item.unitCost != null ? `$${item.unitCost}` : "—"}</td>
              <td>
                <OptimisticSelect
                  value={item.deliveryStatus}
                  options={DELIVERY_STATUSES}
                  action={(next) => setLineItemDeliveryStatus(item.id, next)}
                  className="input-klyne px-1.5 py-0.5 text-xs"
                  render={(val, pending) => (
                    <span className={`badge ${DELIVERY_STATUS_COLORS[val] ?? "badge-gray"} ${pending ? "opacity-60" : ""}`}>
                      {labelFor(DELIVERY_STATUSES, val)}
                    </span>
                  )}
                />
              </td>
              <td className="text-xs text-gray">
                <div>Ordered: {fmtDate(item.dateOrdered)}</div>
                <div>HSS: {fmtDate(item.dateArrivedHss)}</div>
                <div>Client: {fmtDate(item.dateArrivedClient)}</div>
              </td>
              <td>
                {item.trackingUrl ? (
                  <a
                    href={item.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue transition-colors hover:underline"
                  >
                    Track
                  </a>
                ) : (
                  <span className="text-gray">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
