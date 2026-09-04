// Module-local delivery helpers shared by the Deliveries list, the order's
// Delivery tab and the PO "Advance to Shipped" dialog. Pure and client-safe
// (no prisma, no "use client"), so the server actions in orders/actions.ts
// import it too.

/**
 * Leg 1 - the manufacturer's shipment (carrier, tracking link, ETA). Applies
 * to the two manufacturer_* modes; an HSS-stock leg never has one.
 */
export function hasCarrierLeg(mode: string): boolean {
  return mode === "manufacturer_to_customer" || mode === "manufacturer_to_hss_to_customer";
}

/**
 * Leg 2 - HSS's own trucker running the goods to the customer (pickup, date,
 * cost, day-of contact). Applies to every mode that goes out through HSS.
 */
export function hasTruckerLeg(mode: string): boolean {
  return mode === "hss_to_customer" || mode === "manufacturer_to_hss_to_customer";
}

/** The default delivery mode for a PO, read off its ship-to. */
export function modeForShipTo(shipTo: string): string {
  return shipTo === "client_direct" ? "manufacturer_to_customer" : "manufacturer_to_hss_to_customer";
}

/**
 * Where a PO's items are heading the moment it ships: straight to the client
 * on a drop-ship, otherwise into the HSS warehouse for the second leg.
 */
export function inTransitItemStatus(mode: string): string {
  return mode === "manufacturer_to_hss_to_customer" ? "in_transit_to_hss" : "in_transit_to_client";
}
