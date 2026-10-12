import type { PrismaClient } from "@prisma/client";

export type ServiceIssueLinks = {
  companyId: string | null;
  locationId: string | null;
  orderId: string | null;
  lineItemId: string | null;
};

/** New tickets require a complete, consistent path from business to order item. */
export async function validateServiceIssueLinks(
  links: ServiceIssueLinks,
  db: Pick<PrismaClient, "company" | "location" | "order" | "lineItem">,
): Promise<string | null> {
  const { companyId, locationId, orderId, lineItemId } = links;
  if (!companyId?.trim()) return "Select a business for the issue.";
  if (!locationId?.trim()) return "Select a location for the issue.";
  if (!orderId?.trim()) return "Select an order for the issue.";
  if (!lineItemId?.trim()) return "Select a specific order item for the issue.";

  const [company, location, order, lineItem] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { id: true } }),
    db.location.findUnique({ where: { id: locationId }, select: { companyId: true } }),
    db.order.findUnique({ where: { id: orderId }, select: { companyId: true, locationId: true } }),
    db.lineItem.findUnique({ where: { id: lineItemId }, select: { orderId: true } }),
  ]);
  if (!company) return "That business could not be found.";
  if (!location) return "That location could not be found.";
  if (location.companyId !== companyId) return "That location belongs to a different business.";
  if (!order) return "That order could not be found.";
  if (order.companyId !== companyId) return "That order belongs to a different business.";
  if (order.locationId && order.locationId !== locationId) return "That order belongs to a different location.";
  if (!lineItem) return "That order item could not be found.";
  if (lineItem.orderId !== orderId) return "That order item belongs to a different order.";
  return null;
}
