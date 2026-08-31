"use client";

// Invoice tab (Aug 31 feedback: "the whole QuickBooks invoice thing is very
// complicated... make it extremely straightforward"). One summary line, plain
// payment rows with a single next-step button each, and one clean QuickBooks
// invoice-number row — the only place that field lives now (removed from the
// order header meta grid).

import { useState } from "react";
import type { PaymentGate } from "@/lib/flow";
import { addPayment, markPaymentInvoiced, markPaymentPaid } from "../actions";
import { fmtDate, PAYMENT_STATUS_COLORS } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";
import { QbInvoiceEdit } from "./OrderHeaderControls";

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
  quickbooksInvoiceNo,
}: {
  orderId: string;
  payments: Payment[];
  gate: PaymentGate;
  quickbooksInvoiceNo: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function handleAddPayment(formData: FormData) {
    const type = String(formData.get("type") ?? "deposit");
    const amt = String(formData.get("amount") ?? "");
    if (!amt) return;
    setError(null);
    const result = await addPayment(orderId, type, parseFloat(amt));
    if (result.ok) {
      setAmount("");
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
          No payments recorded yet. Record the deposit or full payment below to unlock purchase orders.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 capitalize text-sm text-ink">{p.type}</span>
                <span className="text-sm text-gray-dark">${p.amount.toLocaleString()}</span>
                <span className={`badge ${PAYMENT_STATUS_COLORS[p.status] ?? "badge-gray"}`}>{p.status}</span>
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
        <form action={handleAddPayment} className="flex flex-wrap items-end gap-2">
          <label>
            <span className="field-label">Type</span>
            <select name="type" defaultValue="deposit" className="input-klyne">
              <option value="deposit">Deposit</option>
              <option value="final">Final</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label>
            <span className="field-label">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              name="amount"
              className="input-klyne w-28"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99] disabled:opacity-50" pendingText="Adding…">
            Add payment
          </PendingButton>
          <button type="button" className="btn btn-sm" onClick={() => setShowAdd(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-sm active:scale-[0.99]" onClick={() => setShowAdd(true)}>
          + Add payment
        </button>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <span className="field-label" style={{ marginBottom: 0 }}>
          QuickBooks invoice #
        </span>
        <QbInvoiceEdit orderId={orderId} value={quickbooksInvoiceNo} />
      </div>
    </div>
  );
}
