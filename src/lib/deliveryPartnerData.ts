import { prisma } from "./prisma";
import { partnerNames, savedPartnerNames, type DeliveryPartners } from "./workflows/deliveryPartners";

export async function getDeliveryPartners(): Promise<DeliveryPartners> {
  const [settings, carriers, truckers] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { in: ["delivery.carriers", "delivery.truckers"] } } }),
    prisma.delivery.findMany({ where: { trackingCarrier: { not: null } }, distinct: ["trackingCarrier"], select: { trackingCarrier: true } }),
    prisma.delivery.findMany({ where: { trucker: { not: null } }, distinct: ["trucker"], select: { trucker: true } }),
  ]);
  return {
    carriers: partnerNames(savedPartnerNames(settings.find(s => s.key === "delivery.carriers")?.value), carriers.map(c => c.trackingCarrier)),
    truckers: partnerNames(savedPartnerNames(settings.find(s => s.key === "delivery.truckers")?.value), truckers.map(t => t.trucker)),
  };
}
