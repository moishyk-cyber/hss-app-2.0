"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/IntentLink";
import { LaneItems } from "@/lib/CollectionViews";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { BadgeSelect, FormAlert } from "@/lib/ui";
import { DELIVERY_LEG_STATUSES, DELIVERY_LEG_STATUS_COLORS, DELIVERY_MODES, labelFor } from "@/lib/constants";
import { fmtDate, isLikelyTrackingUrl, paymentState } from "../orders/utils";
import { useToast } from "@/lib/toast";
import { isPastDay } from "@/lib/dates";
import { setDeliveryStatus } from "../orders/actions";
import { deliveryLanes, deliveryLane, type DeliveryGrouping } from "./boardConfig";
import { hasCarrierLeg, hasTruckerLeg, manufacturerShipmentStatus } from "./_ui";

export type DeliveryBoardRow = {
  id: string;
  mode: string;
  status: string;
  trucker: string | null;
  scheduledDeliveryDate: Date | null;
  expectedDelivery: Date | null;
  deliveredAt: Date | null;
  trackingUrl: string | null;
  trackingCarrier: string | null;
  order: { title: string; neededByDate: Date | null; payments: { status: string }[] };
  purchaseOrder: { poNumber: string; supplier: { name: string } | null } | null;
  lineItems: { deliveryStatus: string }[];
};

export default function DeliveryBoard({ deliveries, canEdit, group }: { deliveries: DeliveryBoardRow[]; canEdit: boolean; group: DeliveryGrouping }) {
  const router = useRouter();
  const { toast } = useToast();
  const board = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<{ id: string; status: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const canDrag = canEdit && group !== "mode";
  const [cards, applyMove] = useOptimistic(deliveries, (current, move: { id: string; status: string }) => current.map(card => card.id === move.id ? { ...card, status: move.status } : card));
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target || saving || pending || !cards.some(card => card.id === target.id && card.status === target.status)) return;
    const card = board.current?.querySelector<HTMLElement>(`[data-delivery-id="${CSS.escape(target.id)}"]`);
    const button = card?.querySelector<HTMLButtonElement>("button");
    if (button) { button.focus(); focusTarget.current = null; }
  }, [cards, saving, pending]);

  async function move(id: string, status: string, restoreFocus = false) {
    const previous = cards.find(card => card.id === id)?.status ?? status;
    if (restoreFocus) focusTarget.current = { id, status };
    setSaving(true);
    setError(null);
    applyMove({ id, status });
    try {
      const result = await setDeliveryStatus(id, status);
      if (!result.ok) {
        setError(result.message);
        if (focusTarget.current?.id === id) focusTarget.current.status = previous;
      } else {
        toast({ kind: "success", message: `Delivery moved to ${labelFor(DELIVERY_LEG_STATUSES, status)}` });
        router.refresh();
      }
      return result;
    } catch {
      const message = "Could not update the delivery. Please try again.";
      setError(message);
      if (focusTarget.current?.id === id) focusTarget.current.status = previous;
      return { ok: false as const, message };
    } finally { setSaving(false); }
  }

  return <div className="space-y-3" aria-busy={pending || saving}>
    {error && <FormAlert>{error}</FormAlert>}
    <div ref={board} className="kanban-board" aria-label={`Deliveries by ${group}`}>
      {deliveryLanes(group).map(lane => {
        const laneCards = cards.filter(card => deliveryLane(card, group) === lane.value);
        return <CollapsibleKanbanLane key={lane.value} label={lane.label} count={laneCards.length} className={target === lane.value ? "is-drop-target" : ""}
          onDragOver={event => {
            if (!canDrag || pending || saving || !dragging) return;
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setTarget(lane.value);
          }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null); }}
          onDrop={event => {
            event.preventDefault();
            const id = event.dataTransfer.getData("application/x-hss-delivery");
            setDragging(null); setTarget(null);
            if (!canDrag || pending || saving || !cards.some(card => card.id === id && card.status !== lane.value)) return;
            startTransition(async () => { await move(id, lane.value); });
          }}>
          <LaneItems laneKey={`deliveries:${group}:${lane.value}`}>
            {laneCards.map(card => {
              const overdue = paymentState(card.order.payments) !== "paid" && isPastDay(card.order.neededByDate) && !["delivered_partial", "delivered_full"].includes(card.status);
              const shipment = manufacturerShipmentStatus(card);
              return <article key={card.id} data-delivery-id={card.id} draggable={canDrag && !pending && !saving}
                onDragStart={event => {
                  if (!canDrag || pending || saving || (event.target as HTMLElement).closest("button,input,select")) { event.preventDefault(); return; }
                  event.dataTransfer.setData("application/x-hss-delivery", card.id); event.dataTransfer.effectAllowed = "move"; setDragging(card.id);
                }}
                onDragEnd={() => { setDragging(null); setTarget(null); }}
                className={`card-sunken card-interactive kanban-card relative ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === card.id ? "opacity-50" : ""}`}>
                <Link href={`/deliveries/${card.id}`} draggable={false} className="kanban-card-title block text-ink hover:underline after:absolute after:inset-0 after:content-['']">{card.purchaseOrder?.poNumber ?? "HSS stock delivery"}</Link>
                <div className="kanban-card-company text-xs text-gray-dark break-words">{card.order.title}</div>
                <p className="kanban-card-note text-xs text-gray-dark">{card.purchaseOrder?.supplier?.name ?? "HSS stock"} · {labelFor(DELIVERY_MODES, card.mode)}</p>
                {shipment && <p className="kanban-card-note text-xs text-ink">{shipment}</p>}
                <div className="kanban-card-status relative z-10 flex flex-wrap gap-1.5">
                  {canEdit ? <BadgeSelect value={card.status} options={DELIVERY_LEG_STATUSES} colorMap={DELIVERY_LEG_STATUS_COLORS}
                    ariaLabel={`Delivery status for ${card.purchaseOrder?.poNumber ?? card.order.title}`} action={next => move(card.id, next, true)} /> :
                    <span className={`badge ${DELIVERY_LEG_STATUS_COLORS[card.status] ?? "badge-gray"}`}>{labelFor(DELIVERY_LEG_STATUSES, card.status)}</span>}
                </div>
                <div className="kanban-card-facts space-y-1 text-xs text-gray-dark">
                  {card.order.neededByDate && <p className={overdue ? "font-medium text-red" : undefined}>Needed by: {fmtDate(card.order.neededByDate)}</p>}
                  {hasCarrierLeg(card.mode) && <><p>Carrier: {card.trackingCarrier ?? "Not set"}</p><p>Expected: {card.expectedDelivery ? fmtDate(card.expectedDelivery) : "Not set"}</p></>}
                  {hasTruckerLeg(card.mode) && <><p>Trucker: {card.trucker ?? "Not assigned"}</p><p>Scheduled: {card.scheduledDeliveryDate ? fmtDate(card.scheduledDeliveryDate) : "Not set"}</p></>}
                  {card.deliveredAt && <p>Delivered: {fmtDate(card.deliveredAt)}</p>}
                  {card.trackingUrl && isLikelyTrackingUrl(card.trackingUrl) && <a href={card.trackingUrl} target="_blank" rel="noreferrer" draggable={false} className="relative z-10 inline-block text-blue hover:underline">Track shipment</a>}
                </div>
              </article>;
            })}
          </LaneItems>
          {!laneCards.length && <p className="text-xs text-gray-dark">No deliveries</p>}
        </CollapsibleKanbanLane>;
      })}
    </div>
  </div>;
}
