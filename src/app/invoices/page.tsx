import { loadIndexedCollection } from "@/lib/loadIndexedCollection";
import { CollectionSnapshot } from "@/lib/CollectionScope";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { collectionLimit } from "@/lib/CollectionWindow";
import { plainMoney } from "@/lib/money";
import { billingToday } from "@/lib/invoices";
import { InvoiceWorkspace } from "./InvoiceWorkspace";
import { invoiceQuery } from "./data";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const today = billingToday();
  const { where, orderBy, filtered, prioritizeUnpaid } = invoiceQuery(sp, today);
  const query = (queryWhere: Prisma.PaymentWhereInput, take = limit + 1) => prisma.payment.findMany({ where: queryWhere, orderBy, take, relationLoadStrategy: "join", include: {
    order: { select: { id: true, title: true, jobId: true, company: { select: { id: true, name: true } } } },
  } }).then(plainMoney);
  const [collection, canEdit] = await Promise.all([
    loadIndexedCollection(JSON.stringify(["invoice-rows-v2",where,orderBy]),
      ()=>prisma.payment.findMany({where,orderBy,select:{id:true,status:true,amount:true}}).then(rows=>rows.map(row=>({id:row.id,amount:Number(row.amount),groups:{status:row.status}}))),
      ids=>query({AND:[where,{id:{in:ids}}]},ids.length),limit),
    can("payments.edit"),
  ]);
  const {rows: payments,hasMore}=collection;
  if (prioritizeUnpaid) payments.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid"));
  return <CollectionSnapshot data={collection.snapshot}><InvoiceWorkspace canEdit={canEdit} payments={payments} today={today} hasMore={hasMore} limit={limit} filtered={filtered} /></CollectionSnapshot>;
}
