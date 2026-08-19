"use client";

import { useState, useTransition } from "react";
import { PO_STATUSES, labelFor } from "@/lib/constants";
import { advancePoStatus, createPurchaseOrder, updatePoTracking } from "../actions";
import { PO_STATUS_COLORS, fmtDate } from "../utils";

type PoLineItem = { id: string; name: string; qty: number };
type Po = {
  id: string;
  poNumber: string | null;
  status: string;
  shipTo: string;
  sentDate: Date | null;
  ackDate: Date | null;
  trackingUrl: string | null;
  trackingCarrier: string | null;
  expectedDelivery: Date | null;
  supplier: { name: string } | null;
  lineItems: PoLineItem[];
};

type UnassignedGroup = { supplierId: string; supplierName: string; count: number };

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];

export default function PurchaseOrdersSection({
  orderId,
  purchaseOrders,
  unassignedGroups,
  hasPaidPayment,
}: {
  orderId: string;
  purchaseOrders: Po[];
  unassignedGroups: UnassignedGroup[];
  hasPaidPayment: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleAdvance(poId: string) {
    startTransition(async () => {
      const res = await advancePoStatus(poId);
      if (res && !res.ok) {
        setErrors((e) => ({ ...e, [poId]: res.message ?? "Could not advance" }));
      } else {
        setErrors((e) => {
          const next = { ...e };
          delete next[poId];
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {unassignedGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unassignedGroups.map((g) => (
            <button
              key={g.supplierId}
              disabled={pending}
              className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              onClick={() => startTransition(() => createPurchaseOrder(orderId, g.supplierId))}
            >
              Create PO for {g.supplierName} ({g.count} items)
            </button>
          ))}
        </div>
      )}

      {purchaseOrders.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">
          No purchase orders yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {purchaseOrders.map((po) => {
            const idx = PO_ORDER.indexOf(po.status);
            const next = idx >= 0 && idx < PO_ORDER.length - 1 ? PO_ORDER[idx + 1] : null;
            const blocked = po.status === "draft" && !hasPaidPayment;
            return (
              <div key={po.id} className="rounded border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{po.poNumber ?? "(no PO#)"}</div>
                    <div className="text-xs text-gray-500">{po.supplier?.name ?? "No supplier"}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      PO_STATUS_COLORS[po.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {labelFor(PO_STATUSES, po.status)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  Ship to: {po.shipTo === "hss" ? "HSS warehouse" : "Client direct"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Sent: {fmtDate(po.sentDate)} · Ack: {fmtDate(po.ackDate)} · Expected: {fmtDate(po.expectedDelivery)}
                </div>

                <ul className="mt-2 space-y-0.5 text-sm text-gray-700">
                  {po.lineItems.map((li) => (
                    <li key={li.id}>
                      {li.name} <span className="text-gray-400">x{li.qty}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center gap-2">
                  {next && (
                    <button
                      disabled={pending || blocked}
                      title={blocked ? "Payment gate: deposit/full payment required before POs are sent" : undefined}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleAdvance(po.id)}
                    >
                      Advance to {labelFor(PO_STATUSES, next)}
                    </button>
                  )}
                </div>
                {errors[po.id] && (
                  <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{errors[po.id]}</div>
                )}

                <TrackingEdit
                  poId={po.id}
                  trackingUrl={po.trackingUrl}
                  trackingCarrier={po.trackingCarrier}
                  expectedDelivery={po.expectedDelivery}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrackingEdit({
  poId,
  trackingUrl,
  trackingCarrier,
  expectedDelivery,
}: {
  poId: string;
  trackingUrl: string | null;
  trackingCarrier: string | null;
  expectedDelivery: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [carrier, setCarrier] = useState(trackingCarrier ?? "");
  const [expected, setExpected] = useState(
    expectedDelivery ? new Date(expectedDelivery).toISOString().slice(0, 10) : ""
  );
  const dirty =
    url !== (trackingUrl ?? "") ||
    carrier !== (trackingCarrier ?? "") ||
    expected !== (expectedDelivery ? new Date(expectedDelivery).toISOString().slice(0, 10) : "");

  return (
    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
      <div className="flex gap-1.5">
        <input
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Tracking URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Carrier"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
        {dirty && (
          <button
            disabled={pending}
            className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700"
            onClick={() => startTransition(() => updatePoTracking(poId, url, carrier, expected))}
          >
            Save
          </button>
        )}
        {trackingUrl && (
          <a href={trackingUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
            Open tracking
          </a>
        )}
      </div>
    </div>
  );
}
