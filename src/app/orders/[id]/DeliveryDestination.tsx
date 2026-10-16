"use client";
import { InlineEditField } from "@/lib/ui";
import { setOrderDeliveryAddress } from "../actions";
import type { DeliveryDestination as Destination } from "@/lib/deliveryDestination";

export function DeliveryDestination({ orderId, destination }: { orderId: string; destination: Destination }) {
  return <section className="space-y-2" aria-label="Delivery destination">
    <h3 className="section-label">Destination</h3>
    {destination.location && <p className="text-sm font-medium text-ink">{destination.location}</p>}
    <div>
      <span className="field-label">Destination address</span>
      <InlineEditField key={destination.address ?? ""} value={destination.address ?? ""}
        ariaLabel="Edit destination address" placeholder="No destination address saved"
        save={setOrderDeliveryAddress.bind(null, orderId)} />
    </div>
  </section>;
}
