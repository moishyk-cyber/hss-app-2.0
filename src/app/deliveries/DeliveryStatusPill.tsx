"use client";

// Thin client wrapper so the (server-rendered) deliveries table can hand each
// row the shared BadgeSelect pill. The server component cannot build the
// `(next) => setDeliveryStatus(delivery.id, next)` closure itself, so the
// binding happens here - same arrangement as the order detail's DeliverySection.

import { DELIVERY_LEG_STATUSES, DELIVERY_LEG_STATUS_COLORS } from "@/lib/constants";
import { setDeliveryStatus } from "../orders/actions";
import { BadgeSelect } from "@/lib/ui";

export function DeliveryStatusPill({ deliveryId, value }: { deliveryId: string; value: string }) {
  return (
    <BadgeSelect
      value={value}
      options={DELIVERY_LEG_STATUSES}
      action={(next) => setDeliveryStatus(deliveryId, next)}
      colorMap={DELIVERY_LEG_STATUS_COLORS}
      ariaLabel="Change delivery status"
    />
  );
}
