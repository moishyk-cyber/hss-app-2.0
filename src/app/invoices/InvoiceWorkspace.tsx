"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/lib/IntentLink";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { CollectionGroup, SortHeader, TableRows } from "@/lib/CollectionViews";
import { MoreRecords } from "@/lib/CollectionWindow";
import { PAYMENT_STATUSES } from "@/lib/constants";
import { INVOICE_FIELDS } from "./data";
import { InvoiceRow, type InvoiceRowData } from "./InvoiceRow";
import { InvoiceBoard } from "./InvoiceBoard";

export function InvoiceWorkspace({ canEdit, payments, today, hasMore, limit, filtered }: {
  canEdit: boolean; payments: InvoiceRowData[]; today: string; hasMore: boolean; limit: number; filtered: boolean;
}) {
  const params = useSearchParams();
  const workspace = useRef<HTMLDivElement>(null);
  const focusedPayment = useRef<string | null>(null);
  const previousStatuses = useRef(new Map(payments.map(payment => [payment.id, payment.status])));
  useEffect(() => {
    const id = focusedPayment.current;
    const payment = payments.find(record => record.id === id);
    if (id && payment && previousStatuses.current.get(id) !== payment.status) {
      workspace.current?.querySelector<HTMLAnchorElement>(`[data-invoice-id="${CSS.escape(id)}"] a`)?.focus();
      focusedPayment.current = null;
    }
    previousStatuses.current = new Map(payments.map(record => [record.id, record.status]));
  }, [payments]);
  const isKanban = params.get("view") === "kanban";
  const flat = !isKanban && params.get("group") === "none";
  const groups = flat ? [{ label: "All billing records", records: payments }] : PAYMENT_STATUSES.map(lane => ({ label: lane.label, records: payments.filter(payment => payment.status === lane.value) }));
  function changeView(view: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return <div ref={workspace} className="space-y-6 pb-12" onFocusCapture={event => {
    const id = (event.target as HTMLElement).closest("[data-invoice-id]")?.getAttribute("data-invoice-id");
    if (id) focusedPayment.current = id;
  }}>
    <PageHeader title="Invoices" subtitle="Track deposits and invoices across every order." toolbar={<Suspense><ListControls fields={INVOICE_FIELDS} count={payments.length} hasMore={hasMore}
      groupBy={{ value: flat ? "none" : "status", options: [{ value: "status", label: "Payment Status" }, ...(!isKanban ? [{ value: "none", label: "None" }] : [])] }}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => changeView("list")} className={`chip ${!isKanban ? "chip-active" : ""}`} aria-label="Table view" aria-pressed={!isKanban} data-view-tooltip="Table view — Invoices in rows and columns"><ToolbarIcon name="table" /><span className="sr-only">Table</span></button>
        <button type="button" onClick={() => changeView("kanban")} className={`chip ${isKanban ? "chip-active" : ""}`} aria-label="Kanban view" aria-pressed={isKanban} data-view-tooltip="Kanban view — Invoices grouped by payment status"><ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span></button>
      </div>
    </ListControls></Suspense>}>
      {canEdit && <Link href="/invoices/new" className="btn btn-primary">New billing record</Link>}
    </PageHeader>
    {!payments.length ? <div className="empty-state">{filtered ? "No billing records match these filters. Clear or adjust the filters to see more records." : "No billing records yet. Create a deposit or invoice record to start tracking billing."}</div> : isKanban ? <InvoiceBoard payments={payments} canEdit={canEdit} today={today} /> : groups.map(group => <CollectionGroup key={group.label} title={group.label} count={group.records.length} totalField="status" totalValue={PAYMENT_STATUSES.find(lane=>lane.label===group.label)?.value} flat={flat}>
      {group.records.length ? <div className="table-scroll"><table className="table-klyne min-w-[1100px]">
        <thead><tr><SortHeader field="order">Order</SortHeader><SortHeader field="company">Customer</SortHeader><SortHeader field="type">Type</SortHeader><SortHeader field="amount">Amount</SortHeader><SortHeader field="status">Status</SortHeader><SortHeader field="dueDate">Due date</SortHeader><th>QuickBooks</th><th>Payment</th></tr></thead>
        <TableRows columns={8}>{group.records.map(payment => <InvoiceRow key={payment.id} payment={payment} canEdit={canEdit} today={today} />)}</TableRows>
      </table></div> : <p className="text-sm text-gray-dark">No billing records</p>}
    </CollectionGroup>)}
    <MoreRecords href="/invoices" limit={limit} hasMore={hasMore} />
  </div>;
}
