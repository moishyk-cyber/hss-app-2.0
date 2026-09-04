"use client";

// Top of the Invoice tab (plan §3C.3): the order's terms and the
// customer-facing quote row. Both write through ../actions.
//
// Sep 4 (client): "Can we make the bills and the terms be a simple text box? I
// upload the quote, I read it, and based on that I create the terms and the
// invoices needed." So the terms are one free-text box - nothing is derived
// from them, and the invoices below are added by hand.

import { useState } from "react";
import { PAYMENT_TERMS, QUOTE_STATUSES, QUOTE_STATUS_COLORS, labelFor } from "@/lib/constants";
import { updateOrderTermsText, setOrderQuote } from "../actions";
import { BadgeSelect, PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtDate } from "../utils";

type TermsCardProps = {
  orderId: string;
  termsNotes: string | null;
  /** Legacy PAYMENT_TERMS value - prefills the box so an old order never reads blank. */
  paymentTerms: string | null;
  quoteStatus: string;
  quoteUrl: string | null;
  quoteSentAt: Date | null;
};

export default function TermsCard({
  orderId,
  termsNotes,
  paymentTerms,
  quoteStatus,
  quoteUrl,
  quoteSentAt,
}: TermsCardProps) {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Orders closed before terms became free text carry a PAYMENT_TERMS value
  // instead - show its label so nothing old reads as "not set".
  const initialText = termsNotes || (paymentTerms ? labelFor(PAYMENT_TERMS, paymentTerms) : "");

  async function handleSave(formData: FormData) {
    const result = await updateOrderTermsText(orderId, String(formData.get("termsNotes") ?? ""));
    if (result.ok) {
      setError(null);
      toast({ kind: "success", message: "Terms saved" });
    } else {
      setError(result.message);
    }
  }

  async function handleQuoteStatusChange(next: string) {
    return setOrderQuote(orderId, { quoteStatus: next, quoteUrl: quoteUrl ?? "" });
  }

  async function handleQuoteLinkSave(formData: FormData) {
    const url = String(formData.get("quoteUrl") ?? "");
    const result = await setOrderQuote(orderId, { quoteStatus, quoteUrl: url });
    if (!result.ok) toast({ kind: "error", message: result.message });
    else toast({ kind: "success", message: "Quote link saved" });
  }

  return (
    <div className="card space-y-4">
      <form action={handleSave} className="space-y-3">
        <div className="section-label">Terms</div>
        {error && (
          <div role="alert" className="banner-alert">
            {error}
          </div>
        )}
        <textarea
          name="termsNotes"
          rows={3}
          defaultValue={initialText}
          placeholder="e.g. 50% deposit, balance before delivery. Net 30 for the balance."
          className="input-klyne w-full"
        />
        <div className="flex justify-end">
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
            Save terms
          </PendingButton>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <span className="field-label">Quote</span>
        <BadgeSelect
          value={quoteStatus}
          options={QUOTE_STATUSES}
          colorMap={QUOTE_STATUS_COLORS}
          action={handleQuoteStatusChange}
        />
        {quoteSentAt && <span className="text-xs text-gray-dark">Sent {fmtDate(quoteSentAt)}</span>}
        <form action={handleQuoteLinkSave} className="flex items-center gap-2">
          <input
            type="url"
            name="quoteUrl"
            defaultValue={quoteUrl ?? ""}
            placeholder="https://… quote link"
            className="input-klyne w-56 px-2 py-1 text-xs"
          />
          <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="Saving…">
            Save link
          </PendingButton>
        </form>
      </div>
    </div>
  );
}
