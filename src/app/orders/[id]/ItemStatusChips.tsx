"use client";

// "Where is everything?" in one line, under the order stepper. Every live line
// item lands in exactly one chip - being priced, not on a PO yet, or whatever
// delivery status it has reached - so the counts always add up to the item
// count. Clicking a chip opens a dialog with just those items, each with its
// PO, its delivery leg, and a delivery-status pill you can change right there
// (the drill-down Moishy asked for: "which 2 items are still in transit?").

import { useEffect, useMemo, useRef, useState } from "react";
import { DELIVERY_STATUSES, DELIVERY_MODES, DELIVERY_LEG_STATUSES, labelFor } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { setLineItemDeliveryStatus } from "../actions";
import { DELIVERY_STATUS_COLORS } from "../utils";

export type ChipItem = {
  id: string;
  name: string;
  qty: number;
  rfqStatus: string;
  deliveryStatus: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  deliveryMode: string | null;
  deliveryLegStatus: string | null;
};

type Group = { key: string; label: string; color: string; items: ChipItem[] };

/** RFQ statuses that mean "the office is still putting a price on it". */
const BEING_PRICED = new Set(["needs_pricing", "rfq_sent", "quote_received"]);

export function groupItems(items: ChipItem[]): Group[] {
  const live = items.filter((i) => i.rfqStatus !== "removed");
  const pricing = live.filter((i) => BEING_PRICED.has(i.rfqStatus));
  const rest = live.filter((i) => !BEING_PRICED.has(i.rfqStatus));
  const noPo = rest.filter((i) => !i.purchaseOrderId);
  const onPo = rest.filter((i) => i.purchaseOrderId);

  const groups: Group[] = [];
  if (pricing.length > 0) {
    groups.push({ key: "pricing", label: "Being priced", color: "badge-yellow", items: pricing });
  }
  if (noPo.length > 0) {
    groups.push({ key: "no_po", label: "Not on a PO", color: "badge-orange", items: noPo });
  }
  // One chip per delivery status actually present, in the vocabulary's own order.
  for (const status of DELIVERY_STATUSES) {
    const matching = onPo.filter((i) => i.deliveryStatus === status.value);
    if (matching.length === 0) continue;
    groups.push({
      key: `delivery:${status.value}`,
      label: status.label,
      color: DELIVERY_STATUS_COLORS[status.value] ?? "badge-gray",
      items: matching,
    });
  }
  return groups;
}

function ItemsDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-status-dialog-title"
        tabIndex={-1}
        className="card w-full max-w-2xl space-y-4 shadow-[var(--shadow-card-hover)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="item-status-dialog-title" className="text-base font-semibold text-ink">
            {group.label}
            <span className="ml-2 text-sm font-medium text-gray-dark">
              {group.items.length} item{group.items.length === 1 ? "" : "s"}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray transition-colors hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="overflow-x-auto border-t border-border pt-4">
          <table className="table-klyne">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>PO</th>
                <th>Delivery</th>
                <th>Item status</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium text-ink">{item.name}</td>
                  <td className="tabular-nums">{item.qty}</td>
                  <td>
                    {item.poNumber ? (
                      item.poNumber
                    ) : item.purchaseOrderId ? (
                      <span className="empty-value">no PO number</span>
                    ) : (
                      <span className="empty-value">not on a PO</span>
                    )}
                  </td>
                  <td>
                    {item.deliveryLegStatus ? (
                      <span className="text-[12.5px] text-gray-dark">
                        {item.deliveryMode ? `${labelFor(DELIVERY_MODES, item.deliveryMode)} · ` : ""}
                        {labelFor(DELIVERY_LEG_STATUSES, item.deliveryLegStatus)}
                      </span>
                    ) : (
                      <span className="empty-value">no delivery leg yet</span>
                    )}
                  </td>
                  <td>
                    <BadgeSelect
                      value={item.deliveryStatus}
                      options={DELIVERY_STATUSES}
                      action={(next) => setLineItemDeliveryStatus(item.id, next)}
                      colorMap={DELIVERY_STATUS_COLORS}
                      ariaLabel={`Delivery status for ${item.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemStatusChips({ items }: { items: ChipItem[] }) {
  const groups = useMemo(() => groupItems(items), [items]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = groups.find((g) => g.key === openKey) ?? null;

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => setOpenKey(g.key)}
          aria-haspopup="dialog"
          className={`badge cursor-pointer select-none ${g.color} transition-opacity hover:opacity-80`}
        >
          {g.items.length} {g.label.toLowerCase()}
        </button>
      ))}
      {open ? <ItemsDialog group={open} onClose={() => setOpenKey(null)} /> : null}
    </div>
  );
}
