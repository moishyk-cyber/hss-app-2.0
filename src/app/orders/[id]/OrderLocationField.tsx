"use client";

// The order's delivery site, picked from the customer's saved locations
// (Sep 3 plan A1.6). Picking one copies its address onto the order, which is
// what the delivery leg reads - so the address is chosen, never retyped.

import { OptimisticSelect } from "@/lib/ui";
import { setOrderLocation } from "../actions";

export function OrderLocationField({
  orderId,
  locationId,
  locations,
}: {
  orderId: string;
  locationId: string | null;
  locations: { id: string; name: string }[];
}) {
  if (locations.length === 0) {
    return <span className="empty-value">no locations on this business yet</span>;
  }
  return (
    <OptimisticSelect
      ariaLabel="Delivery location"
      value={locationId ?? ""}
      options={[
        { value: "", label: "Not set" },
        ...locations.map((l) => ({ value: l.id, label: l.name })),
      ]}
      action={(next) => setOrderLocation(orderId, next)}
    />
  );
}
