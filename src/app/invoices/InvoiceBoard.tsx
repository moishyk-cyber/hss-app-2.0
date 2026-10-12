"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/IntentLink";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { FormAlert } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { markPaymentInvoiced, markPaymentPending, undoMarkPaymentPaid } from "@/app/orders/actions";
import { MarkPaidControl } from "@/app/orders/[id]/PaymentsSection";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { LaneItems } from "@/lib/CollectionViews";
import { PAYMENT_STATUSES, labelFor } from "@/lib/constants";
import { PAYMENT_STATUS_COLORS, PAYMENT_TYPES } from "@/app/orders/utils";
import { fmtUSD } from "@/lib/money";
import { fmtDateUTC } from "@/lib/dates";
import { InvoiceDueDate } from "./InvoiceDueDate";
import { InvoicePaymentActions, type InvoiceRowData } from "./InvoiceRow";

export function InvoiceBoard({ payments, canEdit, today }: { payments: InvoiceRowData[]; canEdit: boolean; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ payment: InvoiceRowData; status: string } | null>(null);
  async function save(payment: InvoiceRowData, status: string) {
    if (saving.current) return;
    saving.current = true;
    setError(null);
    try {
      const result = await (status === "pending" ? markPaymentPending(payment.id, payment.status) : payment.status === "paid" ? undoMarkPaymentPaid(payment.id) : markPaymentInvoiced(payment.id));
      if (!result.ok) { setError(result.message); return; }
      setReview(null);
      toast({ kind: "success", message: `Payment moved to ${labelFor(PAYMENT_STATUSES, status)}` });
      router.refresh();
    } catch { setError("Could not update the payment. Please try again."); }
    finally { saving.current = false; }
  }
  function requestMove(payment: InvoiceRowData, status: string) {
    if (!canEdit || pending || review || saving.current || payment.status === status) return;
    setError(null);
    if (status === "paid" || payment.status === "paid") setReview({ payment, status });
    else startTransition(async () => { await save(payment, status); });
  }
  return <div className="space-y-3" aria-busy={pending}>
    {error && <FormAlert>{error}</FormAlert>}
    <div className="kanban-board" aria-label="Invoices by payment status" onDragEnd={() => { setDragging(null); setTarget(null); }} onDragStartCapture={event => {
      const element = event.target as HTMLElement;
      const card = element.closest<HTMLElement>("[data-invoice-id]") ?? element.querySelector<HTMLElement>("[data-invoice-id]");
      const id = card?.getAttribute("data-invoice-id");
      if (!canEdit || pending || review || !id || element.closest("button,input,select")) { event.preventDefault(); return; }
      event.dataTransfer.setData("application/x-hss-invoice", id); event.dataTransfer.effectAllowed = "move"; setDragging(id);
    }}>
    {PAYMENT_STATUSES.map(lane => {
      const records = payments.filter(payment => payment.status === lane.value);
      return <CollapsibleKanbanLane key={lane.value} label={lane.label} count={records.length} className={target === lane.value ? "is-drop-target" : ""}
        onDragOver={event => {
          if (!canEdit || pending || review || !dragging) return;
          event.preventDefault(); event.dataTransfer.dropEffect = "move"; setTarget(lane.value);
        }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null); }}
        onDrop={event => {
          event.preventDefault();
          const id = event.dataTransfer.getData("application/x-hss-invoice");
          setDragging(null); setTarget(null);
          const payment = payments.find(record => record.id === id);
          if (!canEdit || pending || review || !payment || payment.status === lane.value) return;
          requestMove(payment, lane.value);
        }}>
        <LaneItems laneKey={`invoices:status:${lane.value}`}>
          {records.map(payment => <article key={payment.id} data-invoice-id={payment.id} draggable={canEdit && !pending && !review}
            onDragEnd={() => { setDragging(null); setTarget(null); }}
            className={`card-sunken card-interactive kanban-card relative ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === payment.id ? "opacity-50" : ""}`}>
            <Link draggable={false} href={`/orders/${payment.order.id}#invoice`} className="kanban-card-title block text-ink hover:underline">{payment.order.title}</Link>
            <p className="kanban-card-company text-xs text-gray-dark break-words">{payment.order.company?.name ?? "No customer"}</p>
            <p className="kanban-card-note text-xs text-gray-dark">{labelFor(PAYMENT_TYPES, payment.type)}{payment.order.jobId ? ` · Job ${payment.order.jobId}` : ""}</p>
            <p className="font-semibold text-ink">{fmtUSD(payment.amount, { cents: true })}</p>
            {canEdit ? <select aria-label={`Payment status for ${payment.order.title} (${labelFor(PAYMENT_TYPES, payment.type)})`} value={payment.status} disabled={pending || !!review}
              onChange={event => requestMove(payment, event.target.value)} className={`badge relative z-10 cursor-pointer ${PAYMENT_STATUS_COLORS[payment.status] ?? "badge-gray"}`}>
              {PAYMENT_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select> : <span className={`badge ${PAYMENT_STATUS_COLORS[payment.status] ?? "badge-gray"}`}>{lane.label}</span>}
            <div className="kanban-card-facts relative z-10 space-y-1 text-xs text-gray-dark">
              <div>Due: <InvoiceDueDate payment={payment} canEdit={canEdit} today={today} /></div>
              {payment.dueNote && <p>{payment.dueNote}</p>}
              {!canEdit && payment.status === "paid" && payment.date && <p>Received: {fmtDateUTC(payment.date)}</p>}
              {payment.quickbooksRef && <a draggable={false} href={payment.quickbooksRef} target="_blank" rel="noreferrer" className="inline-block text-blue hover:underline">View in QuickBooks</a>}
            </div>
            <div className="relative z-10"><InvoicePaymentActions payment={payment} canEdit={canEdit} /></div>
          </article>)}
        </LaneItems>
        {!records.length && <p className="text-xs text-gray-dark">No billing records</p>}
      </CollapsibleKanbanLane>;
    })}
    </div>
    {review?.status === "paid" && <MarkPaidControl key={review.payment.id} payment={review.payment} initialOpen hideTrigger onClose={() => setReview(null)} onSaved={() => { setReview(null); router.refresh(); }} />}
    {review && review.status !== "paid" && <ConfirmDialog open title={`Move this paid payment back to ${labelFor(PAYMENT_STATUSES, review.status).toLowerCase()}?`}
      confirmLabel="Mark unpaid" danger pending={pending} onClose={() => { setReview(null); setError(null); }} onConfirm={() => startTransition(async () => { await save(review.payment, review.status); })}>
      <p>The {fmtUSD(review.payment.amount, { cents: true })} payment will move back to {labelFor(PAYMENT_STATUSES, review.status).toLowerCase()} and its paid date will be cleared.</p>
      {error && <FormAlert>{error}</FormAlert>}
    </ConfirmDialog>}
  </div>;
}
