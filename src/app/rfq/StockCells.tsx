"use client";

import { useState, useTransition } from "react";
import { STOCK_STATUSES, STOCK_STATUS_COLORS, labelFor } from "@/lib/constants";
import { PendingButton, BadgeSelect, Spinner } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtDateUTC } from "@/lib/dates";
import {
  setLineItemBackorderExpected,
  setLineItemLeadTime,
  setLineItemStockStatus,
} from "./actions";

/**
 * Lead-time and stock controls for one line item. Shared by the RFQ queue and
 * the deal page's line-item table so both edit the same fields the same way.
 */
export type StockItem = {
  id: string;
  name: string;
  leadTimeDate: Date | null;
  stockStatus: string;
  backorderExpected: Date | null;
};

/**
 * The date the item is called for, saved as soon as a whole date is picked (no
 * separate button - matches the inline pattern on the deal page). Emptying the
 * field clears the date.
 */
export function LeadTimeCell({ item }: { item: StockItem }) {
  const { toast } = useToast();
  const initial = item.leadTimeDate ? new Date(item.leadTimeDate).toISOString().slice(0, 10) : "";
  const [value, setValue] = useState(initial);
  // What the server last accepted - a failed save rolls the input back to it.
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(next: string) {
    if (next === saved) return;
    startTransition(async () => {
      setError(null);
      const result = await setLineItemLeadTime(item.id, next || null);
      if (!result.ok) {
        setError(result.message);
        setValue(saved);
        return;
      }
      setSaved(next);
      toast({
        kind: next ? "success" : "info",
        message: next
          ? `Lead time set to ${fmtDateUTC(`${next}T00:00:00.000Z`)} on "${item.name}"`
          : `Lead time cleared on "${item.name}"`,
      });
    });
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <input
        type="date"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          // A date input reads "" while a date is half-typed, so only a whole
          // date saves here - emptying the field is committed on blur instead.
          if (e.target.value) commit(e.target.value);
        }}
        onBlur={() => commit(value)}
        className="input-klyne w-36 px-1.5 py-1 text-xs disabled:opacity-60"
        aria-label={`Lead time date for ${item.name}`}
      />
      {pending ? <Spinner className="text-gray" /> : null}
      {error ? (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-56 px-2 py-1 text-xs">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Stock status pill for one line item, mirroring the order-side delivery
 * status/backorder-date pattern (orders/[id]/LineItemsSection.tsx). Tracks
 * the selected status locally so the expected-date input can appear right
 * away, without waiting on the server revalidation round trip.
 */
export function StockStatusCell({ item }: { item: StockItem }) {
  const [status, setStatus] = useState(item.stockStatus);

  return (
    <div className="flex flex-col items-start gap-1">
      <BadgeSelect
        value={status}
        options={STOCK_STATUSES}
        colorMap={STOCK_STATUS_COLORS}
        action={async (next) => {
          setStatus(next);
          return setLineItemStockStatus(item.id, next);
        }}
        ariaLabel={`Stock status for ${item.name}: ${labelFor(STOCK_STATUSES, item.stockStatus)}`}
      />
      {status === "backordered" && (
        <BackorderExpectedInput itemId={item.id} itemName={item.name} value={item.backorderExpected} />
      )}
    </div>
  );
}

function BackorderExpectedInput({
  itemId,
  itemName,
  value,
}: {
  itemId: string;
  itemName: string;
  value: Date | null;
}) {
  const defaultValue = value ? new Date(value).toISOString().slice(0, 10) : "";
  const [error, setError] = useState<string | null>(null);

  async function handleSave(formData: FormData) {
    const next = String(formData.get("backorderExpected") ?? "");
    const result = await setLineItemBackorderExpected(itemId, next);
    setError(result.ok ? null : result.message);
  }

  return (
    <form action={handleSave} className="flex items-center gap-1">
      <input
        type="date"
        name="backorderExpected"
        className="input-klyne px-1.5 py-0.5 text-xs"
        defaultValue={defaultValue}
        aria-label={`Backorder expected date for ${itemName}`}
      />
      <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="…">
        Save
      </PendingButton>
      {error && <span role="alert" className="text-xs text-red">{error}</span>}
    </form>
  );
}
