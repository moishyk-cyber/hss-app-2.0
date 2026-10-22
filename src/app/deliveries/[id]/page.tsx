import { deliveryDestinationOptions } from "@/lib/deliveryDestination";
import { getDeliveryPartners } from "@/lib/deliveryPartnerData";
import { DeliveryPartnersProvider } from "@/app/deliveries/PartnerInput";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { plainMoney } from "@/lib/money";
import { DetailHeader } from "@/lib/PageLayout";
import { DeliveryDetail } from "@/app/orders/[id]/DeliverySection";
import { DELIVERY_LEG_STATUSES, labelFor } from "@/lib/constants";
export const dynamic = "force-dynamic";
const include = {order: { select: { id: true, companyId: true, locationId: true, intakeDeliveryAddress: true, intakeLocationName: true, company: { select: { locations: { select: { id: true, name: true, address: true }, orderBy: [{ isDefault: "desc" as const }, { name: "asc" as const }] } } }, deliveryAddress: true, location: { select: { name: true, address: true } }, opportunity: { select: { companyId: true, locationName: true } } } }, purchaseOrder: {include: {supplier: true}}, lineItems: { where: { rfqStatus: { not: "removed" } }, select: { deliveryStatus: true } }};
export default async function DeliveryPage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const delivery = plainMoney(await prisma.delivery.findUnique({where:{id},include}));
  if (!delivery) notFound();
  return <div className="space-y-6">
    <DetailHeader backHref="/deliveries" backLabel="Back to Deliveries" title={delivery.purchaseOrder ? `Delivery · ${delivery.purchaseOrder.poNumber ?? "Purchase order"}` : "HSS stock delivery"} subtitle={delivery.purchaseOrder?.supplier?.name ?? "Delivery from HSS stock"} secondary={<Link href={`/orders/${delivery.orderId}#delivery`} className="btn">Open order</Link>} badges={<span className="badge badge-gray">{labelFor(DELIVERY_LEG_STATUSES,delivery.status)}</span>}/>
    <DeliveryPartnersProvider partners={await getDeliveryPartners()}><DeliveryDetail delivery={delivery} orderId={delivery.orderId} destination={deliveryDestinationOptions(delivery.order)}/></DeliveryPartnersProvider>
  </div>;
}
