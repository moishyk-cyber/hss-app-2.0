export type DeliveryDestination = { location: string | null; address: string | null; companyId?: string | null; locationId?: string | null; intakeAddress?: string | null; intakeLocation?: string | null; locations?: { id: string; name: string; address: string }[] };
type DestinationOrder = {
  deliveryAddress: string | null;
  companyId: string | null;
  locationId?: string | null;
  intakeDeliveryAddress?: string | null;
  intakeLocationName?: string | null;
  company?: { locations: { id: string; name: string; address: string }[] } | null;
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

/** Compact dropdown choices shared by the order and every delivery detail. */
export function deliveryDestinationOptions(order: DestinationOrder): DeliveryDestination {
  const current = deliveryDestination(order);
  return { ...current, companyId: order.companyId, locationId: order.locationId ?? null, intakeAddress: order.intakeDeliveryAddress === undefined ? current.address : order.intakeDeliveryAddress, intakeLocation: order.intakeLocationName === undefined ? current.location : order.intakeLocationName, locations: order.company?.locations ?? [] };
}
