"use client";

// Close panel (extracted client-side, Sep 2 QA round): "Mark won - create the
// order" used to be an instant write that spawned a real order with no
// confirmation and with Job/Needed-By/Delivery all "not set". Now:
// - the won form requires a delivery destination and a needed-by date, so the
//   order lands in fulfillment ready to work;
// - both closes show a review dialog first - one stray click can no longer
//   create (or kill) a deal.

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { fmtUSD } from "@/lib/money";
import { markOpportunityLost, markOpportunityWon } from "./actions";

type WonSummary = {
  value: number;
  deposit: number | null;
  address: string;
  neededBy: string;
};

export function ClosePanel({
  opportunityId,
  isProject,
  requiresDeposit,
  depositPercent,
  suggestedDeposit,
  needsOrderRecovery,
  defaultValue,
  defaultDeliveryAddress,
  defaultNeededBy,
  defaultLostReason,
}: {
  opportunityId: string;
  isProject: boolean;
  requiresDeposit: boolean;
  depositPercent: number;
  suggestedDeposit: number;
  needsOrderRecovery: boolean;
  defaultValue: number | null;
  defaultDeliveryAddress: string | null;
  /** "YYYY-MM-DD" or "". */
  defaultNeededBy: string;
  defaultLostReason: string | null;
}) {
  const wonFormRef = useRef<HTMLFormElement>(null);
  const lostFormRef = useRef<HTMLFormElement>(null);
  const [wonSummary, setWonSummary] = useState<WonSummary | null>(null);
  const [confirmingLost, setConfirmingLost] = useState(false);
  const [submitting, setSubmitting] = useState<"won" | "lost" | null>(null);

  function openWonConfirm() {
    const form = wonFormRef.current;
    if (!form || !form.reportValidity()) return;
    const fd = new FormData(form);
    const value = Number(fd.get("value"));
    const requireDeposit = fd.get("requireDeposit") === "1";
    const typedDeposit = Number(String(fd.get("depositAmount") ?? ""));
    const deposit = !isProject
      ? value
      : requireDeposit
        ? typedDeposit > 0
          ? typedDeposit
          : Math.round((value * depositPercent) / 100)
        : null;
    setWonSummary({
      value,
      deposit,
      address: String(fd.get("deliveryAddress") ?? "").trim(),
      neededBy: String(fd.get("neededByDate") ?? ""),
    });
  }

  function confirmWon() {
    setWonSummary(null);
    setSubmitting("won");
    wonFormRef.current?.requestSubmit();
  }

  function openLostConfirm() {
    const form = lostFormRef.current;
    if (!form || !form.reportValidity()) return;
    setConfirmingLost(true);
  }

  function confirmLost() {
    setConfirmingLost(false);
    setSubmitting("lost");
    lostFormRef.current?.requestSubmit();
  }

  return (
    <div
      className={`grid grid-cols-1 gap-6 ${needsOrderRecovery ? "" : "md:grid-cols-2"}`}
    >
      <form ref={wonFormRef} action={markOpportunityWon} className="space-y-3">
        <input type="hidden" name="id" value={opportunityId} />
        {/* Tells the action these fields were really asked (an unticked box
            means "no deposit agreed", not "this form didn't ask"). */}
        <input type="hidden" name="closePanel" value="1" />

        <p className="section-label !mb-0">Won</p>

        <label className="block">
          <span className="field-label">Total price agreed</span>
          <input
            type="number"
            name="value"
            min="1"
            step="0.01"
            required
            defaultValue={defaultValue ?? ""}
            placeholder="0"
            className="input-klyne w-full"
          />
        </label>

        {/* The order this creates goes straight to fulfillment - it needs a
            destination and a date, not "not set" everywhere (Sep 2 QA). */}
        <label className="block">
          <span className="field-label">Delivery address (required)</span>
          <input
            type="text"
            name="deliveryAddress"
            required
            defaultValue={defaultDeliveryAddress ?? ""}
            placeholder="Where is this order going?"
            className="input-klyne w-full"
          />
        </label>
        <label className="block max-w-xs">
          <span className="field-label">Needed by (required)</span>
          <input
            type="date"
            name="neededByDate"
            required
            defaultValue={defaultNeededBy}
            className="input-klyne w-full"
          />
        </label>

        {isProject ? (
          <div className="rounded-[10px] border border-border bg-panel p-3">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                name="requireDeposit"
                value="1"
                defaultChecked={requiresDeposit}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Deposit required?
            </label>
            <label className="mt-3 block">
              <span className="field-label">Deposit amount</span>
              <input
                type="number"
                name="depositAmount"
                min="0"
                step="0.01"
                defaultValue={suggestedDeposit || ""}
                placeholder="0"
                className="input-klyne w-full"
              />
            </label>
            <p className="mt-1.5 text-xs text-gray">
              Prefilled at {depositPercent}% for this account - change it to whatever was agreed.
              Untick the box and POs won&rsquo;t wait for a payment.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-gray-dark">
            A straight order stages the full payment - POs go out once it&rsquo;s paid.
          </p>
        )}

        {/* The header owns the page's single filled CTA (§H), so this stays secondary. */}
        <button
          type="button"
          onClick={openWonConfirm}
          disabled={submitting === "won"}
          aria-haspopup="dialog"
          aria-busy={submitting === "won"}
          className={`btn active:scale-[0.99] ${submitting === "won" ? "cursor-progress opacity-60" : ""}`}
        >
          {submitting === "won"
            ? "Creating order…"
            : needsOrderRecovery
              ? "Create the order…"
              : "Mark won - create the order…"}
        </button>
        {/* Fallback for no-JS form submission is intentionally absent: the
            confirm step is the point. */}
        <ConfirmDialog
          open={wonSummary != null}
          title="Win this deal and create the order?"
          confirmLabel="Create the order"
          onConfirm={confirmWon}
          onClose={() => setWonSummary(null)}
        >
          {wonSummary ? (
            <dl className="space-y-1 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Price agreed</dt>
                <dd className="font-semibold text-ink">{fmtUSD(wonSummary.value, { cents: true })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Payment gate</dt>
                <dd className="text-ink">
                  {wonSummary.deposit != null
                    ? `${fmtUSD(wonSummary.deposit, { cents: true })} ${isProject ? "deposit" : "full payment"} before POs`
                    : "No deposit - billed after delivery"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Deliver to</dt>
                <dd className="text-right text-ink">{wonSummary.address}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Needed by</dt>
                <dd className="text-ink">{wonSummary.neededBy}</dd>
              </div>
              <p className="pt-2 text-xs text-gray">
                This moves the deal to Won and creates a live order in fulfillment with its line
                items and the staged payment.
              </p>
            </dl>
          ) : null}
        </ConfirmDialog>
      </form>

      {needsOrderRecovery ? null : (
        <form ref={lostFormRef} action={markOpportunityLost} className="space-y-3">
          <input type="hidden" name="id" value={opportunityId} />
          <p className="section-label !mb-0">Lost</p>
          <label className="block">
            <span className="field-label">Lost reason (required)</span>
            <input
              type="text"
              name="lostReason"
              required
              defaultValue={defaultLostReason ?? ""}
              placeholder="Why did we lose it?"
              className="input-klyne w-full"
            />
          </label>
          <p className="text-[13px] text-gray-dark">
            Closes the deal and drops it out of the follow-up queue. No order is created.
          </p>
          <button
            type="button"
            onClick={openLostConfirm}
            disabled={submitting === "lost"}
            aria-haspopup="dialog"
            aria-busy={submitting === "lost"}
            className={`btn btn-danger active:scale-[0.99] ${
              submitting === "lost" ? "cursor-progress opacity-60" : ""
            }`}
          >
            {submitting === "lost" ? "Closing…" : "Mark lost…"}
          </button>
          <ConfirmDialog
            open={confirmingLost}
            title="Mark this deal lost?"
            confirmLabel="Mark lost"
            danger
            onConfirm={confirmLost}
            onClose={() => setConfirmingLost(false)}
          >
            The deal closes and leaves the pipeline&rsquo;s follow-up queues. It stays on record
            with its reason, and an admin can still reopen it by editing the deal.
          </ConfirmDialog>
        </form>
      )}
    </div>
  );
}
