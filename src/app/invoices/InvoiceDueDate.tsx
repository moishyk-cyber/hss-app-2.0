"use client";

import { InlineEditField } from "@/lib/ui";
import { fmtDateUTC } from "@/lib/dates";
import { billingToday, invoiceOverdue } from "@/lib/invoices";
import { setPaymentDueDate } from "@/lib/workflowActions";

export function InvoiceDueDate({ payment, canEdit, today = billingToday() }: {
  payment: { id: string; status: string; dueDate: Date | null };
  canEdit: boolean;
  today?: string;
}) {
  const overdue = invoiceOverdue(payment.status, payment.dueDate, today);
  const display = payment.dueDate ? fmtDateUTC(payment.dueDate) : <span className="empty-value">No due date</span>;
  return <span className="inline-flex flex-wrap items-center gap-2">
    {canEdit ? <InlineEditField type="date" ariaLabel="Edit invoice due date"
      value={payment.dueDate ? new Date(payment.dueDate).toISOString().slice(0, 10) : ""}
      displayValue={display} save={value => setPaymentDueDate(payment.id, value)} /> : display}
    {overdue && <span className="badge badge-red">Overdue</span>}
  </span>;
}
