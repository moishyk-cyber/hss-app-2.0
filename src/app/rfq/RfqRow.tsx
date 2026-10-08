"use client";

import { MoneyInput } from "@/lib/MoneyInput";

import { useState, useTransition, useRef } from "react";
import { RFQ_STATUSES, RFQ_STATUS_COLORS, labelFor } from "@/lib/constants";
import { ActionButton, BadgeSelect } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { parseMoney, fmtUSD } from "@/lib/money";
import { Avatar } from "@/lib/Avatar";
import { UserSelect } from "@/lib/UserSelect";
import {
  markLineItemRemoved,
  setLineItemAssignee,
  setLineItemRfqStatus,
  updateLineItemPricing,
} from "./actions";
import { LeadTimeCell, StockStatusCell } from "./StockCells";

/** Amber past this many days sitting in the RFQ queue without a status change. */
const RFQ_WAITING_THRESHOLD_DAYS = 7;

type RfqItem = {
  id: string;
  name: string;
  qty: number;
  brand: string | null;
  leadTimeDate: Date | null;
  unitCost: number | null;
  unitPrice: number | null;
  rfqStatus: string;
  stockStatus: string;
  backorderExpected: Date | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
};

/**
 * Price cell (Sep 2 QA P0: "the one number your estimators enter all day isn't
 * sticking"). What changed:
 * - the input takes human money ("$1,234.56") and validates BEFORE saving;
 *   a bad or negative price shows an inline error instead of silently clearing.
 * - saving a price on a needs_pricing item advances it to Quote Received (the
 *   queue's own next stage), so the price is immediately visible on the row in
 *   its new group instead of the field appearing to wipe itself.
 * - every outcome is announced: inline error on failure, toast on success.
 *
 * Blank input preserves the saved price. Commit a valid price on blur or Enter.
 */
export function PriceCell({ item }: { item: RfqItem }) {
  const { toast } = useToast();
  const [saving, startSave] = useTransition();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSavePricing(formData: FormData) {
    const raw = String(formData.get("price") ?? "").trim();
    if (raw === "") {
      setError(
        item.unitPrice != null
          ? "Enter a price. Leaving this blank keeps the saved price."
          : "Enter a price greater than $0.",
      );
      return;
    }
    const price = parseMoney(raw);
    if (price == null || Number.isNaN(price)) {
      setError("Enter a number, e.g. 1234.56");
      return;
    }
    if (price <= 0) {
      setError("The price has to be more than $0.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    const willAdvance = item.rfqStatus === "needs_pricing";
    // One money field per item (Moishy, Aug 31): price only. unitCost passes
    // through unchanged so existing data is preserved without being shown.
    let result;
    try {
      result = await updateLineItemPricing(item.id, item.unitCost, price);
    } catch {
      setError("Could not save the price. Press Enter to retry.");
      return;
    } finally {
      inFlight.current = false;
    }
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast({
      kind: "success",
      message: `${fmtUSD(price, { cents: true })} saved on "${item.name}"${
        willAdvance ? " - moved to Quote Received" : ""
      }`,
    });
  }

  return (
    <div className="price-cell relative min-w-[100px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startSave(() => handleSavePricing(data));
        }}
        className="flex items-center gap-1"
      >
        <MoneyInput
          min="0.01"
          disabled={saving}
          onBlur={(e) => {
            const initial =
              item.rfqStatus === "needs_pricing"
                ? null
                : item.unitPrice;
            if (
              parseMoney(e.currentTarget.value) !== initial &&
              e.currentTarget.value.trim()
            )
              e.currentTarget.form?.requestSubmit();
          }}
          name="price"
          // A reverted-to-needs_pricing item can still have a stale unitPrice on
          // record (Moishy, Sep 2 QA) - never pre-fill it here, or someone could
          // mistake the old number for a current quote. The stored value itself
          // is untouched; this only changes what the input renders.
          defaultValue={
            item.rfqStatus === "needs_pricing" ? "" : (item.unitPrice ?? "")
          }
          className="input-klyne w-24 px-1.5 py-1 text-xs"
          placeholder="$0.00"
          aria-label={`Price for ${item.name}`}
          // Submit Enter explicitly: implicit form behavior is easy for an
          // extension (autofill, password managers) or an ancestor keydown handler to
          // swallow - request the submit explicitly so Enter is never a silent no-op.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.value =
                item.rfqStatus === "needs_pricing"
                  ? ""
                  : String(item.unitPrice ?? "");
              setError(null);
              e.currentTarget.blur();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </form>
      {saving && (
        <span role="status" className="text-xs text-gray-dark">
          Saving…
        </span>
      )}
      {error ? (
        <span role="alert" className="block text-red mt-1 max-w-40 text-xs">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function RfqRow({
  item,
  users,
  parentHref,
  parentLabel,
  parentCompany,
  daysWaiting,
}: {
  item: RfqItem;
  users: { id: string; name: string }[];
  parentHref: string | null;
  parentLabel: string;
  parentCompany: string | null;
  daysWaiting: number;
}) {
  const { toast } = useToast();

  async function handleRemove() {
    const previousStatus = item.rfqStatus;
    const result = await markLineItemRemoved(item.id);
    if (result.ok) {
      toast({
        kind: "info",
        message: `"${item.name}" removed from the queue`,
        actionLabel: "Undo",
        onAction: () => setLineItemRfqStatus(item.id, previousStatus),
      });
    }
    return result;
  }

  return (
    <tr
      id={`li-${item.id}`}
      className="align-top scroll-mt-4 transition-colors hover:bg-hover"
    >
      <td className="">
        <div className="rfq-item-name font-semibold text-ink">{item.name}</div>
        {/* The lead time itself is the editable date column - not repeated here. */}
        {item.brand && (
          <div className="rfq-item-brand text-gray">{item.brand}</div>
        )}
      </td>
      <td className=" text-gray-dark">{item.qty}</td>
      <td className="">
        {parentHref ? (
          <a
            href={parentHref}
            className="inline-flex min-w-0 max-w-52 items-center gap-1.5 text-[13px] text-gray-dark transition-colors hover:text-ink"
          >
            {parentCompany && (
              <Avatar name={parentCompany} kind="business" size="sm" />
            )}
            <span className="truncate">{parentLabel}</span>
          </a>
        ) : (
          <span className="empty-value">no parent</span>
        )}
      </td>
      <td
        className={` ${daysWaiting > RFQ_WAITING_THRESHOLD_DAYS ? "font-medium text-orange" : "text-gray-dark"}`}
      >
        {daysWaiting}d
      </td>
      <td className="">
        <PriceCell item={item} />
      </td>
      <td className="">
        <LeadTimeCell item={item} />
      </td>
      <td className="">
        <StockStatusCell item={item} />
      </td>
      <td className="">
        <UserSelect
          value={item.assigneeId ?? ""}
          users={users}
          action={(next) => setLineItemAssignee(item.id, next)}
        />
      </td>
      <td className="">
        <div className="flex items-center gap-2">
          <BadgeSelect
            value={item.rfqStatus}
            options={RFQ_STATUSES}
            action={(next) => setLineItemRfqStatus(item.id, next)}
            colorMap={RFQ_STATUS_COLORS}
            ariaLabel={`RFQ status for ${item.name}: ${labelFor(RFQ_STATUSES, item.rfqStatus)}`}
          />
          <ActionButton
            action={handleRemove}
            className="btn btn-sm btn-danger !px-2 active:scale-[0.99]"
            ariaLabel={`Remove ${item.name} from the queue`}
            title={`Remove ${item.name}`}
          >
            <svg
              aria-hidden
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}
