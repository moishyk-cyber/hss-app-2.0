"use client";

// Thin client wrapper so the (server-rendered) deliveries table can hand each
// row the shared BadgeSelect pill. The server component cannot build the
// `(next) => setPoDeliveryStatus(po.id, next)` closure itself, so the binding
// happens here - same arrangement as the order detail's DeliverySection.

import { PO_DELIVERY_STATUSES, PO_DELIVERY_STATUS_COLORS } from "@/lib/constants";
import { setPoDeliveryStatus } from "../orders/actions";
import { BadgeSelect } from "@/lib/ui";

export function DeliveryStatusPill({ poId, value }: { poId: string; value: string }) {
  return (
    <BadgeSelect
      value={value}
      options={PO_DELIVERY_STATUSES}
      action={(next) => setPoDeliveryStatus(poId, next)}
      colorMap={PO_DELIVERY_STATUS_COLORS}
    />
  );
}
