"use client";

// Order delivery rows link to full delivery pages; shipment fields follow the delivery mode.

import { PickupLocationDropdown } from "@/lib/LocationDropdown";
import { PartnerInput } from "@/app/deliveries/PartnerInput";
import { DeliveryDestination } from "./DeliveryDestination";
import type { DeliveryDestination as Destination } from "@/lib/deliveryDestination";
import { MoneyInput } from "@/lib/MoneyInput";

import { useState } from "react";
import { SectionLink as Link } from "@/lib/SectionLink";
import { BackLink } from "@/lib/BackLink";
import { FormFooter } from "@/lib/PageLayout";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_COLORS,
  DELIVERY_LEG_STATUSES,
  DELIVERY_LEG_STATUS_COLORS,
  labelFor,
} from "@/lib/constants";
import {
  createDelivery,
  setDeliveryStatus,
  updateDelivery,
} from "@/lib/workflowActions";
import { PendingButton, BadgeSelect, ActionButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtDate, isLikelyTrackingUrl } from "../utils";
import { hasCarrierLeg, hasTruckerLeg, manufacturerShipmentStatus } from "../../deliveries/_ui";

type Item = {
  id: string;
  name: string;
  qty: number;
  purchaseOrderId: string | null;
  deliveryId: string | null;
  rfqStatus: string;
};

type DeliveryItem = { deliveryStatus: string };

type Delivery = {
  id: string;
  mode: string;
  status: string;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  expectedDelivery: Date | null;
  trucker: string | null;
  pickupAddress: string | null;
  scheduledDeliveryDate: Date | null;
  shipCost: number | null;
  chargedToCustomer: boolean;
  deliveryContactPhone: string | null;
  deliveredAt: Date | null;
  notes: string | null;
  purchaseOrder: {
    id: string;
    poNumber: string | null;
    supplier: { name: string; deliveryAddress: string | null } | null;
  } | null;
  lineItems: DeliveryItem[];
};

function deliveryTitle(d: Delivery): string {
  return d.purchaseOrder ? d.purchaseOrder.poNumber ?? "(no PO#)" : "HSS stock delivery";
}

function dateInputValue(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export default function DeliverySection({
  orderId,
  items,
  deliveries,
  destination,
}: {
  orderId: string;
  items: Item[];
  deliveries: Delivery[];
  destination: Destination;
}) {
  const [showStockForm, setShowStockForm] = useState(false);

  // Items that belong to no leg yet AND sit on no PO: exactly what an
  // HSS-stock delivery is made of (anything on a PO already has that PO's leg).
  const stockCandidates = items.filter(
    (i) => i.rfqStatus !== "removed" && !i.deliveryId && !i.purchaseOrderId
  );

  return (
    <div className="space-y-6">
      <DeliveryDestination orderId={orderId} destination={destination} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-label">Deliveries</h3>
          {stockCandidates.length > 0 && !showStockForm && (
            <button type="button" className="btn btn-sm active:scale-[0.99]" onClick={() => setShowStockForm(true)}>
              + New delivery (from HSS stock)
            </button>
          )}
        </div>

        {showStockForm && (
          <StockDeliveryForm
            orderId={orderId}
            candidates={stockCandidates}
            onDone={() => setShowStockForm(false)}
          />
        )}

        {deliveries.length === 0 ? (
          <div className="empty-state">
            No deliveries yet. A purchase order becomes a delivery when you acknowledge it, or start one here from HSS
            stock.
          </div>
        ) : (
          <div className="card card-flush overflow-hidden">
            <ul className="divide-y divide-border">
              {deliveries.map((d) => (
                <DeliveryRow key={d.id} delivery={d} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** One compact line per delivery leg - click anywhere on it to open the full form. */
function DeliveryRow({ delivery }: { delivery: Delivery }) {
  const manufacturerStatus = manufacturerShipmentStatus(delivery);
  return (
    <li className="relative space-y-3 px-4 py-3 transition-colors hover:bg-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link fullPage href={`/deliveries/${delivery.id}`} className="font-medium text-ink after:absolute after:inset-0">{deliveryTitle(delivery)}</Link>
          <div className="mt-1 text-xs text-gray-dark">{delivery.purchaseOrder?.supplier?.name ?? "HSS stock"}</div>
        </div>
        <span className="relative z-10 shrink-0">
          <BadgeSelect value={delivery.status} options={DELIVERY_LEG_STATUSES}
            action={(next) => setDeliveryStatus(delivery.id, next)}
            colorMap={DELIVERY_LEG_STATUS_COLORS} ariaLabel="Change delivery status" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-dark">
        <span className={`badge ${DELIVERY_MODE_COLORS[delivery.mode] ?? "badge-gray"}`}>{labelFor(DELIVERY_MODES, delivery.mode)}</span>
        {manufacturerStatus && <span title="Manufacturer shipment">{manufacturerStatus}</span>}
        {hasCarrierLeg(delivery.mode) && <>
          <span>Carrier: {delivery.trackingCarrier ?? "not set"}</span>
          <span>Expected: {fmtDate(delivery.expectedDelivery)}</span>
        </>}
        {hasTruckerLeg(delivery.mode) && <>
          <span>Trucker: {delivery.trucker ?? "not assigned"}</span>
          <span>Scheduled: {delivery.scheduledDeliveryDate ? fmtDate(delivery.scheduledDeliveryDate) : "not set"}</span>
        </>}
        {delivery.trackingUrl && isLikelyTrackingUrl(delivery.trackingUrl) ? (
          <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className="relative z-10 text-blue hover:underline">Track shipment</a>
        ) : <span className="empty-value">No tracking link</span>}
      </div>
    </li>
  );
}

/** Delivery record editor focused on shipment and delivery tracking. */
export function DeliveryDetail({ delivery, orderId, destination }: { delivery: Delivery; orderId: string; destination: Destination }) {
  const delivered = delivery.status === "delivered_full";

  return (
    <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Delivery status
            </span>
            <BadgeSelect
              value={delivery.status}
              options={DELIVERY_LEG_STATUSES}
              action={(next) => setDeliveryStatus(delivery.id, next)}
              colorMap={DELIVERY_LEG_STATUS_COLORS}
              ariaLabel="Change delivery status"
            />
          </label>
          {delivery.deliveredAt ? (
            <span className="text-xs text-gray-dark">Delivered {fmtDate(delivery.deliveredAt)}</span>
          ) : null}
          {!delivered && (
            <ActionButton
              action={() => setDeliveryStatus(delivery.id, "delivered_full")}
              className="btn btn-sm active:scale-[0.99]"
            >
              Mark delivered
            </ActionButton>
          )}
        </div>

        <DeliveryDestination orderId={orderId} destination={destination} />
        <DeliveryDetailsForm delivery={delivery} />

    </div>
  );
}

/**
 * Real-world delivery fields, modeled 1:1 on the client's Delivery Sheet, shown
 * per leg: the manufacturer's shipment (carrier, tracking link, ETA) for the
 * manufacturer_* modes, and HSS's own run (trucker, pickup address, scheduled
 * date, ship cost, whether it was billed back, day-of contact phone) for the
 * modes that go out through HSS. Mode 3 has both. All batched behind one save.
 */
function DeliveryDetailsForm({ delivery }: { delivery: Delivery }) {
  const [mode, setMode] = useState(delivery.mode);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Prefill the pickup address from the supplier's on-file address as a
  // starting point - still freely editable, since real pickup legs vary.

  async function handleSave(formData: FormData) {
    const result = await updateDelivery(delivery.id, {
      mode: String(formData.get("mode") ?? ""),
      trackingCarrier: String(formData.get("trackingCarrier") ?? ""),
      trackingUrl: String(formData.get("trackingUrl") ?? ""),
      expectedDelivery: String(formData.get("expectedDelivery") ?? ""),
      trucker: String(formData.get("trucker") ?? ""),
      pickupAddress: String(formData.get("pickupAddress") ?? ""),
      scheduledDeliveryDate: String(formData.get("scheduledDeliveryDate") ?? ""),
      shipCost: String(formData.get("shipCost") ?? ""),
      chargedToCustomer: formData.get("chargedToCustomer") === "1",
      deliveryContactPhone: String(formData.get("deliveryContactPhone") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    setError(result.ok ? null : result.message);
    if (result.ok) toast({ kind: "success", message: "Delivery details saved" });
  }

  return (
    <form action={handleSave} className="space-y-2 border-t border-border pt-4">
      {error && <div className="banner-warn">{error}</div>}

      <label className="block">
        <span className="field-label">Delivery mode</span>
        <select
          name="mode"
          className="input-klyne w-full px-2 py-1 text-xs"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          {DELIVERY_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {hasCarrierLeg(mode) && (
        <fieldset className="space-y-2 rounded-lg border border-border p-2.5">
          <legend className="field-label px-1">Manufacturer shipment</legend>
          <p className="text-sm text-ink">Shipment status: {manufacturerShipmentStatus({ ...delivery, mode })}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Carrier</span>
              <PartnerInput kind="carriers"
                name="trackingCarrier"
                className="input-klyne w-full px-2 py-1 text-xs"
                defaultValue={delivery.trackingCarrier ?? ""}
              />
            </label>
            <label className="block">
              <span className="field-label">Expected delivery</span>
              <input
                type="date"
                name="expectedDelivery"
                className="input-klyne w-full px-2 py-1 text-xs"
                defaultValue={dateInputValue(delivery.expectedDelivery)}
              />
            </label>
            <label className="col-span-2 block">
              <span className="field-label">Tracking URL</span>
              <input
                name="trackingUrl"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="https://…"
                defaultValue={delivery.trackingUrl ?? ""}
              />
            </label>
          </div>
        </fieldset>
      )}

      {hasTruckerLeg(mode) && (
        <fieldset className="space-y-2 rounded-lg border border-border p-2.5">
          <legend className="field-label px-1">HSS to the customer</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Scheduled delivery date</span>
              <input
                type="date"
                name="scheduledDeliveryDate"
                className="input-klyne w-full px-2 py-1 text-xs"
                defaultValue={dateInputValue(delivery.scheduledDeliveryDate)}
              />
            </label>
            <label className="block">
              <span className="field-label">Trucker</span>
              <PartnerInput kind="truckers"
                name="trucker"
                className="input-klyne w-full px-2 py-1 text-xs"
                defaultValue={delivery.trucker ?? ""}
              />
            </label>
<PickupLocationDropdown current={delivery.pickupAddress} supplierAddress={delivery.purchaseOrder?.supplier?.deliveryAddress} />
            <label className="block">
              <span className="field-label">Delivery contact phone</span>
              <input
                type="tel"
                name="deliveryContactPhone"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="Delivery-day contact #"
                defaultValue={delivery.deliveryContactPhone ?? ""}
              />
            </label>
            <label className="block">
              <span className="field-label">Ship cost</span>
              <MoneyInput
                min="0"
                name="shipCost"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="$0.00"
                defaultValue={delivery.shipCost ?? ""}
              />
            </label>
            <label className="col-span-2 flex items-center gap-2 pt-1 text-xs text-ink">
              <input
                type="checkbox"
                name="chargedToCustomer"
                value="1"
                defaultChecked={delivery.chargedToCustomer}
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Charged to customer?
            </label>
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="field-label">Notes</span>
        <input
          name="notes"
          className="input-klyne w-full px-2 py-1 text-xs"
          placeholder="Anything the driver or the office needs to know"
          defaultValue={delivery.notes ?? ""}
        />
      </label>

      <FormFooter>
        <BackLink href="/deliveries" label="Cancel" className="btn"/>
        <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
          Save delivery details
        </PendingButton>
      </FormFooter>
    </form>
  );
}

/** "New delivery (from HSS stock)": a PO-less leg for items HSS already has. */
function StockDeliveryForm({
  orderId,
  candidates,
  onDone,
}: {
  orderId: string;
  candidates: { id: string; name: string; qty: number }[];
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleCreate(formData: FormData) {
    const lineItemIds = formData.getAll("lineItemIds").map(String);
    if (lineItemIds.length === 0) {
      setError("Tick at least one item for this delivery.");
      return;
    }
    const result = await createDelivery(orderId, "hss_to_customer", lineItemIds);
    if (result.ok) {
      setError(null);
      toast({ kind: "success", message: "Delivery created from HSS stock" });
      onDone();
    } else {
      setError(result.message);
    }
  }

  return (
    <form action={handleCreate} className="space-y-3 rounded-lg border border-border bg-panel p-3">
      <div className="section-label">New delivery from HSS stock</div>
      <p className="text-xs text-gray-dark">
        For items already sitting in the warehouse - HSS pickup straight to the customer, no purchase order.
      </p>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
        {candidates.map((li) => (
          <label key={li.id} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="lineItemIds"
              value={li.id}
              defaultChecked
              className="h-4 w-4 rounded border-border accent-accent"
            />
            {li.name} <span className="text-gray">x{li.qty}</span>
          </label>
        ))}
      </div>
      {error && <div className="banner-warn">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Cancel
        </button>
        <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Creating…">
          Create delivery
        </PendingButton>
      </div>
    </form>
  );
}
