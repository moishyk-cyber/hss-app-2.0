"use client";

// Invoice tab (Aug 31 feedback #2: "when adding a QuickBooks invoice, ask for a
// link and the amount and invoice type"). One "Add invoice" form up top creates
// the Payment already invoiced (type + amount + optional QuickBooks link, all in
// one shot). Legacy "pending" rows from before this change still get their own
// "Mark invoiced" button so nothing already in flight gets stuck.
//
// "Mark paid" is no longer a bare one-click write (Sep 2 QA P0: a $2,500
// payment got fired by a stray click): it opens a review dialog - amount,
// invoice link, received date, method, who it's logged under - then confirms,
// logs, and offers Undo. Paid rows keep a confirm-guarded "Mark unpaid" so the
// mistake stays fixable after the toast is gone.

import { useState } from "react";
import type { PaymentGate } from "@/lib/flow";
import { addInvoice, markPaymentInvoiced, markPaymentPaid, undoMarkPaymentPaid } from "../actions";
import { fmtDate, PAYMENT_METHODS, PAYMENT_STATUS_COLORS, PAYMENT_TYPES } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { useToast } from "@/lib/toast";
import { fmtUSD } from "@/lib/money";
import { ymdToday } from "@/lib/dates";

type Payment = {
  id: string;
  type: string;
  amount: number;
  status: string;
  quickbooksRef: string | null;
  date: Date | null;
};

/** The review-then-confirm flow behind the "Mark paid" button on one payment row. */
function MarkPaidControl({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [receivedDate, setReceivedDate] = useState(ymdToday);
  const [method, setMethod] = useState("check");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await markPaymentPaid(payment.id, receivedDate, method);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast({
        kind: "success",
        message: `${fmtUSD(payment.amount, { cents: true })} ${payment.type} payment marked paid`,
        actionLabel: "Undo",
        onAction: () => undoMarkPaymentPaid(payment.id),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm active:scale-[0.99]"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        Mark paid…
      </button>
      <ConfirmDialog
        open={open}
        title={`Mark this ${payment.type} payment paid?`}
        confirmLabel={`Record ${fmtUSD(payment.amount, { cents: true })} as paid`}
        pending={pending}
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <dl className="space-y-1 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-dark">Invoice</dt>
              <dd className="text-ink capitalize">
                {payment.type}
                {payment.quickbooksRef ? (
                  <>
                    {" · "}
                    <a
                      href={payment.quickbooksRef}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue hover:underline"
                    >
                      View in QuickBooks
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-dark">Amount</dt>
              <dd className="font-semibold text-ink">{fmtUSD(payment.amount, { cents: true })}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Received on</span>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="input-klyne w-full px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="field-label">Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="input-klyne w-full px-2 py-1.5 text-xs"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-gray">
            Logged to the activity log under your &ldquo;Working as&rdquo; name. You can undo this
            afterwards - nothing is final.
          </p>
          {error ? (
            <div role="alert" className="banner-alert">
              {error}
            </div>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  );
}

/** Confirm-guarded revert for a payment already marked paid. */
function UnmarkPaidControl({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await undoMarkPaymentPaid(payment.id);
      setOpen(false);
      if (result.ok) {
        toast({ kind: "info", message: "Payment moved back to invoiced" });
      } else {
        toast({ kind: "error", message: result.message });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <span className="text-xs text-gray-dark">Paid {fmtDate(payment.date)}</span>
      <button
        type="button"
        className="text-xs text-gray transition-colors hover:text-ink hover:underline"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Mark unpaid
      </button>
      <ConfirmDialog
        open={open}
        title="Move this payment back to invoiced?"
        confirmLabel="Mark unpaid"
        danger
        pending={pending}
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
      >
        The {fmtUSD(payment.amount, { cents: true })} {payment.type} payment goes back to
        &ldquo;invoiced&rdquo; and its paid date is cleared. The change is logged.
      </ConfirmDialog>
    </>
  );
}

export default function PaymentsSection({
  orderId,
  payments,
  gate,
}: {
  orderId: string;
  payments: Payment[];
  gate: PaymentGate;
}) {
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(payments.length === 0);
  const { toast } = useToast();

  async function handleAddInvoice(formData: FormData) {
    const type = String(formData.get("type") ?? "deposit");
    const amt = String(formData.get("amount") ?? "");
    const link = String(formData.get("quickbooksLink") ?? "");
    if (!amt) {
      setError("Enter the invoice amount.");
      return;
    }
    setError(null);
    const result = await addInvoice(orderId, type, parseFloat(amt), link);
    if (result.ok) {
      setShowAdd(false);
      toast({ kind: "success", message: `${type} invoice added` });
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-sm font-medium text-ink">
        {gate.exempt
          ? gate.reason
          : gate.requiredTotal != null
          ? `Required ${fmtUSD(gate.requiredTotal)} · Paid ${fmtUSD(gate.paidTotal)} · Outstanding ${fmtUSD(gate.shortfall)}${
              gate.invoiced ? "" : " · Nothing invoiced yet"
            }`
          : gate.open
          ? "Payment received"
          : gate.reason}
      </div>

      {payments.length === 0 ? (
        <div className="empty-state">
          No invoices recorded yet. Add one below to unlock purchase orders.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-16 shrink-0 capitalize text-sm text-ink">{p.type}</span>
                <span className="text-sm text-gray-dark">{fmtUSD(p.amount, { cents: true })}</span>
                <span className={`badge ${PAYMENT_STATUS_COLORS[p.status] ?? "badge-gray"}`}>{p.status}</span>
                {p.quickbooksRef && (
                  <a
                    href={p.quickbooksRef}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue transition-colors hover:underline"
                  >
                    View in QuickBooks
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                {p.status === "pending" && (
                  <ActionButton action={() => markPaymentInvoiced(p.id)} className="btn btn-sm active:scale-[0.99]">
                    Mark invoiced
                  </ActionButton>
                )}
                {p.status === "invoiced" && <MarkPaidControl payment={p} />}
                {p.status === "paid" && <UnmarkPaidControl payment={p} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="banner-alert">
          {error}
        </div>
      )}

      {showAdd ? (
        <form action={handleAddInvoice} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-panel p-3">
          <label>
            <span className="field-label">Invoice type</span>
            <select name="type" defaultValue="deposit" className="input-klyne">
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Amount</span>
            <input type="number" step="0.01" min="0.01" required name="amount" className="input-klyne w-28" />
          </label>
          <label>
            <span className="field-label">QuickBooks link</span>
            <input
              type="url"
              name="quickbooksLink"
              placeholder="https://…"
              className="input-klyne w-56"
            />
          </label>
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99] disabled:opacity-50" pendingText="Adding…">
            Add invoice
          </PendingButton>
          {payments.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <button type="button" className="btn btn-sm active:scale-[0.99]" onClick={() => setShowAdd(true)}>
          + Add invoice
        </button>
      )}
    </div>
  );
}
