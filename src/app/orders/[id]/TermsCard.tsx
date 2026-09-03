"use client";

// Top of the Invoice tab (plan §3C.3): payment terms with an "Edit terms"
// reveal, and the customer-facing quote row. Both write through
// ../actions - updateOrderTerms re-runs applyTermsToOrder in a transaction
// (it skips paid rows on its own; this card also locks the terms/deposit
// inputs client-side once anyPaid, as a UX backstop for the server guard).

import { useState } from "react";
import {
  PAYMENT_TERMS,
  PAYMENT_TERM_COLORS,
  QUOTE_STATUSES,
  QUOTE_STATUS_COLORS,
  labelFor,
} from "@/lib/constants";
import { updateOrderTerms, setOrderQuote } from "../actions";
import { BadgeSelect, PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtUSD, roundCents } from "@/lib/money";
import { fmtDate } from "../utils";

/** Terms whose deposit amount is meaningful (see @/lib/terms depositForTerms). */
const DEPOSIT_TERMS = new Set(["deposit_balance", "custom"]);

type TermsCardProps = {
  orderId: string;
  paymentTerms: string | null;
  termsNotes: string | null;
  depositRequired: number | null;
  orderValue: number | null;
  depositPercent: number;
  /** True once any payment on the order has been marked paid - locks terms/deposit. */
  anyPaid: boolean;
  quoteStatus: string;
  quoteUrl: string | null;
  quoteSentAt: Date | null;
};

export default function TermsCard({
  orderId,
  paymentTerms,
  termsNotes,
  depositRequired,
  orderValue,
  depositPercent,
  anyPaid,
  quoteStatus,
  quoteUrl,
  quoteSentAt,
}: TermsCardProps) {
  const [editing, setEditing] = useState(false);
  const [selectedTerms, setSelectedTerms] = useState(paymentTerms ?? "deposit_balance");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const showDepositField = DEPOSIT_TERMS.has(selectedTerms);
  const impliedDeposit =
    orderValue != null ? fmtUSD(roundCents((orderValue * depositPercent) / 100), { cents: true }) : null;

  async function handleSave(formData: FormData) {
    const terms = String(formData.get("terms") ?? paymentTerms ?? "deposit_balance");
    const depositRaw = String(formData.get("depositAmount") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const result = await updateOrderTerms(orderId, {
      terms,
      depositAmount: depositRaw ? parseFloat(depositRaw) : null,
      notes,
    });
    if (result.ok) {
      setError(null);
      setEditing(false);
      toast({ kind: "success", message: "Terms updated" });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="section-label">Payment terms</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${PAYMENT_TERM_COLORS[paymentTerms ?? ""] ?? "badge-gray"}`}>
              {paymentTerms ? labelFor(PAYMENT_TERMS, paymentTerms) : "not set"}
            </span>
            <span className="text-sm text-gray-dark">
              {depositRequired != null && depositRequired > 0
                ? `Gate amount ${fmtUSD(depositRequired, { cents: true })}`
                : "No gate amount required"}
            </span>
          </div>
          <div className="text-xs text-gray-dark">
            {termsNotes || <span className="empty-value">no notes</span>}
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setError(null);
              setSelectedTerms(paymentTerms ?? "deposit_balance");
              setEditing(true);
            }}
          >
            Edit terms
          </button>
        )}
      </div>

      {editing && (
        <form action={handleSave} className="space-y-3 border-t border-border pt-3">
          {anyPaid && (
            <div className="banner-warn">
              A payment on this order is already marked paid - terms and the deposit amount are
              locked. Only the notes can change.
            </div>
          )}
          {error && (
            <div role="alert" className="banner-alert">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Terms</span>
              <select
                name="terms"
                value={selectedTerms}
                onChange={(e) => setSelectedTerms(e.target.value)}
                disabled={anyPaid}
                className="input-klyne w-full px-2 py-1.5 text-xs disabled:opacity-60"
              >
                {PAYMENT_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {showDepositField && (
              <label className="block">
                <span className="field-label">Deposit amount</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="depositAmount"
                  disabled={anyPaid}
                  defaultValue={depositRequired ?? ""}
                  placeholder={impliedDeposit ? `${depositPercent}% = ${impliedDeposit}` : undefined}
                  className="input-klyne w-full px-2 py-1.5 text-xs disabled:opacity-60"
                />
              </label>
            )}
            <label className={showDepositField ? "col-span-2 block" : "block"}>
              <span className="field-label">Notes</span>
              <textarea
                name="notes"
                defaultValue={termsNotes ?? ""}
                rows={2}
                className="input-klyne w-full px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
              Save terms
            </PendingButton>
          </div>
        </form>
      )}

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
