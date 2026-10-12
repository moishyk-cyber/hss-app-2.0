import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { ListControls } from "@/lib/ListControls";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { plainMoney } from "@/lib/money";
import { billingToday } from "@/lib/invoices";
import { InvoiceRow } from "./InvoiceRow";
import { InvoiceWorkspace } from "./InvoiceWorkspace";
import { INVOICE_FIELDS, invoiceQuery } from "./data";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const today = billingToday();
  const { where, orderBy, filtered, prioritizeUnpaid } = invoiceQuery(sp, today);
  const canEdit = await can("payments.edit");
  const query = (queryWhere: Prisma.PaymentWhereInput) => prisma.payment.findMany({ where: queryWhere, orderBy, take: limit + 1, include: {
    order: { select: { id: true, title: true, jobId: true, company: { select: { id: true, name: true } } } },
  } }).then(plainMoney);
  const payments = await (prioritizeUnpaid ? Promise.all([
      query({ AND: [where, { status: { not: "paid" } }] }),
      query({ AND: [where, { status: "paid" }] }),
    ]).then(groups => groups.flat().slice(0, limit + 1)) : query(where));
  const hasMore = payments.length > limit;
  if (hasMore) payments.pop();
  return <InvoiceWorkspace canEdit={canEdit}
    toolbar={<Suspense><ListControls fields={INVOICE_FIELDS} count={payments.length} hasMore={hasMore} /></Suspense>}>
    {payments.length === 0 ? <div className="empty-state">{filtered ? "No billing records match these filters. Clear or adjust the filters to see more records." : "No billing records yet. Create a deposit or invoice record to start tracking billing."}</div>
      : <div className="table-scroll"><table className="table-klyne min-w-[1100px]">
        <thead><tr><SortHeader field="order">Order</SortHeader><SortHeader field="company">Customer</SortHeader><SortHeader field="type">Type</SortHeader><SortHeader field="amount">Amount</SortHeader><SortHeader field="status">Status</SortHeader><SortHeader field="dueDate">Due date</SortHeader><th>QuickBooks</th><th>Payment</th></tr></thead>
        <TableRows columns={8}>{payments.map(payment => <InvoiceRow key={payment.id} payment={payment} canEdit={canEdit} today={today} />)}</TableRows>
      </table></div>}
    <MoreRecords href="/invoices" limit={limit} hasMore={hasMore} />
  </InvoiceWorkspace>;
}
