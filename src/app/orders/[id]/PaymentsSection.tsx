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
        <div className="rounded border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">
          No payments recorded yet.
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 pr-3 font-medium">Amount</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium">QB Ref</th>
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 pr-3 capitalize text-gray-700">{p.type}</td>
                <td className="py-1.5 pr-3 text-gray-700">${p.amount.toLocaleString()}</td>
                <td className="py-1.5 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[p.status] ?? ""}`}>
                    {p.status}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-gray-500">{p.quickbooksRef ?? "—"}</td>
                <td className="py-1.5 pr-3 text-gray-500">{fmtDate(p.date)}</td>
                <td className="py-1.5 pr-3">
                  <div className="flex gap-2">
                    {p.status === "pending" && (
                      <button
                        disabled={pending}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
                        onClick={() => startTransition(() => markPaymentInvoiced(p.id))}
                      >
                        Mark invoiced
                      </button>
                    )}
                    {p.status !== "paid" && (
                      <button
                        disabled={pending}
                        className="rounded border border-green-300 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50"
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

      <div className="flex items-end gap-2 rounded border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Type
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="deposit">Deposit</option>
            <option value="final">Final</option>
            <option value="full">Full</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Amount
          <input
            type="number"
            step="0.01"
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button
          disabled={pending || !amount}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
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
