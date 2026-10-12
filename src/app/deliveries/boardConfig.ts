import { DELIVERY_LEG_STATUSES, DELIVERY_MODES } from "@/lib/constants";

// Keep status as a URL alias for existing links; Stage is the delivery workflow status.
export type DeliveryGrouping = "status" | "mode" | "stage";
export function deliveryLanes(group: DeliveryGrouping) {
  return group === "mode" ? DELIVERY_MODES : DELIVERY_LEG_STATUSES;
}
export function deliveryLane(delivery: { mode: string; status: string }, group: DeliveryGrouping) {
  return group === "mode" ? delivery.mode : delivery.status;
}
