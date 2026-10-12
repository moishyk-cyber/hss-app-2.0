import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { plainMoney } from "@/lib/money";
import { DetailHeader } from "@/lib/PageLayout";
import { DeliveryDetail } from "@/app/orders/[id]/DeliverySection";
import { DELIVERY_LEG_STATUSES, labelFor } from "@/lib/constants";
export const dynamic = "force-dynamic";
const include = {purchaseOrder: {include: {supplier: true}}, lineItems: true};
export default async function DeliveryPage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const delivery = plainMoney(await prisma.delivery.findUnique({where:{id},include}));
  if (!delivery) notFound();
  const siblings = plainMoney(await prisma.delivery.findMany({where:{orderId:delivery.orderId,id:{not:id}},include}));
  return <div className="space-y-6">
    <DetailHeader backHref="/deliveries" backLabel="Back to Deliveries" title={delivery.purchaseOrder ? `Delivery · ${delivery.purchaseOrder.poNumber ?? "Purchase order"}` : "HSS stock delivery"} subtitle={delivery.purchaseOrder?.supplier?.name ?? "Delivery from HSS stock"} secondary={<Link href={`/orders/${delivery.orderId}#delivery`} className="btn">Open order</Link>} badges={<span className="badge badge-gray">{labelFor(DELIVERY_LEG_STATUSES,delivery.status)}</span>}/>
    <DeliveryDetail delivery={delivery} siblings={siblings} orderId={delivery.orderId}/>
  </div>;
}
