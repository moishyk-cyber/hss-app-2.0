"use client";

import { useState } from "react";
import { DELIVERY_STATUSES } from "@/lib/constants";
import {
  addOrderLineItem,
  setLineItemAssignee,
  setLineItemBackorderExpected,
  setLineItemDeliveryStatus,
} from "../actions";
import { DELIVERY_STATUS_COLORS, fmtDate } from "../utils";
import { BadgeSelect, OptimisticSelect, PendingButton } from "@/lib/ui";

type Item = {
  id: string;
  name: string;
  qty: number;
  unitCost: number | null;
  deliveryStatus: string;
  backorderExpected: Date | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
  dateOrdered: Date | null;
  dateArrivedHss: Date | null;
  dateArrivedClient: Date | null;
  trackingUrl: string | null;
};

export default function LineItemsSection({
  orderId,
  items,
  users,
}: {
  orderId: string;
  items: Item[];
  users: { id: string; name: string }[];
}) {
  if (items.length === 0) {
    return (
      <div>
        <div className="empty-state">
          No line items on this order yet - add the first one below. New items land in the
          RFQ queue for pricing.
        </div>
        <AddOrderItemForm orderId={orderId} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-klyne min-w-[900px]">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Cost</th>
            <th>Assignee</th>
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
              <td className="text-gray-dark">
                {item.unitCost != null ? `$${item.unitCost}` : <span className="text-gray/60">–</span>}
              </td>
              <td>
                <OptimisticSelect
                  value={item.assigneeId ?? ""}
                  options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                  action={(next) => setLineItemAssignee(item.id, next)}
                  className="input-klyne px-1.5 py-1 text-xs"
                />
              </td>
              <td>
                <DeliveryStatusCell item={item} />
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
                  <span className="empty-value">not tracked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddOrderItemForm orderId={orderId} />
    </div>
  );
}

/** Inline add-item row - mirrors the pipeline detail page's affordance. */
function AddOrderItemForm({ orderId }: { orderId: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const qty = Number(formData.get("qty") ?? 1);
    const description = String(formData.get("description") ?? "");
    const result = await addOrderLineItem(orderId, name, qty, description);
    setError(result.ok ? null : result.message);
  }

  return (
    <form action={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="name"
        placeholder="Add an item…"
        className="input-klyne min-w-[220px] flex-1 px-2 py-1.5 text-sm"
        aria-label="New item name"
      />
      <input
        type="number"
        name="qty"
        min={1}
        defaultValue={1}
        className="input-klyne w-16 px-2 py-1.5 text-sm"
        aria-label="Quantity"
      />
      <input
        type="text"
        name="description"
        placeholder="Details (optional)"
        className="input-klyne min-w-[160px] px-2 py-1.5 text-sm"
        aria-label="Item details"
      />
      <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="Adding…">
        + Add item
      </PendingButton>
      {error && (
        <span role="alert" className="text-xs text-red">
          {error}
        </span>
      )}
    </form>
  );
}

/**
 * Delivery status pill for one line item. Tracks the selected status locally
 * (seeded optimistically alongside BadgeSelect's own internal state) so the
 * backorder-expected date input can appear/disappear immediately on change,
 * without waiting on the server revalidation round trip.
 */
function DeliveryStatusCell({ item }: { item: Item }) {
  const [status, setStatus] = useState(item.deliveryStatus);

  return (
    <div className="flex flex-col items-start gap-1">
      <BadgeSelect
        value={status}
        options={DELIVERY_STATUSES}
        action={async (next) => {
          setStatus(next);
          return setLineItemDeliveryStatus(item.id, next);
        }}
        colorMap={DELIVERY_STATUS_COLORS}
      />
      {status === "backordered" && (
        <BackorderExpectedInput lineItemId={item.id} value={item.backorderExpected} />
      )}
    </div>
  );
}

function BackorderExpectedInput({ lineItemId, value }: { lineItemId: string; value: Date | null }) {
  const defaultValue = value ? new Date(value).toISOString().slice(0, 10) : "";
  const [error, setError] = useState<string | null>(null);

  async function handleSave(formData: FormData) {
    const next = String(formData.get("backorderExpected") ?? "");
    const result = await setLineItemBackorderExpected(lineItemId, next);
    setError(result.ok ? null : result.message);
  }

  return (
    <form action={handleSave} className="flex items-center gap-1">
      <input
        type="date"
        name="backorderExpected"
        className="input-klyne px-1.5 py-0.5 text-xs"
        defaultValue={defaultValue}
        aria-label="Backorder expected date"
      />
      <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="…">
        Save
      </PendingButton>
      {error && <span role="alert" className="text-xs text-red">{error}</span>}
    </form>
  );
}
