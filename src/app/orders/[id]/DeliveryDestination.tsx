import { OrderLocationField } from './OrderLocationField';
import type { DeliveryDestination as Destination } from '@/lib/deliveryDestination';
export function DeliveryDestination({ orderId, destination }: { orderId: string; destination: Destination }) {
  return <section className="space-y-2" aria-label="Delivery destination"><h3 className="section-label">Destination</h3><OrderLocationField key={`${destination.companyId}:${destination.locationId}:${destination.address}`} orderId={orderId} destination={destination} /></section>;
}
