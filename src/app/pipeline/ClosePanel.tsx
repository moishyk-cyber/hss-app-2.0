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

import { FileDropzone } from "@/lib/FileDropzone";
import { FilePreviewButton } from "@/lib/FilePreviewModal";
import { FileLabel } from "@/lib/FileLabel";
import { uploadFiles, type UploadAttempt } from "@/lib/uploadFile";
import { uploadProblem } from "@/lib/uploadPolicy";
import { createSignedUpload, finalizeUpload } from "@/app/files/actions";
import type { PreviewDocument } from "@/lib/filePreview";
import { EditIconButton } from "@/lib/ui";
import { useWorkflowFormCompletion } from "@/lib/WorkflowFormContext";
import { MoneyInput } from "@/lib/MoneyInput";

import { usePaymentTermsConversion, PaymentTermsPreview } from "@/lib/PaymentTermsField";
import { paymentPlanAmounts } from "@/lib/paymentTerms";
import { LocationDropdown } from "@/lib/LocationDropdown";
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
  customerPoFiles: string[];
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
      <EditIconButton label={`Edit ${label}`} onClick={onChange} />
    </div>
  );
}

export function ClosePanel({
  opportunityId,
  customerPoDocuments = [],
  uploadsEnabled = true,
  prerequisiteIssues,
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
  customerPoDocuments?: PreviewDocument[];
  uploadsEnabled?: boolean;
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
  const finishWorkflow = useWorkflowFormCompletion();
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
  const conversion = usePaymentTermsConversion(terms);
  const [customerPoFiles, setCustomerPoFiles] = useState<File[]>([]);
  const customerPoUpload = useRef<UploadAttempt | null>(null);

  // An answer that is already on the deal opens closed; a missing one opens as
  // an input, because that is the only thing the close is actually waiting for.
  const [editPrice, setEditPrice] = useState(!(defaultValue != null && defaultValue > 0));
  const [locationChoice, setLocationChoice] = useState("intake");
  const [editNeededBy, setEditNeededBy] = useState(!defaultNeededBy);

  const numericValue = Number(value);
  const priceReady = Number.isFinite(numericValue) && numericValue >= 0.01;
  const accountDeposit = roundCents(((priceReady ? numericValue : 0) * depositPercent) / 100);
  let termsProblem = terms.trim() && (conversion.loading ? "Wait for payment terms to finish converting." : conversion.error || (conversion.plan?.status !== "ready" || !conversion.token ? "Clarify the payment terms before confirming the deal." : ""));
  let gateLine = requiresDeposit ? `Account deposit: ${depositPercent}% (${fmtUSD(accountDeposit, { cents: true })}) before purchasing` : "No payment required before purchasing";
  if (conversion.plan?.status === "ready") {
    try { const required = paymentPlanAmounts(conversion.plan, priceReady ? numericValue : null).requiredBeforePurchase; gateLine = required === 0 ? "No payment required before purchasing" : required == null ? "Set the agreed total to calculate the deposit" : `${fmtUSD(required, { cents: true })} required before purchasing`; }
    catch (error) { termsProblem = (error as Error).message; }
  }

  function validateWon() {
    setAttempted(true);
    const own = closeIssues({ value: numericValue, address, neededBy }, "won");
    const fileProblem = customerPoFiles.map(file => uploadProblem(file)).find(Boolean);
    const issues = [...(fileProblem ? [{ field: "customerPo", message: fileProblem }] : []), ...prerequisiteIssues.filter(i => i.field !== "neededByDate"), ...own, ...(termsProblem ? [{ field: "termsNotes", message: termsProblem }] : [])];
    if (own.some(i => i.field === "value")) setEditPrice(true);
    if (own.some(i => i.field === "neededByDate")) setEditNeededBy(true);
    setValidation(issues);
    return issues.length === 0;
  }

  function openWonConfirm() {
    if (submitting || !validateWon()) return;
    setWonSummary({ value: numericValue, terms: terms.trim(), locationName: locationName.trim(), address: address.trim(), neededBy, customerPoFiles: [...customerPoDocuments.map(doc => doc.fileName ?? "Customer PO"), ...customerPoFiles.map(file => file.name)] });
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
      const input = issue?.field === "customerPo" ? form?.querySelector<HTMLElement>('#customer-po button') : issue?.field === "value" ? form?.querySelector<HTMLElement>('input[inputmode="decimal"]') : issue?.field === "deliveryAddress" ? form?.querySelector<HTMLElement>('input[name="deliveryAddress"]:not([type="hidden"]), select[aria-label="Location"]') : form?.querySelector<HTMLElement>(`[name="${issue?.field}"]`);
      if (input?.id) highlightSection(`#${input.id}`, form); else { input?.scrollIntoView({ block: "center" }); input?.focus(); }
    });
  }

  async function submitClose(formData: FormData, kind: "won" | "lost") {
    setSubmitting(kind);
    try {
      if (kind === "won" && customerPoFiles.length) {
        const upload = await uploadFiles(customerPoFiles, customerPoUpload, file => ({
          start: () => createSignedUpload("opportunity", opportunityId, file.name, file.type, file.size),
          finish: signed => finalizeUpload("opportunity", opportunityId, { storagePath: signed.storagePath, fileName: file.name, mimeType: file.type, sizeBytes: file.size, kind: "customer_po" }),
        }), file => setCustomerPoFiles(previous => previous.filter(selected => selected !== file)));
        if (!upload.ok) { setWonSummary(null); setValidation([{ field: "customerPo", message: upload.message }]); return; }
      }
      const result = await (kind === "won" ? markOpportunityWon(formData) : markOpportunityLost(formData));
      if (result.ok) {
        if (finishWorkflow) { setWonSummary(null); setConfirmingLost(false); finishWorkflow(); }
        else { router.push(result.href); router.refresh(); }
      }
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

        <p className="text-xs text-gray-dark">Required fields are labeled below. Terms and Customer PO can be added later.</p>

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
        <LocationDropdown label="Location" intake={{ name: defaultLocationName ?? null, address: defaultDeliveryAddress ?? null }} locations={locations} value={{ choice: locationChoice, locationId, locationName, address }} required onChange={next => { setLocationChoice(next.choice); setLocationId(next.locationId); setLocationName(next.locationName); setAddress(next.address); }} />
        {attempted && !address.trim() && <p role="alert" className="text-xs text-red">Choose a location or enter the new delivery address.</p>}

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
          <span className="field-label">Payment terms</span>
          <textarea
            name="termsNotes"
            rows={3}
            maxLength={4000}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Enter the terms agreed with this customer in your own words…"
            className="input-klyne w-full"
          />
        </label>
        <input type="hidden" name="paymentTermsToken" value={conversion.token} />
        <PaymentTermsPreview conversion={conversion} total={priceReady ? numericValue : null} />

        <section id="customer-po" aria-label="Customer PO" className="space-y-3">
          <div className="flex items-baseline gap-2"><h3 className="field-label !mb-0">Customer PO</h3><span className="text-xs text-gray-dark">Optional</span></div>
          {customerPoDocuments.map(doc => <div key={doc.id} className="flex min-w-0 items-center gap-3"><FileLabel text={doc.fileName ?? "Customer PO"} className="flex-1 text-sm" /><FilePreviewButton document={doc} /></div>)}
          {uploadsEnabled ? <><FileDropzone files={customerPoFiles} onChange={setCustomerPoFiles} disabled={!!submitting} /><p className="text-xs text-gray-dark">Selected files are saved when you confirm the deal.</p></> : <p className="text-sm text-gray-dark">You can confirm the deal without a Customer PO and attach it from Files later.</p>}
        </section>

        {/* The header owns the page's single filled CTA (§H), so this stays secondary. */}
        <button
          type="button"
          onClick={openWonConfirm}
          disabled={!!submitting || !!termsProblem}
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
                <dt className="text-gray-dark">Customer PO</dt>
                <dd className="text-ink">
                  {wonSummary.customerPoFiles.length ? <ul className="text-right">{wonSummary.customerPoFiles.map((name, index) => <li key={index} className="max-w-64"><FileLabel text={name} /></li>)}</ul> : <span className="empty-value">not attached</span>}
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
