"use client";

import { useState, useTransition } from "react";
import { addPayment, markPaymentInvoiced, markPaymentPaid } from "../actions";
import { fmtDate, PAYMENT_STATUS_COLORS } from "../utils";

type Payment = {
  id: string;
  type: string;
  amount: number;
  status: string;
  quickbooksRef: string | null;
  date: Date | null;
};

export default function PaymentsSection({ orderId, payments }: { orderId: string; payments: Payment[] }) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("deposit");
  const [amount, setAmount] = useState("");

  return (
    <div className="space-y-3">
      {payments.length === 0 ? (
        <div className="empty-state">No payments recorded yet.</div>
      ) : (
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
              <tr key={p.id}>
                <td className="capitalize text-gray-dark">{p.type}</td>
                <td className="text-gray-dark">${p.amount.toLocaleString()}</td>
                <td>
                  <span className={`badge ${PAYMENT_STATUS_COLORS[p.status] ?? "badge-gray"}`}>{p.status}</span>
                </td>
                <td className="text-gray">{p.quickbooksRef ?? "—"}</td>
                <td className="text-gray">{fmtDate(p.date)}</td>
                <td>
                  <div className="flex gap-2">
                    {p.status === "pending" && (
                      <button
                        disabled={pending}
                        className="btn btn-sm"
                        onClick={() => startTransition(() => markPaymentInvoiced(p.id))}
                      >
                        Mark invoiced
                      </button>
                    )}
                    {p.status !== "paid" && (
                      <button
                        disabled={pending}
                        className="btn btn-primary btn-sm"
                        onClick={() => startTransition(() => markPaymentPaid(p.id))}
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-end gap-2 rounded-lg border border-border bg-panel p-3">
        <label>
          <span className="field-label">Type</span>
          <select className="input-klyne" value={type} onChange={(e) => setType(e.target.value)}>
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
            className="input-klyne w-28"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button
          disabled={pending || !amount}
          className="btn btn-primary btn-sm disabled:opacity-50"
          onClick={() =>
            startTransition(() => {
              addPayment(orderId, type, parseFloat(amount));
              setAmount("");
            })
          }
        >
          Add payment
        </button>
      </div>
    </div>
  );
}
