import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { collectionLimit } from "@/lib/CollectionWindow";
import { plainMoney } from "@/lib/money";
import { billingToday } from "@/lib/invoices";
import { InvoiceWorkspace } from "./InvoiceWorkspace";
import { invoiceQuery, loadInvoiceCollection } from "./data";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const today = billingToday();
  const { where, orderBy, filtered, prioritizeUnpaid } = invoiceQuery(sp, today);
  const query = (queryWhere: Prisma.PaymentWhereInput, take = limit + 1) => prisma.payment.findMany({ where: queryWhere, orderBy, take, include: {
    order: { select: { id: true, title: true, jobId: true, company: { select: { id: true, name: true } } } },
  } }).then(plainMoney);
  const [{ rows: payments, hasMore }, canEdit] = await Promise.all([
    loadInvoiceCollection(query, where, limit, (queryWhere, take = limit + 1) => prisma.payment.findMany({ where: queryWhere, orderBy, take, select: { id: true } })),
    can("payments.edit"),
  ]);
  if (prioritizeUnpaid) payments.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid"));
  return <InvoiceWorkspace canEdit={canEdit} payments={payments} today={today} hasMore={hasMore} limit={limit} filtered={filtered} />;
}
