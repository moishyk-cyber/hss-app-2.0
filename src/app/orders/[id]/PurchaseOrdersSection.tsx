"use client";

import { useState } from "react";
import { PO_STATUSES, labelFor } from "@/lib/constants";
import { advancePoStatus, createPurchaseOrder, updatePoTracking } from "../actions";
import { PO_STATUS_COLORS, fmtDate } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";

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
const GATE_MESSAGE = "Payment gate: deposit/full payment required before POs are sent";

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
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleAdvance(poId: string, blocked: boolean) {
    if (blocked) {
      setErrors((e) => ({ ...e, [poId]: GATE_MESSAGE }));
      return;
    }
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
  }

  async function handleCreatePo(supplierId: string) {
    await createPurchaseOrder(orderId, supplierId);
  }

  return (
    <div className="space-y-4">
      {unassignedGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unassignedGroups.map((g) => (
            <form key={g.supplierId} action={() => handleCreatePo(g.supplierId)}>
              <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Creating PO…">
                Create PO for {g.supplierName} ({g.count} items)
              </PendingButton>
            </form>
          ))}
        </div>
      )}

      {purchaseOrders.length === 0 ? (
        <div className="empty-state">
          {unassignedGroups.length > 0
            ? "No purchase orders yet — use the buttons above to create one per supplier."
            : "No purchase orders yet. Assign suppliers to line items in the RFQ Queue first."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {purchaseOrders.map((po) => {
            const idx = PO_ORDER.indexOf(po.status);
            const next = idx >= 0 && idx < PO_ORDER.length - 1 ? PO_ORDER[idx + 1] : null;
            const blocked = po.status === "draft" && !hasPaidPayment;
            return (
              <div key={po.id} className="rounded-lg border border-border bg-panel p-3 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-ink">{po.poNumber ?? "(no PO#)"}</div>
                    <div className="text-xs text-gray-dark">{po.supplier?.name ?? "No supplier"}</div>
                  </div>
                  <span className={`badge ${PO_STATUS_COLORS[po.status] ?? "badge-gray"}`}>
                    {labelFor(PO_STATUSES, po.status)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-gray-dark">
                  Ship to: {po.shipTo === "hss" ? "HSS warehouse" : "Client direct"}
                </div>
                <div className="mt-1 text-xs text-gray-dark">
                  Sent: {fmtDate(po.sentDate)} · Ack: {fmtDate(po.ackDate)} · Expected: {fmtDate(po.expectedDelivery)}
                </div>

                <ul className="mt-2 space-y-0.5 text-sm text-ink">
                  {po.lineItems.map((li) => (
                    <li key={li.id}>
                      {li.name} <span className="text-gray">x{li.qty}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center gap-2">
                  {next && (
                    <ActionButton
                      action={() => handleAdvance(po.id, blocked)}
                      className={`btn btn-sm active:scale-[0.99] ${blocked ? "opacity-60" : ""}`}
                    >
                      Advance to {labelFor(PO_STATUSES, next)}
                    </ActionButton>
                  )}
                </div>
                {errors[po.id] && <div className="banner-warn mt-2">{errors[po.id]}</div>}

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
  const expectedDefault = expectedDelivery ? new Date(expectedDelivery).toISOString().slice(0, 10) : "";

  async function handleSave(formData: FormData) {
    const url = String(formData.get("trackingUrl") ?? "");
    const carrier = String(formData.get("trackingCarrier") ?? "");
    const expected = String(formData.get("expectedDelivery") ?? "");
    await updatePoTracking(poId, url, carrier, expected);
  }

  return (
    <form action={handleSave} className="mt-3 space-y-1.5 border-t border-border pt-2">
      <div className="flex gap-1.5">
        <input
          name="trackingUrl"
          className="input-klyne min-w-0 flex-1 px-2 py-1 text-xs"
          placeholder="Tracking URL"
          defaultValue={trackingUrl ?? ""}
        />
        <input
          name="trackingCarrier"
          className="input-klyne w-24 px-2 py-1 text-xs"
          placeholder="Carrier"
          defaultValue={trackingCarrier ?? ""}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          name="expectedDelivery"
          className="input-klyne px-2 py-1 text-xs"
          defaultValue={expectedDefault}
        />
        <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
          Save
        </PendingButton>
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue transition-colors hover:underline"
          >
            Open tracking
          </a>
        )}
      </div>
    </form>
  );
}
