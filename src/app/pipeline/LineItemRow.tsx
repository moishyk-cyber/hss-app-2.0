"use client";

import { useState, useTransition } from "react";
import { RFQ_STATUSES, RFQ_STATUS_COLORS } from "@/lib/constants";
import { BadgeSelect, Spinner } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import type { ActionResult } from "@/lib/actionResult";
import {
  updateLineItemAssignee,
  updateLineItemQty,
  updateLineItemRfqStatus,
} from "./actions";
import { LeadTimeCell, StockStatusCell } from "../rfq/StockCells";

export type EditableLineItem = {
  id: string;
  name: string;
  description: string | null;
  qty: number;
  unitCost: number | null;
  unitPrice: number | null;
  leadTimeDate: Date | null;
  rfqStatus: string;
  stockStatus: string;
  backorderExpected: Date | null;
  assigneeId: string | null;
};

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
  onSave: (raw: string) => Promise<ActionResult | void>;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (value === initial) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await onSave(value);
        if (result && result.ok === false) {
          setError(result.message);
          setValue(initial);
        }
      } catch {
        setError("Something went wrong. Please try again.");
        setValue(initial);
      }
    });
  }

  return (
    <span className="relative inline-flex items-center gap-1">
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
      {error && (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-56 px-2 py-1 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}

export function LineItemRow({
  item,
  users,
}: {
  item: EditableLineItem;
  users: { id: string; name: string }[];
}) {
  return (
    <tr>
      <td>
        <div className="font-semibold text-ink">{item.name}</div>
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
          onSave={(raw) => updateLineItemQty(item.id, Number.parseInt(raw, 10))}
        />
      </td>

      {/* Cost and Price deliberately absent - pricing is edited in the RFQ queue. */}

      {/* Lead time and stock edit here as well as in the RFQ queue - same controls, same saves. */}
      <td>
        <LeadTimeCell item={item} />
      </td>

      <td>
        <UserSelect
          value={item.assigneeId ?? ""}
          users={users}
          action={(next) => updateLineItemAssignee(item.id, next)}
        />
      </td>

      <td>
        <BadgeSelect
          value={item.rfqStatus}
          options={RFQ_STATUSES}
          colorMap={RFQ_STATUS_COLORS}
          action={(next) => updateLineItemRfqStatus(item.id, next)}
        />
      </td>

      <td>
        <StockStatusCell item={item} />
      </td>
    </tr>
  );
}
