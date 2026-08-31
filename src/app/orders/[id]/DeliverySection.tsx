"use client";

// Delivery tab (Aug 31 feedback: "a delivery tab" under each order). Reads
// top-to-bottom: the line-items table first (per-item delivery status,
// arrival dates, backorder date, assignee, and the add-item form), then each
// PO's real-world delivery-day info — trucker, pickup address, scheduled
// delivery date, ship cost, delivery-day contact — plus that PO's own
// delivery-status pill. PO status ladder / sent-aging / carrier tracking stay
// on the Purchase Orders tab; this tab is the delivery-day view only.

import { useState } from "react";
import { PO_DELIVERY_STATUSES, PO_DELIVERY_STATUS_COLORS } from "@/lib/constants";
import { setPoDeliveryStatus, updatePoShipmentDetails } from "../actions";
import { PendingButton, BadgeSelect } from "@/lib/ui";
import LineItemsSection from "./LineItemsSection";

type Item = {
  id: string;
  name: string;
  qty: number;
  unitCost: number | null;
  deliveryStatus: string;
  backorderExpected: Date | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
  dateOrdered: Date | null;
  dateArrivedHss: Date | null;
  dateArrivedClient: Date | null;
  trackingUrl: string | null;
};

type Po = {
  id: string;
  poNumber: string | null;
  deliveryStatus: string;
  trucker: string | null;
  pickupAddress: string | null;
  scheduledDeliveryDate: Date | null;
  shipCost: number | null;
  chargedToCustomer: boolean;
  deliveryContactPhone: string | null;
  supplier: { name: string; deliveryAddress: string | null } | null;
};

export default function DeliverySection({
  orderId,
  items,
  users,
  purchaseOrders,
}: {
  orderId: string;
  items: Item[];
  users: { id: string; name: string }[];
  purchaseOrders: Po[];
}) {
  return (
    <div className="space-y-6">
      <LineItemsSection orderId={orderId} items={items} users={users} />

      {purchaseOrders.length > 0 && (
        <div className="space-y-3">
          <h3 className="section-label">Delivery by Purchase Order</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {purchaseOrders.map((po) => (
              <div key={po.id} className="rounded-lg border border-border bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-ink">{po.poNumber ?? "(no PO#)"}</div>
                    <div className="text-xs text-gray-dark">{po.supplier?.name ?? "No vendor"}</div>
                  </div>
                  <BadgeSelect
                    value={po.deliveryStatus}
                    options={PO_DELIVERY_STATUSES}
                    action={(next) => setPoDeliveryStatus(po.id, next)}
                    colorMap={PO_DELIVERY_STATUS_COLORS}
                  />
                </div>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Real-world delivery/trucking fields, modeled 1:1 on the client's Delivery
 * Sheet: trucker (free text — a mix of couriers and named drivers, not a
 * fixed list), pickup address, scheduled delivery date, ship cost, whether
 * that cost was billed back to the customer, and the delivery-day contact
 * phone. All batched behind one "Save shipment details" button.
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
      {error && <div className="banner-warn">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
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
          <span className="field-label">Trucker</span>
          <input
            name="trucker"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="e.g. ANDY, UBER, UPS DROPSHIP"
            defaultValue={trucker ?? ""}
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
          <span className="field-label">Delivery contact phone</span>
          <input
            type="tel"
            name="deliveryContactPhone"
            className="input-klyne w-full px-2 py-1 text-xs"
            placeholder="Delivery-day contact #"
            defaultValue={deliveryContactPhone ?? ""}
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
