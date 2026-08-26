"use client";

import { useState } from "react";
import { PO_STATUSES, PO_DELIVERY_STATUSES, PO_DELIVERY_STATUS_COLORS, labelFor } from "@/lib/constants";
import {
  advancePoStatus,
  createPurchaseOrder,
  setPoDeliveryStatus,
  updatePoShipmentDetails,
  updatePoTracking,
} from "../actions";
import { PO_STATUS_COLORS, fmtDate } from "../utils";
import { PendingButton, ActionButton, BadgeSelect } from "@/lib/ui";

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
  trucker: string | null;
  pickupAddress: string | null;
  scheduledDeliveryDate: Date | null;
  shipCost: number | null;
  chargedToCustomer: boolean;
  deliveryContactPhone: string | null;
  deliveryStatus: string;
  supplier: { name: string; deliveryAddress: string | null } | null;
  lineItems: PoLineItem[];
};

type UnassignedLineItem = { id: string; name: string; qty: number };
type Vendor = { id: string; name: string };

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];
const GATE_MESSAGE = "Payment gate: deposit/full payment required before POs are sent";

export default function PurchaseOrdersSection({
  orderId,
  purchaseOrders,
  unassignedLineItems,
  vendors,
  hasPaidPayment,
}: {
  orderId: string;
  purchaseOrders: Po[];
  unassignedLineItems: UnassignedLineItem[];
  vendors: Vendor[];
  hasPaidPayment: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleAdvance(poId: string, blocked: boolean) {
    if (blocked) {
      setErrors((e) => ({ ...e, [poId]: GATE_MESSAGE }));
      return;
    }
    const res = await advancePoStatus(poId);
    if (!res.ok) {
      setErrors((e) => ({ ...e, [poId]: res.message }));
    } else {
      setErrors((e) => {
        const next = { ...e };
        delete next[poId];
        return next;
      });
    }
  }

  async function handleCreatePo(formData: FormData) {
    const supplierId = String(formData.get("supplierId") ?? "");
    const lineItemIds = formData.getAll("lineItemIds").map(String);
    if (!supplierId || lineItemIds.length === 0) return;
    setCreateError(null);
    const result = await createPurchaseOrder(orderId, supplierId, lineItemIds);
    if (result.ok) {
      setCreating(false);
    } else {
      setCreateError(result.message);
    }
  }

  return (
    <div className="space-y-4">
      {unassignedLineItems.length > 0 &&
        (creating ? (
          <form action={handleCreatePo} className="space-y-3 rounded-lg border border-border bg-panel p-3">
            <div className="section-label">Create Purchase Order</div>
            <div>
              <span className="field-label">Vendor</span>
              <select name="supplierId" required className="input-klyne w-full max-w-xs">
                <option value="">— select vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label">Items</span>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                {unassignedLineItems.map((li) => (
                  <label key={li.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="lineItemIds" value={li.id} defaultChecked />
                    {li.name} <span className="text-gray">x{li.qty}</span>
                  </label>
                ))}
              </div>
            </div>
            {createError && <div className="banner-warn">{createError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Creating PO…">
                Create PO
              </PendingButton>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary btn-sm active:scale-[0.99]" onClick={() => setCreating(true)}>
            Create PO
          </button>
        ))}

      {purchaseOrders.length === 0 ? (
        <div className="empty-state">
          {unassignedLineItems.length > 0
            ? "No purchase orders yet — use the Create PO button above."
            : "No purchase orders yet. Line items will appear here once they're ready to purchase."}
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
                    <div className="text-xs text-gray-dark">{po.supplier?.name ?? "No vendor"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`badge ${PO_STATUS_COLORS[po.status] ?? "badge-gray"}`}>
                      {labelFor(PO_STATUSES, po.status)}
                    </span>
                    <BadgeSelect
                      value={po.deliveryStatus}
                      options={PO_DELIVERY_STATUSES}
                      action={(next) => setPoDeliveryStatus(po.id, next)}
                      colorMap={PO_DELIVERY_STATUS_COLORS}
                    />
                  </div>
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

                <ShipmentDetailsEdit
                  poId={po.id}
                  trucker={po.trucker}
                  pickupAddress={po.pickupAddress}
                  supplierDeliveryAddress={po.supplier?.deliveryAddress ?? null}
                  scheduledDeliveryDate={po.scheduledDeliveryDate}
                  shipCost={po.shipCost}
                  chargedToCustomer={po.chargedToCustomer}
                  deliveryContactPhone={po.deliveryContactPhone}
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
  const [error, setError] = useState<string | null>(null);

  async function handleSave(formData: FormData) {
    const url = String(formData.get("trackingUrl") ?? "");
    const carrier = String(formData.get("trackingCarrier") ?? "");
    const expected = String(formData.get("expectedDelivery") ?? "");
    const result = await updatePoTracking(poId, url, carrier, expected);
    setError(result.ok ? null : result.message);
  }

  return (
    <form action={handleSave} className="mt-3 space-y-1.5 border-t border-border pt-2">
      {error && <div className="banner-warn">{error}</div>}
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

/**
 * Real-world delivery/trucking fields, modeled 1:1 on the client's Delivery
 * Sheet: trucker (free text — a mix of couriers and named drivers, not a
 * fixed list), pickup address, scheduled delivery date, ship cost, whether
 * that cost was billed back to the customer, and the delivery-day contact
 * phone. All batched behind one "Save shipment details" button, matching the
 * TrackingEdit form above rather than saving each field individually.
 */
function ShipmentDetailsEdit({
  poId,
  trucker,
  pickupAddress,
  supplierDeliveryAddress,
  scheduledDeliveryDate,
  shipCost,
  chargedToCustomer,
  deliveryContactPhone,
}: {
  poId: string;
  trucker: string | null;
  pickupAddress: string | null;
  supplierDeliveryAddress: string | null;
  scheduledDeliveryDate: Date | null;
  shipCost: number | null;
  chargedToCustomer: boolean;
  deliveryContactPhone: string | null;
}) {
  // Prefill pickup address from the supplier's on-file address as a starting
  // point when nothing's been entered for this PO yet — still freely editable,
  // since real pickup legs vary shipment to shipment.
  const pickupDefault = pickupAddress ?? supplierDeliveryAddress ?? "";
  const scheduledDefault = scheduledDeliveryDate
    ? new Date(scheduledDeliveryDate).toISOString().slice(0, 10)
    : "";
  const [error, setError] = useState<string | null>(null);

  async function handleSave(formData: FormData) {
    const truckerVal = String(formData.get("trucker") ?? "");
    const pickupVal = String(formData.get("pickupAddress") ?? "");
    const scheduledVal = String(formData.get("scheduledDeliveryDate") ?? "");
    const shipCostVal = String(formData.get("shipCost") ?? "");
    const chargedVal = formData.get("chargedToCustomer") === "1";
    const phoneVal = String(formData.get("deliveryContactPhone") ?? "");
    const result = await updatePoShipmentDetails(
      poId,
      truckerVal,
      pickupVal,
      scheduledVal,
      shipCostVal,
      chargedVal,
      phoneVal
    );
    setError(result.ok ? null : result.message);
  }

  return (
    <form action={handleSave} className="mt-3 space-y-2 border-t border-border pt-2">
      <div className="section-label">Shipment / Trucking</div>
      {error && <div className="banner-warn">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="field-label">Trucker</span>
          <input
            name="trucker"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="e.g. ANDY, UBER, UPS DROPSHIP"
            defaultValue={trucker ?? ""}
          />
        </label>
        <label className="block">
          <span className="field-label">Delivery contact phone</span>
          <input
            type="tel"
            name="deliveryContactPhone"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="Delivery-day contact #"
            defaultValue={deliveryContactPhone ?? ""}
          />
        </label>
        <label className="col-span-2 block">
          <span className="field-label">Pickup address</span>
          <input
            name="pickupAddress"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="Pickup address"
            defaultValue={pickupDefault}
          />
        </label>
        <label className="block">
          <span className="field-label">Scheduled delivery date</span>
          <input
            type="date"
            name="scheduledDeliveryDate"
            className="input-klyne w-full px-2 py-1 text-xs"
            defaultValue={scheduledDefault}
          />
        </label>
        <label className="block">
          <span className="field-label">Ship cost</span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="shipCost"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="$0.00"
            defaultValue={shipCost ?? ""}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 pt-1 text-xs text-ink">
          <input
            type="checkbox"
            name="chargedToCustomer"
            value="1"
            defaultChecked={chargedToCustomer}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          Charged to customer?
        </label>
      </div>
      <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
        Save shipment details
      </PendingButton>
    </form>
  );
}
