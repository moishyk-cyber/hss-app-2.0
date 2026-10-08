import { prisma } from "@/lib/prisma";
import { plainMoney } from "@/lib/money";

/** Start independent reads together. Only each section awaits its own data. */
export function startOrderSupportingReads(orderId: string, db = prisma) {
  const reads = {
    companies: db.company.findMany({
      where: { type: { in: ["customer", "lead"] } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }).then(rows => rows),
    contacts: db.contact.findMany({
      select: { id: true, firstName: true, lastName: true, companyId: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }).then(rows => rows),
    vendors: db.company.findMany({
      where: { type: { in: ["supplier", "vendor"] } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }).then(rows => rows),
    issues: db.serviceIssue.findMany({
      where: { orderId },
      include: {
        company: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        order: { select: { id: true, title: true } },
        lineItem: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { reportedAt: "desc" },
    }).then(rows => rows),
    purchaseOrders: db.purchaseOrder.findMany({
      where: { orderId },
      include: {
        supplier: { select: { name: true, deliveryAddress: true } },
        lineItems: { select: { id: true, name: true, qty: true } },
        deliveries: {
          select: {
            id: true, mode: true, status: true, trackingCarrier: true,
            trackingUrl: true, expectedDelivery: true, trucker: true,
            pickupAddress: true, scheduledDeliveryDate: true, shipCost: true,
            chargedToCustomer: true, deliveryContactPhone: true, notes: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }).then(plainMoney),
    items: db.lineItem.findMany({
      where: { orderId },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }).then(plainMoney),
    deliveries: db.delivery.findMany({
      where: { orderId },
      include: {
        lineItems: {
          select: { id: true, name: true, qty: true, deliveryStatus: true },
          orderBy: { createdAt: "asc" },
        },
        purchaseOrder: {
          select: { id: true, poNumber: true, supplier: { select: { name: true, deliveryAddress: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }).then(plainMoney),
  };
  // A section may not render after a missing record or interrupted navigation.
  // Handle early rejection here; its original promise still throws when awaited.
  Object.values(reads).forEach(read => { void read.catch(() => {}); });
  return reads;
}
export type OrderSupportingReads = ReturnType<typeof startOrderSupportingReads>;
