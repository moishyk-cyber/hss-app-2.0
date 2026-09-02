"use client";

// Purchase Orders tab (Aug 31 feedback: creating POs is "very not
// streamlined"). While any line item still needs a PO, the create form sits
// at the top with nothing to click through - no toggle to find. Shipment/
// trucking/scheduled-delivery details and the PO's own delivery-status pill
// now live on the Delivery tab (see DeliverySection.tsx); this tab keeps the
// PO status ladder, sent-aging, gate blocking, and carrier tracking info.

import { useEffect, useRef, useState } from "react";
import { PO_STATUSES, labelFor } from "@/lib/constants";
import type { PaymentGate } from "@/lib/flow";
import { advancePoStatus, createPurchaseOrder, updatePoTracking } from "../actions";
import { PO_STATUS_COLORS, fmtDate, isValidTrackingUrl } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";
import { SearchCombobox } from "@/lib/Combobox";
import { Avatar } from "@/lib/Avatar";

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
  supplier: { name: string; deliveryAddress: string | null } | null;
  lineItems: PoLineItem[];
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
}: {
  orderId: string;
  purchaseOrders: Po[];
  unassignedLineItems: UnassignedLineItem[];
  vendors: Vendor[];
  gate: PaymentGate;
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

  // "Make it list": rows stay compact, the full detail + tracking form pop up.
  const [openPoId, setOpenPoId] = useState<string | null>(null);
  const openPo = purchaseOrders.find((po) => po.id === openPoId) ?? null;

  async function handleAdvance(poId: string, blocked: boolean) {
    if (blocked) {
      setErrors((e) => ({ ...e, [poId]: gate.reason }));
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
    const newVendorName = String(formData.get("newVendorName") ?? "");
    const lineItemIds = formData.getAll("lineItemIds").map(String);
    if ((!supplierId && !newVendorName.trim()) || lineItemIds.length === 0) return;
    setCreateError(null);
    const result = await createPurchaseOrder(orderId, supplierId, lineItemIds, newVendorName);
    if (result.ok) {
      setShowEmptyForm(false);
      setVendorQuery("");
      setVendorId("");
      setNewVendorName("");
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
                    <span className="shrink-0">
                      <span className={`badge ${PO_STATUS_COLORS[po.status] ?? "badge-gray"}`}>
                        {labelFor(PO_STATUSES, po.status)}
                      </span>
                    </span>
                    {next && (
                      <span className="relative z-10">
                        <ActionButton
                          action={() => handleAdvance(po.id, blocked)}
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

      {openPo ? <PoDetailModal po={openPo} onClose={() => setOpenPoId(null)} /> : null}
    </div>
  );
}

/** PO popup: items, ship-to, the dates, and the carrier tracking form. */
function PoDetailModal({ po, onClose }: { po: Po; onClose: () => void }) {
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
          {fmtDate(po.ackDate)} · Expected: {fmtDate(po.expectedDelivery)}
        </div>

        <ul className="space-y-0.5 border-t border-border pt-3 text-sm text-ink">
          {po.lineItems.map((li) => (
            <li key={li.id}>
              {li.name} <span className="text-gray">x{li.qty}</span>
            </li>
          ))}
        </ul>

        <TrackingEdit
          poId={po.id}
          trackingUrl={po.trackingUrl}
          trackingCarrier={po.trackingCarrier}
          expectedDelivery={po.expectedDelivery}
        />
      </div>
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
        {trackingUrl && isValidTrackingUrl(trackingUrl) && (
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
