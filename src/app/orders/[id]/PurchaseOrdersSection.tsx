"use client";

// Purchase Orders tab (Aug 31 feedback: creating POs is "very not
// streamlined"). While any line item still needs a PO, the create form sits
// at the top with nothing to click through - no toggle to find.
//
// A purchase order is vendor + AutoQuotes PO # + items, full stop (Sep 8 2026
// client call: "purchase orders and deliveries are two different things - you
// confused them"). Nothing about how the goods travel is asked here. The PO
// walks its own ladder - draft -> sent -> acknowledged - and Acknowledge is
// the hinge: the vendor has confirmed, so the PO turns into a delivery, and
// that dialog is where the mode gets picked and the tracking or trucker facts
// collected. From there the delivery is the Delivery tab's to edit; this tab
// only reads it back.

import { MoneyInput } from "@/lib/MoneyInput";

import { useRef, useState } from "react";
import { SectionLink as Link } from "@/lib/SectionLink";
import { useDialogAccessibility } from "@/lib/useDialogAccessibility";
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
  acknowledgePo,
  advancePoStatus,
  createPurchaseOrder,
  setPoAutoQuotesNumber,
} from "@/lib/workflowActions";
import { PO_STATUS_COLORS, fmtDate, isLikelyTrackingUrl } from "../utils";
import { PendingButton, ActionButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { SearchCombobox } from "@/lib/Combobox";
import { Avatar } from "@/lib/Avatar";
import { hasCarrierLeg, hasTruckerLeg } from "../../deliveries/_ui";
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
  pickupAddress: string | null;
  scheduledDeliveryDate: Date | null;
  shipCost: number | null;
  chargedToCustomer: boolean;
  deliveryContactPhone: string | null;
  notes: string | null;
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

function dateInputValue(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export default function PurchaseOrdersSection({
  orderId,
  purchaseOrders,
  unassignedLineItems,
  vendors,
  gate,
  documentsByPoId,
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
  // Acknowledging is the one step that needs decisions typed in first (this is
  // where the delivery is created), so it opens a dialog rather than firing.
  const [ackPoId, setAckPoId] = useState<string | null>(null);
  const ackPo = purchaseOrders.find((po) => po.id === ackPoId) ?? null;
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
      return { ok: false as const, message: gate.reason, skipRefresh: true };
    }
    if (next === "acknowledged") {
      clearError(po.id);
      setAckPoId(po.id);
      return { ok: true as const, skipRefresh: true };
    }
    const res = await advancePoStatus(po.id);
    if (!res.ok) {
      setErrors((e) => ({ ...e, [po.id]: res.message }));
    } else {
      clearError(po.id);
    }
    return res;
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
    setCreateError(null);
    const result = await createPurchaseOrder(
      orderId,
      supplierId,
      lineItemIds,
      supplierId ? "" : typedVendor,
      autoQuotesPoNumber
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
          <p className="text-xs text-gray-dark">
            Vendor, AutoQuotes PO # and items. How it ships is decided when the vendor acknowledges it.
          </p>
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
                    <Link fullPage
                      href={`/purchase-orders/${po.id}`}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {po.poNumber ?? "(no PO#)"}
                      <span className="ml-2 text-[12px] font-normal text-gray-dark">
                        {po.supplier?.name ?? "no vendor"}
                      </span>
                    </Link>
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
                          {/* Acknowledge opens the dialog that creates the
                              delivery, so it reads as its own step rather than
                              one more rung of "Advance to…". */}
                          {next === "acknowledged"
                            ? "Acknowledge & set delivery"
                            : `Advance to ${labelFor(PO_STATUSES, next)}`}
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

      {ackPo ? (
        <AcknowledgePoDialog
          po={ackPo}
          onClose={() => setAckPoId(null)}
          onAcknowledged={(poNumber) => {
            setAckPoId(null);
            toast({ kind: "success", message: `${poNumber} acknowledged - delivery created` });
          }}
        />
      ) : null}
    </div>
  );
}

/** PO record: items, ship-to, the dates, the AutoQuotes PDF, and a read-only look at its delivery leg. */
export function PurchaseOrderDetail({po, documents, uploadsEnabled}: {po: Po; documents: FileDocData[]; uploadsEnabled: boolean}) {
  const delivery = po.deliveries[0] ?? null;
  return (
    <div className="card space-y-4">
        <div className="text-xs text-gray-dark">
          Ship to: {po.shipTo === "hss" ? "HSS warehouse" : "Client direct"} · Sent: {fmtDate(po.sentDate)} · Ack:{" "}
          {fmtDate(po.ackDate)} · Expected: {fmtDate(delivery?.expectedDelivery ?? null)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <AutoQuotesField po={po} />
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
  );
}

/** Inline edit for the AutoQuotes PO # - same 40-char validation as create. */
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
        <span className="empty-value">No delivery yet</span> - acknowledging this PO is what creates one.
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
        <Link fullPage href={`/deliveries/${delivery.id}`} className="text-blue transition-colors hover:underline">
          Open delivery
        </Link>
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
 * "Acknowledge & set delivery" - the hinge between a purchase order and a
 * delivery (Sep 8 2026 client call: "when it's acknowledged, that's when it
 * turns into a delivery. At that point we need to select how it's going to
 * come over"). Pick one of the three modes and the form asks for exactly what
 * that mode needs:
 *
 *   1. Manufacturer → customer         tracking + estimated date
 *   2. HSS pickup → customer           trucker + estimated date + cost
 *   3. Manufacturer → HSS → customer   all of it
 *
 * Everything here stays editable afterwards on the Delivery tab, which is also
 * where a delivery gets split if half the PO ships early.
 */
function AcknowledgePoDialog({
  po,
  onClose,
  onAcknowledged,
}: {
  po: Po;
  onClose: () => void;
  onAcknowledged: (poNumber: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const close = () => { if (!pending) onClose(); };
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Re-acknowledging a PO that already has a delivery edits that delivery, so
  // start from whatever it already says.
  const delivery = po.deliveries[0] ?? null;
  const [mode, setMode] = useState(delivery?.mode ?? "manufacturer_to_hss_to_customer");
  const showCarrierLeg = hasCarrierLeg(mode);
  const showTruckerLeg = hasTruckerLeg(mode);

  useDialogAccessibility(panelRef, true, close, pending);

  async function handleAcknowledge(formData: FormData) {
    setPending(true);
    try {
    const result = await acknowledgePo(po.id, {
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
    if (result.ok) {
      setError(null);
      onAcknowledged(po.poNumber ?? "The PO");
    } else {
      setError(result.message);
    }
    } catch { setError("Could not confirm the save. Reload to check before trying again."); }
    finally { setPending(false); }
  }

  return (
    <div
      className="record-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-po-title"
        tabIndex={-1}
        className="record-drawer overflow-y-auto p-6 space-y-4 shadow-[var(--shadow-card-hover)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="ack-po-title" className="text-base font-semibold text-ink">
            Acknowledge {po.poNumber ?? "this PO"}
          </h2>
          <div className="text-xs text-gray-dark">
            {po.supplier?.name ?? "The vendor"} confirmed the order. This creates its delivery -
            {delivery ? " updating the one already on file." : " one delivery per PO, splittable later."}
          </div></div>
          <button type="button" className="record-drawer-close" aria-label="Close acknowledgement" onClick={close} disabled={pending}>×</button>
        </div>

        <form action={handleAcknowledge} className="space-y-3 border-t border-border pt-4">
          {error && <div className="banner-warn">{error}</div>}

          <label className="block">
            <span className="field-label">How is it coming over?</span>
            <select
              name="mode"
              className="input-klyne w-full px-2 py-1.5 text-sm"
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

          {showCarrierLeg && (
            <fieldset className="space-y-2 rounded-lg border border-border p-2.5">
              <legend className="field-label px-1">
                {showTruckerLeg ? "Leg 1 - manufacturer to HSS" : "Manufacturer to the customer"}
              </legend>
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
                  <span className="field-label">Estimated arrival</span>
                  <input
                    type="date"
                    name="expectedDelivery"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    defaultValue={dateInputValue(delivery?.expectedDelivery ?? null)}
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
              </div>
            </fieldset>
          )}

          {showTruckerLeg && (
            <fieldset className="space-y-2 rounded-lg border border-border p-2.5">
              <legend className="field-label px-1">
                {showCarrierLeg ? "Leg 2 - HSS to the customer" : "HSS pickup to the customer"}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="field-label">Trucker</span>
                  <input
                    name="trucker"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    placeholder="e.g. ANDY, UBER"
                    defaultValue={delivery?.trucker ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Estimated delivery</span>
                  <input
                    type="date"
                    name="scheduledDeliveryDate"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    defaultValue={dateInputValue(delivery?.scheduledDeliveryDate ?? null)}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Cost</span>
                  <MoneyInput
                    min="0"
                    name="shipCost"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    placeholder="$0.00"
                    defaultValue={delivery?.shipCost ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Delivery contact phone</span>
                  <input
                    type="tel"
                    name="deliveryContactPhone"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    placeholder="Delivery-day contact #"
                    defaultValue={delivery?.deliveryContactPhone ?? ""}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="field-label">Pickup address</span>
                  <input
                    name="pickupAddress"
                    className="input-klyne w-full px-2 py-1 text-xs"
                    placeholder={po.supplier?.deliveryAddress ?? "Where the driver picks up"}
                    defaultValue={delivery?.pickupAddress ?? ""}
                  />
                </label>
                <label className="col-span-2 flex items-center gap-2 pt-1 text-xs text-ink">
                  <input
                    type="checkbox"
                    name="chargedToCustomer"
                    value="1"
                    defaultChecked={delivery?.chargedToCustomer ?? false}
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  Charge this cost to the customer?
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
              defaultValue={delivery?.notes ?? ""}
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-sm" onClick={close} disabled={pending}>
              Cancel
            </button>
            <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
              Acknowledge & create delivery
            </PendingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
