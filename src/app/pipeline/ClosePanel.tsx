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
// Sep 3 (plan A1.4): nothing is ever re-asked. Price, location + address and
// needed-by arrive prefilled from the deal as a read-only summary with a
// "change" link each; only a MISSING answer opens as an input.
//
// Sep 4 (client): terms are one free-text box. The salesperson reads the quote
// and writes what was agreed; nothing is invoiced automatically. The invoices
// are added by hand on the order's Invoice tab.

import { MoneyInput } from "@/lib/MoneyInput";

import { useRef, useState, useEffect } from "react";
import { highlightSection } from "@/lib/SectionLink";
import { useRouter } from "next/navigation";
import { closeIssues, type ValidationIssue } from "@/lib/dealWorkflow";
import { ValidationDialog } from "@/lib/ValidationDialog";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { fmtUSD, roundCents } from "@/lib/money";
import { markOpportunityLost, markOpportunityWon } from "./actions";

export type CloseLocation = { id: string; name: string; address: string };

type WonSummary = {
  value: number;
  terms: string;
  locationName: string;
  address: string;
  neededBy: string;
  poNumber: string;
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

export function ClosePanel({
  opportunityId,
  prerequisiteIssues,
  isProject,
  requiresDeposit,
  depositPercent,
  needsOrderRecovery,
  defaultValue,
  defaultLocationId,
  defaultLocationName,
  defaultDeliveryAddress,
  defaultNeededBy,
  defaultLostReason,
  locations,
}: {
  opportunityId: string;
  prerequisiteIssues: ValidationIssue[];
  isProject: boolean;
  /** Company.requiresDeposit - the account's own deposit rule, which still gates the POs. */
  requiresDeposit: boolean;
  depositPercent: number;
  needsOrderRecovery: boolean;
  defaultValue: number | null;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  defaultDeliveryAddress: string | null;
  /** "YYYY-MM-DD" or "". */
  defaultNeededBy: string;
  defaultLostReason: string | null;
  /** The company's saved sites - picking one fills the name and address. */
  locations: CloseLocation[];
}) {
  const router = useRouter();
  const [closingAs, setClosingAs] = useState<"won" | "lost">("won");
  const [validation, setValidation] = useState<ValidationIssue[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [lostReason, setLostReason] = useState(defaultLostReason ?? "");
  const approved = useRef(false);
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
  const previousNeededBy = useRef(defaultNeededBy);
  useEffect(() => {
    setNeededBy(current => current === previousNeededBy.current ? defaultNeededBy : current);
    previousNeededBy.current = defaultNeededBy;
  }, [defaultNeededBy]);
  const [terms, setTerms] = useState("");
  const [poNumber, setPoNumber] = useState("");

  // An answer that is already on the deal opens closed; a missing one opens as
  // an input, because that is the only thing the close is actually waiting for.
  const [editPrice, setEditPrice] = useState(!(defaultValue != null && defaultValue > 0));
  const [editLocation, setEditLocation] = useState(!defaultDeliveryAddress);
  const [editNeededBy, setEditNeededBy] = useState(!defaultNeededBy);

  const numericValue = Number(value);
  const priceReady = Number.isFinite(numericValue) && numericValue >= 0.01;
  // The POs still wait on the account's own deposit rule (Company.requiresDeposit
  // / depositPercent) - the free-text terms are for people, not for the gate.
  const accountDeposit = roundCents(((priceReady ? numericValue : 0) * depositPercent) / 100);
  const gateLine = isProject
    ? requiresDeposit
      ? `Deposit per account terms: ${depositPercent}% (${fmtUSD(accountDeposit, { cents: true })})`
      : "No deposit required for this account"
    : "Full payment before POs go out";

  function pickLocation(nextId: string) {
    setLocationId(nextId);
    const picked = locations.find((l) => l.id === nextId);
    if (picked) {
      setLocationName(picked.name);
      setAddress(picked.address);
    }
  }

  function validateWon() {
    setAttempted(true);
    const own = closeIssues({ value: numericValue, address, neededBy }, "won");
    const issues = [...prerequisiteIssues.filter(i => i.field !== "neededByDate"), ...own];
    if (own.some(i => i.field === "value")) setEditPrice(true);
    if (own.some(i => i.field === "deliveryAddress")) setEditLocation(true);
    if (own.some(i => i.field === "neededByDate")) setEditNeededBy(true);
    setValidation(issues);
    return issues.length === 0;
  }

  function openWonConfirm() {
    if (submitting || !validateWon()) return;
    setWonSummary({ value: numericValue, terms: terms.trim(), locationName: locationName.trim(), address: address.trim(), neededBy, poNumber: poNumber.trim() });
  }

  function confirmWon() {
    if (!validateWon()) { setWonSummary(null); return; }
    approved.current = true;
    wonFormRef.current?.requestSubmit();
  }

  function openLostConfirm() {
    if (submitting) return;
    setAttempted(true);
    const issues = closeIssues({ value: numericValue, address, neededBy, lostReason }, "lost");
    setValidation(issues);
    if (!issues.length) setConfirmingLost(true);
  }

  function confirmLost() {
    approved.current = true;
    lostFormRef.current?.requestSubmit();
  }

  function fixRequiredFields() {
    const issue = validation[0];
    setValidation([]);
    if (issue?.href) {
      const source = wonFormRef.current;
      requestAnimationFrame(() => { if (!issue.href!.startsWith("#") || !highlightSection(issue.href!, source)) router.push(issue.href!.startsWith("#") ? `/pipeline/${opportunityId}${issue.href}` : issue.href!); });
      return;
    }
    requestAnimationFrame(() => {
      const form = closingAs === "won" ? wonFormRef.current : lostFormRef.current;
      const input = issue?.field === "value" ? form?.querySelector<HTMLInputElement>('input[inputmode="decimal"]') : form?.querySelector<HTMLInputElement>(`[name="${issue?.field}"]`);
      if (input?.id) highlightSection(`#${input.id}`, form); else { input?.scrollIntoView({ block: "center" }); input?.focus(); }
    });
  }

  async function submitClose(formData: FormData, kind: "won" | "lost") {
    setSubmitting(kind);
    try {
      const result = await (kind === "won" ? markOpportunityWon(formData) : markOpportunityLost(formData));
      if (result.ok) { router.push(result.href); router.refresh(); }
      else { setWonSummary(null); setConfirmingLost(false); setValidation(result.issues); }
    } catch {
      setWonSummary(null); setConfirmingLost(false);
      setValidation([{ field: "request", message: "The change could not be saved. Your entries are preserved. Please try again." }]);
    } finally { setSubmitting(null); approved.current = false; }
  }

  return (
    <div className="space-y-5">
      {!needsOrderRecovery ? <div className="flex flex-wrap items-center gap-2" aria-label="Customer decision">
        <button type="button" className={`btn ${closingAs === "won" ? "btn-primary" : ""}`} aria-pressed={closingAs === "won"} disabled={!!submitting} onClick={() => { setClosingAs("won"); setAttempted(false); }}>Win deal</button>
        <button type="button" className={`btn ${closingAs === "lost" ? "btn-primary" : ""}`} aria-pressed={closingAs === "lost"} disabled={!!submitting} onClick={() => { setClosingAs("lost"); setAttempted(false); }}>Mark lost</button>
      </div> : null}
      <form ref={wonFormRef} action={async data => submitClose(data, "won")} noValidate hidden={closingAs !== "won"} onSubmit={event => { if (!approved.current) { event.preventDefault(); openWonConfirm(); } }} className="space-y-4">
        <p className="text-sm text-gray-dark">Confirm the agreed total, delivery address and needed-by date. We’ll review everything before creating the order.</p>
        <input type="hidden" name="id" value={opportunityId} />
        {/* Tells the action these fields were really asked (a blank price is a
            missing answer, not "this form didn't ask"). */}
        <input type="hidden" name="closePanel" value="1" />

        <p className="text-xs text-gray-dark">Required fields are labeled below. Terms and PO number can be added later.</p>

        {editPrice ? (
          <label className="block">
            <span className="field-label">Total price agreed (required)</span>
            <MoneyInput
              name="value"
              id="close-price"
              min="0.01"
              required
              aria-invalid={attempted && !priceReady}
              aria-describedby={attempted && !priceReady ? "close-price-error" : undefined}
              value={value}
              onValueChange={setValue}
              placeholder="$0.00"
              className="input-klyne w-full"
            />
            {attempted && !priceReady ? <span id="close-price-error" className="mt-1 block text-xs text-red">Enter an agreed total of at least $0.01.</span> : null}
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
                id="close-address"
                aria-invalid={attempted && !address.trim()}
                aria-describedby={attempted && !address.trim() ? "close-address-error" : undefined}
                required
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setLocationId("");
                }}
                placeholder="Where is this order going?"
                className="input-klyne w-full"
              />
              {attempted && !address.trim() ? <span id="close-address-error" className="mt-1 block text-xs text-red">Enter the delivery address.</span> : null}
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
              id="close-needed-by"
              aria-invalid={attempted && !neededBy}
              aria-describedby={attempted && !neededBy ? "close-date-error" : undefined}
              required
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="input-klyne w-full"
            />
            {attempted && !neededBy ? <span id="close-date-error" className="mt-1 block text-xs text-red">Choose the needed-by date.</span> : null}
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

        {/* Sep 4 (client): one free-text box. The salesperson reads the quote and
            writes what was agreed; the invoices are added by hand later. */}
        <label className="block">
          <span className="field-label">Terms (optional)</span>
          <textarea
            name="termsNotes"
            rows={3}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="e.g. 50% deposit, balance before delivery. Net 30 for the balance."
            className="input-klyne w-full"
          />
        </label>

        <label className="block">
          <span className="field-label">PO number (optional, from AutoQuotes)</span>
          <input
            type="text"
            name="poNumber"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="Customer PO # as typed into AutoQuotes"
            className="input-klyne w-full"
          />
        </label>

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
          disabled={!!submitting}
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
          pending={!!submitting}
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
                <dd className="whitespace-pre-line text-right text-ink">
                  {wonSummary.terms || <span className="empty-value">no terms written yet</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">Payment gate</dt>
                <dd className="text-right text-ink">{gateLine}</dd>
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
              <div className="flex justify-between gap-3">
                <dt className="text-gray-dark">PO number</dt>
                <dd className="text-ink">
                  {wonSummary.poNumber || <span className="empty-value">not provided</span>}
                </dd>
              </div>
              <p className="pt-2 text-xs text-gray">
                This moves the deal to Won and creates a live order in fulfillment with its line
                items. No invoice is created - add those by hand on the order&rsquo;s Invoice tab.
              </p>
            </dl>
          ) : null}
        </ConfirmDialog>
      </form>

      {needsOrderRecovery ? null : (
        <form ref={lostFormRef} action={async data => submitClose(data, "lost")} noValidate hidden={closingAs !== "lost"} onSubmit={event => { if (!approved.current) { event.preventDefault(); openLostConfirm(); } }} className="space-y-4">
          <input type="hidden" name="id" value={opportunityId} />
          <p className="text-sm text-gray-dark">Record why the customer is not proceeding. This ends the deal without creating an order.</p>
          <label className="block">
            <span className="field-label">Lost reason (required)</span>
            <input
              type="text"
              name="lostReason"
              id="close-lost-reason"
              required
              value={lostReason}
              onChange={event => setLostReason(event.target.value)}
              aria-invalid={attempted && !lostReason.trim()}
              aria-describedby={attempted && !lostReason.trim() ? "close-lost-error" : undefined}
              placeholder="Why did we lose it?"
              className="input-klyne w-full"
            />
            {attempted && !lostReason.trim() ? <span id="close-lost-error" className="mt-1 block text-xs text-red">Enter a reason for losing this deal.</span> : null}
          </label>
          <p className="text-[13px] text-gray-dark">
            Closes the deal and drops it out of the follow-up queue. No order is created.
          </p>
          <button
            type="button"
            onClick={openLostConfirm}
            disabled={!!submitting}
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
            pending={!!submitting}
            onConfirm={confirmLost}
            onClose={() => setConfirmingLost(false)}
          >
            <p className="mb-3"><strong>Reason:</strong> {lostReason}</p>
            The deal closes and leaves the pipeline&rsquo;s follow-up queues. It stays on record
            with its reason, and an admin can still reopen it by editing the deal.
          </ConfirmDialog>
        </form>
      )}
      <ValidationDialog issues={validation} title={closingAs === "won" ? "Before you can mark this deal Won" : "Before you can mark this deal Lost"} onClose={() => setValidation([])} onFix={fixRequiredFields} />
    </div>
  );
}
