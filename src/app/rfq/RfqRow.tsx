"use client";

import { useState, useTransition } from "react";
import { RFQ_STATUSES, RFQ_STATUS_COLORS, labelFor } from "@/lib/constants";
import { PendingButton, ActionButton, BadgeSelect } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { parseMoney, fmtUSD } from "@/lib/money";
import { Avatar } from "@/lib/Avatar";
import { UserSelect } from "@/lib/UserSelect";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import {
  clearLineItemPrice,
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
 * Reliability spec P1 fix: a blank Save no longer clears the price (that was
 * one stray click from deleting trusted pricing data - see the "123 Test" /
 * "Order" incident). Blank now fails validation and the stored price is left
 * alone. Clearing a price is its own explicit, confirmed action below.
 */
function PriceCell({ item }: { item: RfqItem }) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, startClear] = useTransition();

  async function handleSavePricing(formData: FormData) {
    const raw = String(formData.get("price") ?? "").trim();
    if (raw === "") {
      setError(
        item.unitPrice != null
          ? "Enter a price, or use \"Clear price\" below to remove it."
          : "Enter a price greater than $0."
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
    setError(null);
    const willAdvance = item.rfqStatus === "needs_pricing";
    // One money field per item (Moishy, Aug 31): price only. unitCost passes
    // through unchanged so existing data is preserved without being shown.
    const result = await updateLineItemPricing(item.id, item.unitCost, price);
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

  function handleConfirmClear() {
    startClear(async () => {
      const result = await clearLineItemPrice(item.id);
      setConfirmingClear(false);
      if (!result.ok) {
        toast({ kind: "error", message: result.message });
        return;
      }
      toast({ kind: "info", message: `Price cleared on "${item.name}"` });
    });
  }

  return (
    <div className="relative space-y-1">
      <form action={handleSavePricing} className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          name="price"
          // A reverted-to-needs_pricing item can still have a stale unitPrice on
          // record (Moishy, Sep 2 QA) - never pre-fill it here, or someone could
          // mistake the old number for a current quote. The stored value itself
          // is untouched; this only changes what the input renders.
          defaultValue={item.rfqStatus === "needs_pricing" ? "" : item.unitPrice ?? ""}
          className="input-klyne w-24 px-1.5 py-1 text-xs"
          placeholder="$0.00"
          aria-label={`Price for ${item.name}`}
          // Enter should submit like clicking Save. Browsers do this implicitly for a
          // lone text field + submit button, but that implicit behavior is easy for an
          // extension (autofill, password managers) or an ancestor keydown handler to
          // swallow - request the submit explicitly so Enter is never a silent no-op.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <PendingButton
          className="btn btn-primary btn-sm active:scale-[0.99]"
          pendingText="Saving…"
          ariaLabel={`Save price for ${item.name}`}
        >
          Save
        </PendingButton>
      </form>
      <div className="flex items-center gap-2">
        {item.unitPrice != null ? (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="text-[11px] text-gray transition-colors hover:text-red"
          >
            Clear price
          </button>
        ) : null}
        <a
          href={`/admin/audit?f_recordType=line_item&f_recordId=${item.id}`}
          className="text-[11px] text-gray transition-colors hover:text-ink"
        >
          History
        </a>
      </div>
      {error ? (
        <span role="alert" className="banner-alert absolute left-0 top-full z-10 mt-1 w-max max-w-56 px-2 py-1 text-xs">
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmingClear}
        title={`Clear price on "${item.name}"?`}
        confirmLabel="Clear price"
        danger
        pending={clearing}
        onConfirm={handleConfirmClear}
        onClose={() => setConfirmingClear(false)}
      >
        Current price: {item.unitPrice != null ? fmtUSD(item.unitPrice, { cents: true }) : "none"}. This removes it -
        the item goes back to needing a price.
      </ConfirmDialog>
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
    <tr id={`li-${item.id}`} className="align-top scroll-mt-4 transition-colors hover:bg-hover">
      <td className="!py-1.5">
        <div className="text-[13.5px] font-semibold text-ink">{item.name}</div>
        {/* The lead time itself is the editable date column - not repeated here. */}
        {item.brand && <div className="text-xs text-gray">{item.brand}</div>}
      </td>
      <td className="!py-1.5 text-gray-dark">{item.qty}</td>
      <td className="!py-1.5">
        {parentHref ? (
          <a href={parentHref} className="inline-flex min-w-0 max-w-52 items-center gap-1.5 text-[13px] text-gray-dark transition-colors hover:text-ink">
            {parentCompany && <Avatar name={parentCompany} kind="business" size="sm" />}
            <span className="truncate">{parentLabel}</span>
          </a>
        ) : (
          <span className="empty-value">no parent</span>
        )}
      </td>
      <td className={`!py-1.5 ${daysWaiting > RFQ_WAITING_THRESHOLD_DAYS ? "font-medium text-orange" : "text-gray-dark"}`}>
        {daysWaiting}d
      </td>
      <td className="!py-1.5">
        <PriceCell item={item} />
      </td>
      <td className="!py-1.5">
        <LeadTimeCell item={item} />
      </td>
      <td className="!py-1.5">
        <StockStatusCell item={item} />
      </td>
      <td className="!py-1.5">
        <UserSelect
          value={item.assigneeId ?? ""}
          users={users}
          action={(next) => setLineItemAssignee(item.id, next)}
        />
      </td>
      <td className="!py-1.5">
        <div className="flex flex-wrap items-center gap-2">
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
