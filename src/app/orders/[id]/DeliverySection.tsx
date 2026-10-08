"use client";

// Order delivery rows link to full delivery pages; shipment fields follow the delivery mode.

import { MoneyInput } from "@/lib/MoneyInput";

import { useMemo, useState } from "react";
import { SectionLink as Link } from "@/lib/SectionLink";
import { BackLink } from "@/lib/BackLink";
import { FormFooter } from "@/lib/PageLayout";
import { useRouter } from "next/navigation";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_COLORS,
  DELIVERY_LEG_STATUSES,
  DELIVERY_LEG_STATUS_COLORS,
  labelFor,
} from "@/lib/constants";
import {
  createDelivery,
  deleteEmptyDelivery,
  moveItemsToDelivery,
  setDeliveryStatus,
  splitDelivery,
  updateDelivery,
} from "@/lib/workflowActions";
import { PendingButton, BadgeSelect, ActionButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { fmtDate, isLikelyTrackingUrl } from "../utils";
import { hasCarrierLeg, hasTruckerLeg } from "../../deliveries/_ui";
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
  purchaseOrderId: string | null;
  deliveryId: string | null;
  rfqStatus: string;
};

type DeliveryItem = { id: string; name: string; qty: number; deliveryStatus: string };

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
  users,
  deliveries,
}: {
  orderId: string;
  items: Item[];
  users: { id: string; name: string }[];
  deliveries: Delivery[];
}) {
  const [showStockForm, setShowStockForm] = useState(false);

  // Items that belong to no leg yet AND sit on no PO: exactly what an
  // HSS-stock delivery is made of (anything on a PO already has that PO's leg).
  const stockCandidates = items.filter(
    (i) => i.rfqStatus !== "removed" && !i.deliveryId && !i.purchaseOrderId
  );

  return (
    <div className="space-y-6">
      <LineItemsSection orderId={orderId} items={items} users={users} />

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
  const itemCount = delivery.lineItems.length;
  return (
    <li>
      <div
        className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-hover"
      >
        <span className="min-w-0 flex-1">
          <Link fullPage href={`/deliveries/${delivery.id}`} className="font-medium text-ink after:absolute after:inset-0">{deliveryTitle(delivery)}</Link>
          <span className="ml-2 text-xs text-gray-dark">
            {delivery.purchaseOrder?.supplier?.name ?? "no vendor"} · {itemCount} item
            {itemCount === 1 ? "" : "s"}
          </span>
        </span>

        <span className="hidden shrink-0 lg:block">
          <span className={`badge ${DELIVERY_MODE_COLORS[delivery.mode] ?? "badge-gray"}`}>
            {labelFor(DELIVERY_MODES, delivery.mode)}
          </span>
        </span>

        <span className="relative z-10 shrink-0" onClick={(e) => e.stopPropagation()}>
          <BadgeSelect
            value={delivery.status}
            options={DELIVERY_LEG_STATUSES}
            action={(next) => setDeliveryStatus(delivery.id, next)}
            colorMap={DELIVERY_LEG_STATUS_COLORS}
            ariaLabel="Change delivery status"
          />
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark sm:block">
          {delivery.scheduledDeliveryDate ? (
            fmtDate(delivery.scheduledDeliveryDate)
          ) : (
            <span className="empty-value">not scheduled</span>
          )}
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark md:block">
          {delivery.trucker ?? <span className="empty-value">no trucker yet</span>}
        </span>

        <span className="hidden shrink-0 text-xs text-gray-dark lg:block">
          Expected: {fmtDate(delivery.expectedDelivery)}
        </span>

        <span className="relative z-10 shrink-0 text-xs" onClick={(e) => e.stopPropagation()}>
          {delivery.trackingUrl && isLikelyTrackingUrl(delivery.trackingUrl) ? (
            <a
              href={delivery.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue transition-colors hover:underline"
            >
              Track{delivery.trackingCarrier ? ` (${delivery.trackingCarrier})` : ""}
            </a>
          ) : (
            <span className="empty-value" title={delivery.trackingUrl ?? undefined}>
              no tracking link yet
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** Full delivery record editor, including shipment details and item allocation. */
export function DeliveryDetail({delivery, siblings, orderId}: {delivery: Delivery; siblings: Delivery[]; orderId: string}) {
  const router = useRouter();
  const onDone = () => { if (!document.querySelector("[data-workflow-order]")) router.refresh(); };
  // Document navigation leaves intercepted record drawers when used on a delivery page.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const onDeleted = () => { if (!document.querySelector("[data-workflow-order]")) window.location.assign(`/orders/${orderId}#delivery`); };
  const delivered = delivery.status === "delivered_full";

  return (
    <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
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

        <DeliveryDetailsForm delivery={delivery} />

        <DeliveryItemsPanel delivery={delivery} siblings={siblings} onClose={onDone} onDeleted={onDeleted} />
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
  const pickupDefault = delivery.pickupAddress ?? delivery.purchaseOrder?.supplier?.deliveryAddress ?? "";

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
          <legend className="field-label px-1">Leg 1 - manufacturer shipment</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Carrier</span>
              <input
                name="trackingCarrier"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="e.g. UPS Freight"
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
          <legend className="field-label px-1">Leg 2 - HSS to the customer</legend>
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
              <input
                name="trucker"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="e.g. ANDY, UBER, UPS DROPSHIP"
                defaultValue={delivery.trucker ?? ""}
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

/**
 * The leg's items, plus the two ways they move: split the ticked ones onto a
 * brand-new leg of the same PO, or move them onto another leg of this order.
 * Merging is "move them all, then delete the leg that is left empty".
 */
function DeliveryItemsPanel({
  delivery,
  siblings,
  onClose,
  onDeleted,
}: {
  delivery: Delivery;
  siblings: Delivery[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const isEmpty = delivery.lineItems.length === 0;
  const siblingOptions = useMemo(
    () => siblings.map((s) => ({ id: s.id, label: deliveryTitle(s) })),
    [siblings]
  );

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function handleSplit() {
    setError(null);
    const result = await splitDelivery(delivery.id, picked);
    if (result.ok) {
      setPicked([]);
      toast({ kind: "success", message: "Items split onto a new delivery" });
      onClose();
    } else {
      setError(result.message);
    }
    return result;
  }

  async function handleMove() {
    setError(null);
    if (!target) {
      setError("Pick the delivery to move them to.");
      return;
    }
    const result = await moveItemsToDelivery(target, picked);
    if (result.ok) {
      setPicked([]);
      toast({ kind: "success", message: "Items moved" });
      onClose();
    } else {
      setError(result.message);
    }
    return result;
  }

  async function handleDelete() {
    setError(null);
    const result = await deleteEmptyDelivery(delivery.id);
    if (result.ok) {
      toast({ kind: "success", message: "Empty delivery removed" });
      onDeleted();
    } else {
      setError(result.message);
    }
    return result;
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="field-label">Items on this delivery</div>
      {error && <div className="banner-warn">{error}</div>}

      {isEmpty ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="empty-value text-xs">No items on this delivery.</span>
          <ActionButton action={handleDelete} className="btn btn-sm active:scale-[0.99]">
            Delete this delivery
          </ActionButton>
        </div>
      ) : (
        <>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
            {delivery.lineItems.map((li) => (
              <li key={li.id}>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={picked.includes(li.id)}
                    onChange={() => toggle(li.id)}
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  {li.name} <span className="text-gray">x{li.qty}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={handleSplit}
              className={`btn btn-sm active:scale-[0.99] ${picked.length === 0 ? "opacity-60" : ""}`}
            >
              Split {picked.length > 0 ? `${picked.length} ` : ""}item
              {picked.length === 1 ? "" : "s"} into a new delivery
            </ActionButton>

            {siblingOptions.length > 0 && (
              <>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="Move items to which delivery"
                  className="input-klyne px-2 py-1 text-xs"
                >
                  <option value="">Move to…</option>
                  {siblingOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ActionButton
                  action={handleMove}
                  className={`btn btn-sm active:scale-[0.99] ${picked.length === 0 ? "opacity-60" : ""}`}
                >
                  Move
                </ActionButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
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
