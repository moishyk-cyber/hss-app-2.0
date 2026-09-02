"use client";

// Delivery tab (Aug 31 feedback: "a delivery tab" under each order, then later
// "show ALL the tracking/trucking info in one place per PO"). Reads top-to-bottom:
// the line-items table first (per-item delivery status, arrival dates, backorder
// date, assignee, and the add-item form), then each PO as one compact row -
// clicking it pops open the full shipment-details form. Round 4 feedback: "fix
// this to one thing only, not two - the form should only pop up when the item
// is clicked" (every PO used to render its shipment form permanently expanded,
// which read as two stacked things per PO). The modal reuses the same
// accessible-dialog pattern as tasks/TaskModal.tsx (role=dialog, Escape,
// click-outside, focus, body scroll lock). Expected delivery and the carrier
// tracking link are still edited on the Purchase Orders tab (procurement view);
// showing them here too is intentional duplication of read-only info, not a
// second source of truth.
import { useEffect, useRef, useState } from "react";
import { PO_DELIVERY_STATUSES, PO_DELIVERY_STATUS_COLORS } from "@/lib/constants";
import { setPoDeliveryStatus, updatePoShipmentDetails } from "../actions";
import { PendingButton, BadgeSelect } from "@/lib/ui";
import { fmtDate, isLikelyTrackingUrl } from "../utils";
import LineItemsSection from "./LineItemsSection";

type Item = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number | null;
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
  expectedDelivery: Date | null;
  trackingUrl: string | null;
  trackingCarrier: string | null;
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
          <div className="card card-flush overflow-hidden">
            <ul className="divide-y divide-border">
              {purchaseOrders.map((po) => (
                <PoRow key={po.id} po={po} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** One compact line per PO - click anywhere on it to open the full shipment-details form. */
function PoRow({ po }: { po: Po }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium text-ink">{po.poNumber ?? "(no PO#)"}</span>
          <span className="ml-2 text-xs text-gray-dark">{po.supplier?.name ?? "No vendor"}</span>
        </span>

        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <BadgeSelect
            value={po.deliveryStatus}
            options={PO_DELIVERY_STATUSES}
            action={(next) => setPoDeliveryStatus(po.id, next)}
            colorMap={PO_DELIVERY_STATUS_COLORS}
          />
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark sm:block">
          {po.scheduledDeliveryDate ? fmtDate(po.scheduledDeliveryDate) : <span className="empty-value">not scheduled</span>}
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark md:block">
          {po.trucker ?? <span className="empty-value">no trucker yet</span>}
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark lg:block">Expected: {fmtDate(po.expectedDelivery)}</span>

        <span className="relative z-10 shrink-0 text-xs" onClick={(e) => e.stopPropagation()}>
          {po.trackingUrl && isLikelyTrackingUrl(po.trackingUrl) ? (
            <a
              href={po.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue transition-colors hover:underline"
            >
              Track{po.trackingCarrier ? ` (${po.trackingCarrier})` : ""}
            </a>
          ) : (
            <span className="empty-value" title={po.trackingUrl ?? undefined}>
              no tracking link yet
            </span>
          )}
        </span>
      </div>

      {open && <PoModal po={po} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Shipment-details modal, opened by clicking a PO row. Same accessible-dialog
 * pattern as tasks/TaskModal.tsx: role=dialog, focus on open, Escape and
 * click-outside close, background scroll locked while open.
 */
function PoModal({ po, onClose }: { po: Po; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-modal-title"
        tabIndex={-1}
        className="card w-full max-w-lg space-y-4 shadow-[var(--shadow-card-hover)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="po-modal-title" className="text-base font-semibold text-ink">
              {po.poNumber ?? "(no PO#)"}
            </h2>
            <div className="text-xs text-gray-dark">{po.supplier?.name ?? "No vendor"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray transition-colors hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Delivery status
            </span>
            <BadgeSelect
              value={po.deliveryStatus}
              options={PO_DELIVERY_STATUSES}
              action={(next) => setPoDeliveryStatus(po.id, next)}
              colorMap={PO_DELIVERY_STATUS_COLORS}
            />
          </label>
          <span className="text-xs text-gray-dark">Expected: {fmtDate(po.expectedDelivery)}</span>
          {po.trackingUrl && isLikelyTrackingUrl(po.trackingUrl) ? (
            <a
              href={po.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue transition-colors hover:underline"
            >
              Track shipment{po.trackingCarrier ? ` (${po.trackingCarrier})` : ""}
            </a>
          ) : (
            <span className="text-xs empty-value" title={po.trackingUrl ?? undefined}>
              no tracking link yet
            </span>
          )}
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
    </div>
  );
}

/**
 * Real-world delivery/trucking fields, modeled 1:1 on the client's Delivery
 * Sheet: trucker (free text - a mix of couriers and named drivers, not a
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
  // point when nothing's been entered for this PO yet - still freely editable,
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
    <form action={handleSave} className="space-y-2 border-t border-border pt-4">
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
