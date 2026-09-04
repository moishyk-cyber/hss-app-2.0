"use client";

// Purchase Orders tab (Aug 31 feedback: creating POs is "very not
// streamlined"). While any line item still needs a PO, the create form sits
// at the top with nothing to click through - no toggle to find. Shipment/
// trucking/scheduled-delivery details and the PO's own delivery-status pill
// now live on the Delivery tab (see DeliverySection.tsx); this tab keeps the
// PO status ladder, sent-aging, gate blocking, and a read-only view of the
// PO's delivery leg. Advancing to Shipped asks for the shipment details once
// and writes them onto that leg.

import { useEffect, useRef, useState } from "react";
import {
  PO_STATUSES,
  DELIVERY_MODES,
  DELIVERY_MODE_COLORS,
  DELIVERY_LEG_STATUSES,
  DELIVERY_LEG_STATUS_COLORS,
  labelFor,
} from "@/lib/constants";
import type { PaymentGate } from "@/lib/flow";
import {
  advancePoStatus,
  createPurchaseOrder,
  markPoShipped,
  setPoAutoQuotesNumber,
  setPoDeliveryMode,
} from "../actions";
import { PO_STATUS_COLORS, fmtDate, isLikelyTrackingUrl } from "../utils";
import { PendingButton, ActionButton, BadgeSelect } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { SearchCombobox } from "@/lib/Combobox";
import { Avatar } from "@/lib/Avatar";
import { hasTruckerLeg } from "../../deliveries/_ui";
import FilesSection, { type FileDocData } from "./FilesSection";

type PoLineItem = { id: string; name: string; qty: number };
type Po = {
  id: string;
  poNumber: string | null;
  autoQuotesPoNumber: string | null;
  status: string;
  shipTo: string;
  sentDate: Date | null;
  ackDate: Date | null;
  supplier: { name: string; deliveryAddress: string | null } | null;
  lineItems: PoLineItem[];
  /**
   * The PO's delivery leg (the first one, when a split gave it more than one).
   * Logistics live on Delivery now - this tab only reads it; the Delivery tab
   * owns the editing.
   */
  deliveries: PoDelivery[];
};

type PoDelivery = {
  id: string;
  mode: string;
  status: string;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  expectedDelivery: Date | null;
  trucker: string | null;
  scheduledDeliveryDate: Date | null;
};

type UnassignedLineItem = { id: string; name: string; qty: number };
type Vendor = { id: string; name: string };

const PO_ORDER = ["draft", "sent", "acknowledged", "shipped", "received"];
/** Amber past this many days sitting in "sent" without acknowledgment. */
const PO_AGING_THRESHOLD_DAYS = 5;

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

export default function PurchaseOrdersSection({
  orderId,
  purchaseOrders,
  unassignedLineItems,
  vendors,
  gate,
  documentsByPoId,
  uploadsEnabled,
}: {
  orderId: string;
  purchaseOrders: Po[];
  unassignedLineItems: UnassignedLineItem[];
  vendors: Vendor[];
  gate: PaymentGate;
  /** The AutoQuotes PDF (and any other attachment) on file per PO id. */
  documentsByPoId: Record<string, FileDocData[]>;
  uploadsEnabled: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Once anything still needs a PO, the form stays up - there's nothing to
  // toggle. The "+ Create PO" reveal only applies once everything's assigned
  // (an edge case: creating an extra PO with no items left to attach).
  const hasUnassigned = unassignedLineItems.length > 0;
  const [showEmptyForm, setShowEmptyForm] = useState(false);
  const formVisible = hasUnassigned || showEmptyForm;
  const [createError, setCreateError] = useState<string | null>(null);

  // Vendor field: search-or-create (Aug 31 feedback: "when selecting a vendor,
  // do the same thing as business and creating a contact") - same combobox as
  // intake, wired to hidden inputs since the surrounding form calls a client
  // handler rather than the server action directly.
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");

  // "Make it list": rows stay compact, the full PO detail pops up.
  const [openPoId, setOpenPoId] = useState<string | null>(null);
  const openPo = purchaseOrders.find((po) => po.id === openPoId) ?? null;
  // Advancing to Shipped is the one step that needs facts typed in first, so it
  // opens a dialog instead of firing straight away.
  const [shipPoId, setShipPoId] = useState<string | null>(null);
  const shipPo = purchaseOrders.find((po) => po.id === shipPoId) ?? null;
  const { toast } = useToast();

  function clearError(poId: string) {
    setErrors((e) => {
      const next = { ...e };
      delete next[poId];
      return next;
    });
  }

  async function handleAdvance(po: Po, blocked: boolean, next: string) {
    if (blocked) {
      setErrors((e) => ({ ...e, [po.id]: gate.reason }));
      return;
    }
    if (next === "shipped") {
      clearError(po.id);
      setShipPoId(po.id);
      return;
    }
    const res = await advancePoStatus(po.id);
    if (!res.ok) {
      setErrors((e) => ({ ...e, [po.id]: res.message }));
    } else {
      clearError(po.id);
    }
  }

  async function handleCreatePo(formData: FormData) {
    const supplierId = String(formData.get("supplierId") ?? "");
    const lineItemIds = formData.getAll("lineItemIds").map(String);
    // Sep 2 QA P0: typing "CKitchen" without clicking a result left BOTH the
    // picked id and the create-new name empty, and this handler returned with
    // no error, no toast, nothing - a buyer walked away thinking the PO went
    // out. Whatever is sitting in the search box now counts as the vendor
    // (the server matches it to an existing vendor by normalized name, or
    // creates one), and every reject path says so out loud.
    const typedVendor = String(formData.get("newVendorName") ?? "").trim() || vendorQuery.trim();
    if (!supplierId && !typedVendor) {
      setCreateError("Pick a vendor first - or type a name to create one.");
      return;
    }
    if (lineItemIds.length === 0) {
      setCreateError("Tick at least one item to put on this PO.");
      return;
    }
    const autoQuotesPoNumber = String(formData.get("autoQuotesPoNumber") ?? "").trim();
    if (autoQuotesPoNumber.length > 40) {
      setCreateError("AutoQuotes PO # is too long (max 40 characters).");
      return;
    }
    const deliveryMode = String(formData.get("deliveryMode") ?? "");
    setCreateError(null);
    const result = await createPurchaseOrder(
      orderId,
      supplierId,
      lineItemIds,
      supplierId ? "" : typedVendor,
      autoQuotesPoNumber,
      deliveryMode
    );
    if (result.ok) {
      setShowEmptyForm(false);
      setVendorQuery("");
      setVendorId("");
      setNewVendorName("");
      const vendorLabel = supplierId
        ? vendors.find((v) => v.id === supplierId)?.name ?? "the vendor"
        : typedVendor;
      toast({
        kind: "success",
        message: `PO created for ${vendorLabel} with ${lineItemIds.length} item${
          lineItemIds.length === 1 ? "" : "s"
        }`,
      });
    } else {
      setCreateError(result.message);
    }
  }

  return (
    <div className="space-y-4">
      {formVisible ? (
        <form action={handleCreatePo} className="space-y-3 rounded-lg border border-border bg-panel p-3">
          <div className="section-label">Create Purchase Order</div>
          <div className="max-w-xs">
            <SearchCombobox
              label="Vendor"
              placeholder="Search vendors…"
              options={vendors.map((v) => ({ id: v.id, name: v.name }))}
              query={vendorQuery}
              setQuery={(next) => {
                setVendorQuery(next);
                // Typing again means they're re-searching - drop the old pick.
                setVendorId("");
                setNewVendorName("");
              }}
              selectedId={vendorId}
              onPick={(o) => {
                setVendorId(o.id);
                setVendorQuery(o.name);
                setNewVendorName("");
              }}
              onCreate={(name) => {
                setVendorId("");
                setNewVendorName(name);
                setVendorQuery(name);
              }}
              required
              emptyText="No vendors yet - type a name to create one."
            />
            {/* The combobox is a display control; these carry the real values. */}
            <input type="hidden" name="supplierId" value={vendorId} />
            <input type="hidden" name="newVendorName" value={newVendorName} />
          </div>
          <div className="max-w-xs">
            <label className="block">
              <span className="field-label">AutoQuotes PO #</span>
              <input
                name="autoQuotesPoNumber"
                maxLength={40}
                placeholder="AutoQuotes PO #"
                className="input-klyne w-full px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="max-w-xs">
            <label className="block">
              <span className="field-label">Delivery</span>
              <select
                name="deliveryMode"
                defaultValue="manufacturer_to_hss_to_customer"
                className="input-klyne w-full px-2 py-1.5 text-sm"
              >
                {DELIVERY_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="field-label">Items</span>
            {unassignedLineItems.length === 0 ? (
              <div className="text-xs text-gray">No unassigned items on this order right now.</div>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                {unassignedLineItems.map((li) => (
                  <label key={li.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="lineItemIds" value={li.id} defaultChecked />
                    {li.name} <span className="text-gray">x{li.qty}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {createError && <div className="banner-warn">{createError}</div>}
          <div className="flex justify-end gap-2">
            {!hasUnassigned && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setShowEmptyForm(false);
                  setVendorQuery("");
                  setVendorId("");
                  setNewVendorName("");
                }}
              >
                Cancel
              </button>
            )}
            <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Creating PO…">
              Create PO
            </PendingButton>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm active:scale-[0.99]"
          onClick={() => setShowEmptyForm(true)}
        >
          + Create PO
        </button>
      )}

      {purchaseOrders.length === 0 ? (
        <div className="empty-state">
          {hasUnassigned
            ? "No purchase orders yet - use the form above."
            : "No purchase orders yet. Line items will appear here once they're ready to purchase."}
        </div>
      ) : (
        // One dense row per PO (Aug 31 feedback: "make it list") - details and
        // the tracking form open in a popup on click, like the Delivery tab.
        <div className="card card-flush overflow-hidden">
          <ul className="divide-y divide-border">
            {purchaseOrders.map((po) => {
              const idx = PO_ORDER.indexOf(po.status);
              const next = idx >= 0 && idx < PO_ORDER.length - 1 ? PO_ORDER[idx + 1] : null;
              const blocked = po.status === "draft" && !gate.open;
              const sentDaysAgo = po.status === "sent" ? daysSince(po.sentDate) : null;
              const mode = po.deliveries[0]?.mode ?? null;
              const docCount = (documentsByPoId[po.id] ?? []).length;
              return (
                // The row's click target is a real <button> (title cell) whose
                // ::after is stretched to cover the full row - same overlay
                // technique as the Link in deliveries/page.tsx's LegTable. A
                // plain <button> wrapping the whole row isn't possible here:
                // the row also nests the "Advance to…" ActionButton, and a
                // <button> can't contain another <button> per the HTML content
                // model.
                <li key={po.id} className="relative transition-colors hover:bg-hover">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                    <Avatar name={po.supplier?.name ?? "?"} kind="business" size="sm" />
                    <button
                      type="button"
                      onClick={() => setOpenPoId(po.id)}
                      aria-haspopup="dialog"
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {po.poNumber ?? "(no PO#)"}
                      <span className="ml-2 text-[12px] font-normal text-gray-dark">
                        {po.supplier?.name ?? "no vendor"}
                      </span>
                    </button>
                    {po.autoQuotesPoNumber && (
                      <span className="hidden shrink-0 text-[12px] text-gray-dark sm:block">
                        AQ# {po.autoQuotesPoNumber}
                      </span>
                    )}
                    <span className="hidden shrink-0 text-[12px] text-gray-dark sm:block">
                      {po.lineItems.length} item{po.lineItems.length === 1 ? "" : "s"}
                    </span>
                    {sentDaysAgo != null && (
                      <span
                        className={`hidden shrink-0 text-[12px] md:block ${
                          sentDaysAgo > PO_AGING_THRESHOLD_DAYS ? "font-medium text-orange" : "text-gray"
                        }`}
                      >
                        sent {sentDaysAgo}d ago
                      </span>
                    )}
                    {mode && (
                      <span className="hidden shrink-0 lg:block">
                        <span className={`badge ${DELIVERY_MODE_COLORS[mode] ?? "badge-gray"}`}>
                          {labelFor(DELIVERY_MODES, mode)}
                        </span>
                      </span>
                    )}
                    {docCount > 0 && (
                      <span
                        className="hidden shrink-0 text-[12px] text-gray-dark sm:block"
                        title={`${docCount} file${docCount === 1 ? "" : "s"} attached`}
                      >
                        PDF attached{docCount > 1 ? ` (${docCount})` : ""}
                      </span>
                    )}
                    <span className="shrink-0">
                      <span className={`badge ${PO_STATUS_COLORS[po.status] ?? "badge-gray"}`}>
                        {labelFor(PO_STATUSES, po.status)}
                      </span>
                    </span>
                    {next && (
                      <span className="relative z-10">
                        <ActionButton
                          action={() => handleAdvance(po, blocked, next)}
                          className={`btn btn-sm active:scale-[0.99] ${blocked ? "opacity-60" : ""}`}
                        >
                          Advance to {labelFor(PO_STATUSES, next)}
                        </ActionButton>
                      </span>
                    )}
                  </div>
                  {errors[po.id] && <div className="banner-warn mx-4 mb-2">{errors[po.id]}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {openPo ? (
        <PoDetailModal
          po={openPo}
          documents={documentsByPoId[openPo.id] ?? []}
          uploadsEnabled={uploadsEnabled}
          onClose={() => setOpenPoId(null)}
        />
      ) : null}

      {shipPo ? (
        <ShipPoDialog
          po={shipPo}
          onClose={() => setShipPoId(null)}
          onShipped={(poNumber) => {
            setShipPoId(null);
            toast({ kind: "success", message: `${poNumber} marked shipped` });
          }}
        />
      ) : null}
    </div>
  );
}

/** PO popup: items, ship-to, the dates, the AutoQuotes PDF, and a read-only look at its delivery leg. */
function PoDetailModal({
  po,
  documents,
  uploadsEnabled,
  onClose,
}: {
  po: Po;
  documents: FileDocData[];
  uploadsEnabled: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A split PO has more than one leg; the modal summarizes the first and sends
  // people to the Delivery tab for the rest.
  const delivery = po.deliveries[0] ?? null;

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
            <div className="text-xs text-gray-dark">{po.supplier?.name ?? "no vendor"}</div>
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

        <div className="text-xs text-gray-dark">
          Ship to: {po.shipTo === "hss" ? "HSS warehouse" : "Client direct"} · Sent: {fmtDate(po.sentDate)} · Ack:{" "}
          {fmtDate(po.ackDate)} · Expected: {fmtDate(delivery?.expectedDelivery ?? null)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <AutoQuotesField po={po} />
          <DeliveryModeField po={po} />
        </div>

        <ul className="space-y-0.5 border-t border-border pt-3 text-sm text-ink">
          {po.lineItems.map((li) => (
            <li key={li.id}>
              {li.name} <span className="text-gray">x{li.qty}</span>
            </li>
          ))}
        </ul>

        <DeliveryReadout delivery={delivery} />

        <div className="border-t border-border pt-3">
          <div className="section-label">AutoQuotes PDF</div>
          <FilesSection
            linkedType="purchase_order"
            linkedId={po.id}
            docs={documents}
            ownLabel="AutoQuotes PDF"
            uploadsEnabled={uploadsEnabled}
            compact
            defaultKind="po"
            addLabel="+ Attach PDF"
            emptyText="No AutoQuotes PDF attached yet - paste a link or upload it."
          />
        </div>
      </div>
    </div>
  );
}

/** Modal's delivery-mode picker: same badge everyone else sees, editable in place. */
function DeliveryModeField({ po }: { po: Po }) {
  const delivery = po.deliveries[0] ?? null;
  const mode =
    delivery?.mode ?? (po.shipTo === "client_direct" ? "manufacturer_to_customer" : "manufacturer_to_hss_to_customer");
  return (
    <BadgeSelect
      value={mode}
      options={DELIVERY_MODES}
      action={(next) => setPoDeliveryMode(po.id, next)}
      colorMap={DELIVERY_MODE_COLORS}
      ariaLabel="Change delivery mode"
    />
  );
}

/** Modal's inline edit for the AutoQuotes PO # - same 40-char validation as create. */
function AutoQuotesField({ po }: { po: Po }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSave(formData: FormData) {
    const value = String(formData.get("autoQuotesPoNumber") ?? "");
    if (value.trim().length > 40) {
      setError("AutoQuotes PO # is too long (max 40 characters).");
      return;
    }
    const result = await setPoAutoQuotesNumber(po.id, value);
    if (result.ok) {
      setError(null);
      setEditing(false);
      toast({ kind: "success", message: "AutoQuotes PO # saved" });
    } else {
      setError(result.message);
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2 text-xs text-gray-dark">
        AQ#: {po.autoQuotesPoNumber || <span className="empty-value">not set</span>}
        <button
          type="button"
          className="text-gray transition-colors hover:text-ink hover:underline"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <form action={handleSave} className="flex items-center gap-2">
      <input
        name="autoQuotesPoNumber"
        maxLength={40}
        defaultValue={po.autoQuotesPoNumber ?? ""}
        placeholder="AutoQuotes PO #"
        autoFocus
        className="input-klyne w-40 px-2 py-1 text-xs"
      />
      <PendingButton className="btn btn-sm active:scale-[0.99]" pendingText="Saving…">
        Save
      </PendingButton>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <span className="banner-alert px-2 py-1 text-xs">{error}</span>}
    </form>
  );
}

/**
 * Read-only view of the PO's delivery leg. Logistics are edited on the Delivery
 * tab (one leg can cover a split PO, and an HSS-stock leg has no PO at all), so
 * this is a summary with a link, not a second source of truth.
 */
function DeliveryReadout({ delivery }: { delivery: PoDelivery | null }) {
  if (!delivery) {
    return (
      <div className="border-t border-border pt-3 text-xs">
        <span className="empty-value">No delivery leg yet</span> - one is created with the PO, and advancing to
        Shipped sets one up.
      </div>
    );
  }
  return (
    <div className="space-y-1 border-t border-border pt-3 text-xs text-gray-dark">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${DELIVERY_MODE_COLORS[delivery.mode] ?? "badge-gray"}`}>
          {labelFor(DELIVERY_MODES, delivery.mode)}
        </span>
        <span className={`badge ${DELIVERY_LEG_STATUS_COLORS[delivery.status] ?? "badge-gray"}`}>
          {labelFor(DELIVERY_LEG_STATUSES, delivery.status)}
        </span>
        <a href="#delivery" className="text-blue transition-colors hover:underline">
          Edit on the Delivery tab
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Carrier: {delivery.trackingCarrier ?? <span className="empty-value">not set</span>}</span>
        <span>
          Trucker: {delivery.trucker ?? <span className="empty-value">not assigned</span>}
        </span>
        <span>
          Scheduled:{" "}
          {delivery.scheduledDeliveryDate ? (
            fmtDate(delivery.scheduledDeliveryDate)
          ) : (
            <span className="empty-value">not scheduled</span>
          )}
        </span>
        {delivery.trackingUrl && isLikelyTrackingUrl(delivery.trackingUrl) ? (
          <a
            href={delivery.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue transition-colors hover:underline"
          >
            Open tracking
          </a>
        ) : (
          <span className="empty-value" title={delivery.trackingUrl ?? undefined}>
            no tracking link yet
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * "Advance to Shipped" asks for the shipment facts once, then writes them onto
 * the PO's delivery leg, puts that leg in transit, and advances the PO. Trucker
 * and scheduled date only appear when the leg has an HSS run to the customer.
 */
function ShipPoDialog({
  po,
  onClose,
  onShipped,
}: {
  po: Po;
  onClose: () => void;
  onShipped: (poNumber: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const delivery = po.deliveries[0] ?? null;
  // No leg on file yet (a PO from before deliveries existed): markPoShipped
  // creates one from the PO's ship-to, so show the fields that mode will have.
  const mode = delivery?.mode ?? (po.shipTo === "client_direct" ? "manufacturer_to_customer" : "manufacturer_to_hss_to_customer");
  const showTruckerLeg = hasTruckerLeg(mode);

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

  async function handleShip(formData: FormData) {
    const result = await markPoShipped(po.id, {
      trackingCarrier: String(formData.get("trackingCarrier") ?? ""),
      trackingUrl: String(formData.get("trackingUrl") ?? ""),
      expectedDelivery: String(formData.get("expectedDelivery") ?? ""),
      trucker: String(formData.get("trucker") ?? ""),
      scheduledDeliveryDate: String(formData.get("scheduledDeliveryDate") ?? ""),
    });
    if (result.ok) {
      setError(null);
      onShipped(po.poNumber ?? "The PO");
    } else {
      setError(result.message);
    }
  }

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
        aria-labelledby="ship-po-title"
        tabIndex={-1}
        className="card w-full max-w-md space-y-4 shadow-[var(--shadow-card-hover)] outline-none"
      >
        <div>
          <h2 id="ship-po-title" className="text-base font-semibold text-ink">
            Mark {po.poNumber ?? "this PO"} shipped
          </h2>
          <div className="text-xs text-gray-dark">
            Saved onto its delivery leg ({labelFor(DELIVERY_MODES, mode)}), which goes In Transit.
          </div>
        </div>

        <form action={handleShip} className="space-y-2 border-t border-border pt-4">
          {error && <div className="banner-warn">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="field-label">Carrier</span>
              <input
                name="trackingCarrier"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="e.g. UPS Freight"
                defaultValue={delivery?.trackingCarrier ?? ""}
              />
            </label>
            <label className="block">
              <span className="field-label">Expected delivery</span>
              <input
                type="date"
                name="expectedDelivery"
                className="input-klyne w-full px-2 py-1 text-xs"
                defaultValue={delivery?.expectedDelivery ? new Date(delivery.expectedDelivery).toISOString().slice(0, 10) : ""}
              />
            </label>
            <label className="col-span-2 block">
              <span className="field-label">Tracking URL</span>
              <input
                name="trackingUrl"
                className="input-klyne w-full px-2 py-1 text-xs"
                placeholder="https://…"
                defaultValue={delivery?.trackingUrl ?? ""}
              />
            </label>
            {showTruckerLeg && (
              <>
                <label className="block">
                  <span className="field-label">Trucker (optional)</span>
                  <input
                    name="trucker"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    placeholder="e.g. ANDY, UBER"
                    defaultValue={delivery?.trucker ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Scheduled delivery (optional)</span>
                  <input
                    type="date"
                    name="scheduledDeliveryDate"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    defaultValue={
                      delivery?.scheduledDeliveryDate
                        ? new Date(delivery.scheduledDeliveryDate).toISOString().slice(0, 10)
                        : ""
                    }
                  />
                </label>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Cancel
            </button>
            <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
              Mark shipped
            </PendingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
