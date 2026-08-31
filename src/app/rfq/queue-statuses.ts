import { RFQ_STATUSES } from "@/lib/constants";

export const RFQ_QUEUE_STATUSES = RFQ_STATUSES.filter((s) =>
  ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"].includes(s.value)
);

/**
 * Shared with the dashboard's "Items needing pricing" queue: a line item whose
 * opportunity died (stage "lost") is a dead deal and should stop showing up in
 * Sam's queue - UNLESS it was already carried forward onto a real order.
 */
export function isDeadDealItem(item: { opportunity?: { stage: string } | null; orderId: string | null }): boolean {
  return item.opportunity?.stage === "lost" && item.orderId === null;
}
