"use client";

import { useState, useTransition } from "react";
import { DELIVERY_STATUSES, RFQ_STATUSES, RFQ_STATUS_COLORS, labelFor } from "@/lib/constants";
import { BadgeSelect, Spinner } from "@/lib/ui";
import {
  updateLineItemPricing,
  updateLineItemQty,
  updateLineItemRfqStatus,
} from "./actions";

export type EditableLineItem = {
  id: string;
  name: string;
  description: string | null;
  qty: number;
  unitCost: number | null;
  unitPrice: number | null;
  rfqStatus: string;
  deliveryStatus: string;
};

function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Small inline field that saves on blur (or Enter) and shows a spinner while it does. */
function InlineNumber({
  label,
  initial,
  width = "w-20",
  min,
  onSave,
}: {
  label: string;
  initial: string;
  width?: string;
  min?: string;
  onSave: (raw: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function commit() {
    if (value === initial) return;
    startTransition(async () => {
      await onSave(value);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        aria-label={label}
        type="number"
        min={min}
        step="any"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={`input-klyne ${width} px-2 py-1 text-xs disabled:opacity-60`}
      />
      {pending ? <Spinner className="text-gray" /> : null}
    </span>
  );
}

export function LineItemRow({ item }: { item: EditableLineItem }) {
  return (
    <tr>
      <td>
        <div className="font-medium text-ink">{item.name}</div>
        {item.description ? (
          <div className="text-xs text-gray">{item.description}</div>
        ) : null}
      </td>

      <td>
        <InlineNumber
          label={`Quantity for ${item.name}`}
          initial={String(item.qty)}
          width="w-14"
          min="1"
          onSave={async (raw) => {
            await updateLineItemQty(item.id, Number.parseInt(raw, 10));
          }}
        />
      </td>

      <td>
        <InlineNumber
          label={`Cost for ${item.name}`}
          initial={item.unitCost == null ? "" : String(item.unitCost)}
          onSave={async (raw) => {
            await updateLineItemPricing(item.id, toNumberOrNull(raw), item.unitPrice);
          }}
        />
      </td>

      <td>
        <InlineNumber
          label={`Price for ${item.name}`}
          initial={item.unitPrice == null ? "" : String(item.unitPrice)}
          onSave={async (raw) => {
            await updateLineItemPricing(item.id, item.unitCost, toNumberOrNull(raw));
          }}
        />
      </td>

      <td>
        <BadgeSelect
          value={item.rfqStatus}
          options={RFQ_STATUSES}
          colorMap={RFQ_STATUS_COLORS}
          action={async (next) => {
            await updateLineItemRfqStatus(item.id, next);
          }}
        />
      </td>

      <td className="text-xs text-gray-dark">
        {labelFor(DELIVERY_STATUSES, item.deliveryStatus)}
      </td>
    </tr>
  );
}
