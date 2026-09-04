"use client";

// Close panel: the client half of marking a deal won or lost. Three rules hold
// it together.
// - Nothing is ever re-asked. Price, location + address and needed-by arrive
//   prefilled from the deal as a read-only summary with a "change" link each;
//   only a MISSING answer opens as an input.
// - The won form requires a delivery destination and a needed-by date, so the
//   order lands in fulfillment ready to work rather than "not set" everywhere.
// - Both closes show a review dialog first, so one stray click can't create
//   (or kill) a deal.
//
// The terms agreed on the call are picked here too, and applyTermsToOrder turns
// them into the order's deposit gate and its invoices.

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { PAYMENT_TERMS, labelFor } from "@/lib/constants";
import { fmtUSD } from "@/lib/money";
import { markOpportunityLost, markOpportunityWon } from "./actions";

export type CloseLocation = { id: string; name: string; address: string };

type WonSummary = {
  value: number;
  terms: string;
  deposit: number;
  locationName: string;
  address: string;
  neededBy: string;
};

/** A prefilled answer: shown as a line of text until "change" reveals the input. */
function SummaryRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: React.ReactNode;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] border border-border bg-panel px-3 py-2">
      <div className="min-w-0">
        <span className="field-label !mb-0.5 block">{label}</span>
        <span className="block break-words text-[13px] text-ink">{value}</span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-xs text-primary transition-colors hover:underline"
      >
        change
      </button>
    </div>
  );
}

/** Terms that need an agreed dollar amount before they mean anything. */
function termsNeedDeposit(terms: string): boolean {
  return terms === "deposit_balance" || terms === "custom";
}

export function ClosePanel({
  opportunityId,
  isProject,
  depositPercent,
  suggestedDeposit,
  needsOrderRecovery,
  defaultValue,
  defaultTerms,
  defaultLocationId,
  defaultLocationName,
  defaultDeliveryAddress,
  defaultNeededBy,
  defaultLostReason,
  locations,
}: {
  opportunityId: string;
  isProject: boolean;
  depositPercent: number;
  suggestedDeposit: number;
  needsOrderRecovery: boolean;
  defaultValue: number | null;
  /** From the account's terms: requiresDeposit ? deposit_balance : on_delivery. */
  defaultTerms: string;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  defaultDeliveryAddress: string | null;
  /** "YYYY-MM-DD" or "". */
  defaultNeededBy: string;
  defaultLostReason: string | null;
  /** The company's saved sites - picking one fills the name and address. */
  locations: CloseLocation[];
}) {
  const wonFormRef = useRef<HTMLFormElement>(null);
  const lostFormRef = useRef<HTMLFormElement>(null);
  const [wonSummary, setWonSummary] = useState<WonSummary | null>(null);
  const [confirmingLost, setConfirmingLost] = useState(false);
  const [submitting, setSubmitting] = useState<"won" | "lost" | null>(null);

  // Everything the deal already knows, held as state so a collapsed field can
  // post the same value through a hidden input.
  const [value, setValue] = useState(defaultValue != null && defaultValue > 0 ? String(defaultValue) : "");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [locationName, setLocationName] = useState(defaultLocationName ?? "");
  const [address, setAddress] = useState(defaultDeliveryAddress ?? "");
  const [neededBy, setNeededBy] = useState(defaultNeededBy);
  const [terms, setTerms] = useState(defaultTerms);
  const [deposit, setDeposit] = useState(suggestedDeposit > 0 ? String(suggestedDeposit) : "");

  // An answer that is already on the deal opens closed; a missing one opens as
  // an input, because that is the only thing the close is actually waiting for.
  const [editPrice, setEditPrice] = useState(!(defaultValue != null && defaultValue > 0));
  const [editLocation, setEditLocation] = useState(!defaultDeliveryAddress);
  const [editNeededBy, setEditNeededBy] = useState(!defaultNeededBy);

  const numericValue = Number(value);
  const priceReady = Number.isFinite(numericValue) && numericValue > 0;
  const depositAmount = (() => {
    if (!termsNeedDeposit(terms)) return terms === "full_upfront" ? (priceReady ? numericValue : 0) : 0;
    const typed = Number(deposit);
    if (Number.isFinite(typed) && typed > 0) return typed;
    return terms === "deposit_balance" && priceReady
      ? Math.round((numericValue * depositPercent) / 100)
      : 0;
  })();

  function pickLocation(nextId: string) {
    setLocationId(nextId);
    const picked = locations.find((l) => l.id === nextId);
    if (picked) {
      setLocationName(picked.name);
      setAddress(picked.address);
    }
  }

  function openWonConfirm() {
    // Reveal whatever is still missing instead of failing silently on a
    // collapsed row (its input isn't in the DOM to report validity on).
    if (!priceReady) {
      setEditPrice(true);
      return;
    }
    if (!address.trim()) {
      setEditLocation(true);
      return;
    }
    if (!neededBy) {
      setEditNeededBy(true);
      return;
    }
    const form = wonFormRef.current;
    if (!form || !form.reportValidity()) return;
    setWonSummary({
      value: numericValue,
      terms,
      deposit: depositAmount,
      locationName: locationName.trim(),
      address: address.trim(),
      neededBy,
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
        {/* Tells the action these fields were really asked (a blank deposit
            means "the terms don't need one", not "this form didn't ask"). */}
        <input type="hidden" name="closePanel" value="1" />

        <p className="section-label !mb-0">Won</p>

        {editPrice ? (
          <label className="block">
            <span className="field-label">Total price agreed</span>
            <input
              type="number"
              name="value"
              min="1"
              step="0.01"
              required
              autoFocus={defaultValue == null}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="input-klyne w-full"
            />
          </label>
        ) : (
          <>
            <SummaryRow
              label="Total price agreed"
              value={fmtUSD(numericValue, { cents: true })}
              onChange={() => setEditPrice(true)}
            />
            <input type="hidden" name="value" value={value} />
          </>
        )}

        {/* The order this creates goes straight to fulfillment - it needs a
            destination and a date, not "not set" everywhere. */}
        {editLocation ? (
          <div className="space-y-2 rounded-[10px] border border-border bg-panel p-3">
            <span className="section-label !mb-0">Location</span>
            {locations.length > 0 ? (
              <label className="block">
                <span className="field-label">Saved location</span>
                <select
                  value={locationId}
                  onChange={(e) => pickLocation(e.target.value)}
                  className="input-klyne w-full"
                >
                  <option value="">Somewhere else</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="field-label">Name of location</span>
              <input
                type="text"
                name="locationName"
                value={locationName}
                onChange={(e) => {
                  setLocationName(e.target.value);
                  setLocationId("");
                }}
                placeholder="e.g. Main kitchen"
                className="input-klyne w-full"
              />
            </label>
            <label className="block">
              <span className="field-label">Delivery address (required)</span>
              <input
                type="text"
                name="deliveryAddress"
                required
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setLocationId("");
                }}
                placeholder="Where is this order going?"
                className="input-klyne w-full"
              />
            </label>
            <input type="hidden" name="locationId" value={locationId} />
          </div>
        ) : (
          <>
            <SummaryRow
              label="Deliver to"
              value={
                <>
                  {locationName ? <span className="text-gray-dark">{locationName} · </span> : null}
                  {address}
                </>
              }
              onChange={() => setEditLocation(true)}
            />
            <input type="hidden" name="locationId" value={locationId} />
            <input type="hidden" name="locationName" value={locationName} />
            <input type="hidden" name="deliveryAddress" value={address} />
          </>
        )}

        {editNeededBy ? (
          <label className="block max-w-xs">
            <span className="field-label">Needed by (required)</span>
            <input
              type="date"
              name="neededByDate"
              required
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="input-klyne w-full"
            />
          </label>
        ) : (
          <>
            <SummaryRow
              label="Needed by"
              value={neededBy}
              onChange={() => setEditNeededBy(true)}
            />
            <input type="hidden" name="neededByDate" value={neededBy} />
          </>
        )}

        {/* Terms ARE the invoice: applyTermsToOrder writes the deposit gate and
            creates the payment rows from whatever is picked here. */}
        <div className="rounded-[10px] border border-border bg-panel p-3">
          <label className="block">
            <span className="field-label">Payment terms</span>
            <select
              name="paymentTerms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="input-klyne w-full"
            >
              {PAYMENT_TERMS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {termsNeedDeposit(terms) ? (
            <label className="mt-3 block">
              <span className="field-label">Deposit amount</span>
              <input
                type="number"
                name="depositAmount"
                min="0"
                step="0.01"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="0"
                className="input-klyne w-full"
              />
            </label>
          ) : null}
          <p className="mt-1.5 text-xs text-gray">
            {terms === "deposit_balance"
              ? `Prefilled at ${depositPercent}% for this account - change it to whatever was agreed. The balance is invoiced before delivery.`
              : terms === "full_upfront"
                ? "The full amount is invoiced now - POs wait until it is paid."
                : terms === "custom"
                  ? "Nothing is invoiced automatically beyond the deposit typed above."
                  : "Nothing blocks the POs - the invoice is due after delivery."}
          </p>
          <label className="mt-3 block">
            <span className="field-label">Terms notes</span>
            <input
              type="text"
              name="termsNotes"
              placeholder="Anything the client agreed that the terms don't say"
              className="input-klyne w-full"
            />
          </label>
        </div>

        {isProject ? null : (
          <p className="text-[13px] text-gray-dark">
            A straight order needs no customer quote - it goes to fulfillment as soon as the terms
            are met.
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
                <dt className="text-gray-dark">Terms</dt>
                <dd className="text-right text-ink">{labelFor(PAYMENT_TERMS, wonSummary.terms)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Payment gate</dt>
                <dd className="text-right text-ink">
                  {wonSummary.deposit > 0
                    ? `${fmtUSD(wonSummary.deposit, { cents: true })} before POs go out`
                    : "Nothing due before POs - billed later"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Deliver to</dt>
                <dd className="text-right text-ink">
                  {wonSummary.locationName ? `${wonSummary.locationName} · ` : ""}
                  {wonSummary.address}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Needed by</dt>
                <dd className="text-ink">{wonSummary.neededBy}</dd>
              </div>
              <p className="pt-2 text-xs text-gray">
                This moves the deal to Won and creates a live order in fulfillment with its line
                items and the invoices these terms imply.
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
