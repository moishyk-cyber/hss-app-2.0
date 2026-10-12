"use client";

// Top of the Invoice tab (plan §3C.3): the order's terms and the
// customer-facing quote row. Both write through ../actions.
//
// Sep 4 (client): "Can we make the bills and the terms be a simple text box? I
// upload the quote, I read it, and based on that I create the terms and the
// invoices needed." So the terms are one free-text box - nothing is derived
// from them, and the invoices below are added by hand.

import { useState } from "react";
import { PAYMENT_TERMS, labelFor } from "@/lib/constants";
import { updateOrderTermsText } from "@/lib/workflowActions";
import { PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtDate } from "../utils";
import { QuoteStatusControl, requestQuote, type SavedQuote } from "./QuoteStatusControl";
import { ValidationDialog } from "@/lib/ValidationDialog";
import { highlightSection } from "@/lib/SectionLink";
import { useWorkflowSelection } from "@/lib/WorkflowSelection";

type TermsCardProps = {
  orderId: string;
  termsNotes: string | null;
  /** Legacy PAYMENT_TERMS value - prefills the box so an old order never reads blank. */
  paymentTerms: string | null;
  quoteStatus: string;
  quoteUrl: string | null;
  quoteSentAt: Date | null;
  showQuote?: boolean;
  showTerms?: boolean;
};

export default function TermsCard({
  orderId,
  termsNotes,
  paymentTerms,
  quoteStatus: savedStatus,
  quoteUrl: savedUrl,
  quoteSentAt: savedSentAt,
  showQuote = true,
  showTerms = true,
}: TermsCardProps) {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const selection = useWorkflowSelection();
  const signature = JSON.stringify([savedStatus, savedUrl, savedSentAt]);
  const [localQuote, setLocalQuote] = useState<{ base: string; quote: SavedQuote } | null>(null);
  const current = localQuote?.base === signature ? localQuote.quote : null;
  const quoteStatus = current?.quoteStatus ?? savedStatus;
  const quoteUrl = current ? current.quoteUrl : savedUrl;
  const quoteSentAt = current ? current.quoteSentAt ? new Date(current.quoteSentAt) : null : savedSentAt;
  function applyQuote(quote: SavedQuote) { setLocalQuote({ base: signature, quote }); selection?.recordQuoteStatus(quote.quoteStatus); }

  // Orders closed before terms became free text carry a PAYMENT_TERMS value
  // instead - show its label so nothing old reads as "not set".
  const initialText = termsNotes || (paymentTerms ? labelFor(PAYMENT_TERMS, paymentTerms) : "");
  const [text, setText] = useState(initialText);
  const [missingTerms, setMissingTerms] = useState(false);

  async function handleSave(formData: FormData) {
    const terms = String(formData.get("termsNotes") ?? "");
    if (!terms.trim()) { setMissingTerms(true); return; }
    const result = await updateOrderTermsText(orderId, terms);
    if (result.ok) {
      setError(null);
      toast({ kind: "success", message: "Terms saved" });
    } else {
      setError(result.message);
    }
  }

  async function handleQuoteLinkSave(formData: FormData) {
    const url = String(formData.get("quoteUrl") ?? "");
    try {
      const quote = await requestQuote(orderId, { quoteStatus, quoteUrl: url });
      applyQuote(quote);
      toast({ kind: "success", message: "Quote link saved" });
    } catch (error) { toast({ kind: "error", message: error instanceof Error ? error.message : "Could not save the quote link." }); }
  }

  return (
    <div hidden={!showQuote && !showTerms} className="space-y-4">
      <section hidden={!showQuote} aria-label="Customer quote" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Customer quote</h3>
        </div>
        <QuoteStatusControl orderId={orderId} value={quoteStatus} quoteUrl={quoteUrl} onSaved={applyQuote} />
        <p className="text-sm text-gray-dark">
          {quoteStatus === "not_needed" ? "No customer quote is required for this order. Continue to the agreed terms and invoices." : quoteStatus === "accepted" ? "Customer approval is recorded. This step is complete." : quoteStatus === "sent" ? "Waiting for customer approval. When they approve, change the status above to Quote Accepted to complete this step." : "Prepare the quote in your quoting tool and send it to the customer. Save a link below, then change the status above to Quote Sent. Once the customer approves, select Quote Accepted."}
        </p>
        {!["not_needed", "accepted"].includes(quoteStatus) ? <p className="text-xs text-gray-dark">These statuses record what happened. This app does not create or email the quote; saving a link alone does not complete the step.</p> : null}
        {quoteSentAt && <span className="text-xs text-gray-dark">Sent {fmtDate(quoteSentAt)}</span>}
        <form action={handleQuoteLinkSave} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
          <span className="field-label">Quote document link (optional)</span>
          <input
            type="url"
            name="quoteUrl"
            defaultValue={quoteUrl ?? ""}
            placeholder="https://…"
            className="input-klyne w-full text-sm"
          />
          </label>
          <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="Saving…">
            Save link
          </PendingButton>
        </form>
      </section>

      {missingTerms ? <ValidationDialog issues={[{ field: "termsNotes", message: "Enter the terms agreed with the customer." }]} onClose={() => setMissingTerms(false)} onFix={() => { setMissingTerms(false); requestAnimationFrame(() => highlightSection("#order-terms")); }} /> : null}
      <form id="order-terms" hidden={!showTerms} action={handleSave} className={`space-y-3 ${showQuote ? "border-t border-border pt-4" : ""}`}>
        <div className="section-label">Terms</div>
        {error && (
          <div role="alert" className="banner-alert">
            {error}
          </div>
        )}
        <textarea
          id="terms-notes"
          aria-label="Agreed order terms"
          name="termsNotes"
          rows={3}
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="e.g. 50% deposit, balance before delivery. Net 30 for the balance."
          className="input-klyne w-full"
        />
        <div className="flex justify-end">
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
            Save terms
          </PendingButton>
        </div>
      </form>


    </div>
  );
}
