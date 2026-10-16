export type DeliveryDestination = { location: string | null; address: string | null };
type DestinationOrder = {
  deliveryAddress: string | null;
  companyId: string | null;
  location?: { name: string; address: string | null } | null;
  opportunity?: { companyId: string | null; locationName: string | null } | null;
};

/** Intake's saved order address wins over the address on the linked location. */
export function deliveryDestination(order: DestinationOrder): DeliveryDestination {
  const originalLocation = order.companyId && order.opportunity?.companyId === order.companyId
    ? order.opportunity.locationName : null;
  return {
    location: order.location?.name?.trim() || originalLocation?.trim() || null,
    address: order.deliveryAddress?.trim() || order.location?.address?.trim() || null,
  };
}
