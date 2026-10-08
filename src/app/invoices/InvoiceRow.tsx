"use client";

import Link from "@/lib/IntentLink";
import { ActionButton } from "@/lib/ui";
import { fmtUSD } from "@/lib/money";
import { PAYMENT_STATUS_COLORS, PAYMENT_TYPES } from "@/app/orders/utils";
import { PAYMENT_STATUSES, labelFor } from "@/lib/constants";
import { markPaymentInvoiced } from "@/app/orders/actions";
import { MarkPaidControl, UnmarkPaidControl, QuickBooksLinkControl, type Payment } from "@/app/orders/[id]/PaymentsSection";
import { InvoiceDueDate } from "./InvoiceDueDate";

export type InvoiceRowData = Payment & {
  order: { id: string; title: string; jobId: string | null; company: { id: string; name: string } | null };
};

export function InvoiceRow({ payment, canEdit, today }: { payment: InvoiceRowData; canEdit: boolean; today: string }) {
  return <tr>
    <td><Link href={`/orders/${payment.order.id}#invoice`} className="cell-link">{payment.order.title}</Link>
      {payment.order.jobId && <div className="text-xs text-gray-dark">Job {payment.order.jobId}</div>}</td>
    <td>{payment.order.company ? <Link href={`/companies/${payment.order.company.id}`} className="cell-link">{payment.order.company.name}</Link> : <span className="empty-value">No customer</span>}</td>
    <td>{labelFor(PAYMENT_TYPES, payment.type)}{payment.source === "terms" && <div className="text-xs text-gray-dark">From terms</div>}</td>
    <td className="whitespace-nowrap">{fmtUSD(payment.amount, { cents: true })}</td>
    <td><span className={`badge ${PAYMENT_STATUS_COLORS[payment.status] ?? "badge-gray"}`}>{labelFor(PAYMENT_STATUSES, payment.status)}</span></td>
    <td><InvoiceDueDate payment={payment} canEdit={canEdit} today={today} />{payment.dueNote && <div className="text-xs text-gray-dark">{payment.dueNote}</div>}</td>
    <td>{canEdit ? <QuickBooksLinkControl payment={payment} /> : payment.quickbooksRef ? <a href={payment.quickbooksRef} target="_blank" rel="noreferrer" className="text-blue hover:underline">View in QuickBooks</a> : <span className="empty-value">No QuickBooks link</span>}</td>
    <td><div className="flex flex-wrap items-center gap-2">
      {canEdit && payment.status === "pending" && <ActionButton action={() => markPaymentInvoiced(payment.id)} className="btn btn-sm">Mark invoiced</ActionButton>}
      {canEdit && payment.status === "invoiced" && <MarkPaidControl payment={payment} />}
      {payment.status === "paid" && (canEdit ? <UnmarkPaidControl payment={payment} /> : <span className="text-xs text-gray-dark">Payment received</span>)}
    </div></td>
  </tr>;
}
