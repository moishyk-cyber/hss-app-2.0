"use client";

// Invoice tab (Aug 31 feedback #2: "when adding a QuickBooks invoice, ask for a
// link and the amount and invoice type"). One "Add invoice" form up top creates
// the Payment already invoiced (type + amount + optional QuickBooks link, all in
// one shot) - no separate "record payment" then "mark invoiced" step, and no
// separate order-level QuickBooks invoice # field anymore (that row is gone).
// Legacy "pending" rows from before this change still get their own
// "Mark invoiced" button so nothing already in flight gets stuck.

import { useState } from "react";
import type { PaymentGate } from "@/lib/flow";
import { addInvoice, markPaymentInvoiced, markPaymentPaid } from "../actions";
import { fmtDate, PAYMENT_STATUS_COLORS, PAYMENT_TYPES } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";

type Payment = {
  id: string;
  type: string;
  amount: number;
  status: string;
  quickbooksRef: string | null;
  date: Date | null;
};

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

  async function handleAddInvoice(formData: FormData) {
    const type = String(formData.get("type") ?? "deposit");
    const amt = String(formData.get("amount") ?? "");
    const link = String(formData.get("quickbooksLink") ?? "");
    if (!amt) return;
    setError(null);
    const result = await addInvoice(orderId, type, parseFloat(amt), link);
    if (result.ok) {
      setShowAdd(false);
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
          ? `Required $${gate.requiredTotal.toLocaleString()} · Paid $${gate.paidTotal.toLocaleString()} · Outstanding $${gate.shortfall.toLocaleString()}`
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
                <span className="text-sm text-gray-dark">${p.amount.toLocaleString()}</span>
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
              <div>
                {p.status === "pending" && (
                  <ActionButton action={() => markPaymentInvoiced(p.id)} className="btn btn-sm active:scale-[0.99]">
                    Mark invoiced
                  </ActionButton>
                )}
                {p.status === "invoiced" && (
                  <ActionButton
                    action={() => markPaymentPaid(p.id)}
                    className="btn btn-primary btn-sm active:scale-[0.99]"
                  >
                    Mark paid
                  </ActionButton>
                )}
                {p.status === "paid" && <span className="text-xs text-gray-dark">Paid {fmtDate(p.date)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="banner-warn">{error}</div>}

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
