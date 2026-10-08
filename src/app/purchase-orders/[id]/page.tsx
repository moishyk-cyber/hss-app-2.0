import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { plainMoney } from "@/lib/money";
import { DetailHeader } from "@/lib/PageLayout";
import { PurchaseOrderDetail } from "@/app/orders/[id]/PurchaseOrdersSection";
import { uploadsConfigured } from "@/lib/storage";
import { PO_STATUSES, labelFor } from "@/lib/constants";
export const dynamic = "force-dynamic";
export default async function PurchaseOrderPage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const [poRow, documents] = await Promise.all([
    prisma.purchaseOrder.findUnique({where:{id},include:{supplier:true,lineItems:true,deliveries:true}}),
    prisma.document.findMany({where:{linkedType:"purchase_order",linkedId:id},orderBy:{uploadedAt:"desc"}}),
  ]);
  const po = plainMoney(poRow);
  if (!po) notFound();
  return <div className="space-y-6">
    <DetailHeader backHref={`/orders/${po.orderId}#purchase-orders`} backLabel="Back to Order" title={po.poNumber ?? "Purchase order"} subtitle={po.supplier?.name ?? "No vendor"} badges={<span className="badge badge-gray">{labelFor(PO_STATUSES,po.status)}</span>}/>
    <PurchaseOrderDetail po={po} documents={documents} uploadsEnabled={uploadsConfigured()}/>
  </div>;
}
