"use client";

import { useState } from "react";
import type { PaymentGate } from "@/lib/flow";
import { addPayment, markPaymentInvoiced, markPaymentPaid } from "../actions";
import { fmtDate, PAYMENT_STATUS_COLORS } from "../utils";
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
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAddPayment(formData: FormData) {
    const type = String(formData.get("type") ?? "deposit");
    const amt = String(formData.get("amount") ?? "");
    if (!amt) return;
    setError(null);
    const result = await addPayment(orderId, type, parseFloat(amt));
    if (result.ok) {
      setAmount("");
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="space-y-3">
      {gate.exempt ? (
        <div className="text-xs text-gray-dark">{gate.reason}</div>
      ) : gate.requiredTotal != null ? (
        <div className="text-xs text-gray-dark">
          Required: ${gate.requiredTotal.toLocaleString()} · Paid: ${gate.paidTotal.toLocaleString()} · Outstanding: $
          {gate.shortfall.toLocaleString()}
        </div>
      ) : null}

      {payments.length === 0 ? (
        <div className="empty-state">
          No payments recorded yet. Record the deposit or full payment below to unlock purchase orders.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-klyne">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>QB Ref</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="transition-colors">
                  <td className="capitalize text-gray-dark">{p.type}</td>
                  <td className="text-gray-dark">${p.amount.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${PAYMENT_STATUS_COLORS[p.status] ?? "badge-gray"}`}>{p.status}</span>
                  </td>
                  <td className="text-gray">
                    {p.quickbooksRef ?? <span className="empty-value">not synced</span>}
                  </td>
                  <td className="text-gray">{fmtDate(p.date)}</td>
                  <td>
                    <div className="flex gap-2">
                      {p.status === "pending" && (
                        <ActionButton
                          action={() => markPaymentInvoiced(p.id)}
                          className="btn btn-sm active:scale-[0.99]"
                        >
                          Mark invoiced
                        </ActionButton>
                      )}
                      {p.status !== "paid" && (
                        <ActionButton
                          action={() => markPaymentPaid(p.id)}
                          className="btn btn-primary btn-sm active:scale-[0.99]"
                        >
                          Mark paid
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="banner-warn">{error}</div>}

      <form action={handleAddPayment} className="card-sunken flex items-end gap-2">
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
      </form>
    </div>
  );
}
