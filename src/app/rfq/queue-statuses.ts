import { RFQ_STATUSES } from "@/lib/constants";

export const RFQ_QUEUE_STATUSES = RFQ_STATUSES.filter((s) =>
  ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"].includes(s.value)
);

/**
 * Shared with the dashboard's "Items needing pricing" queue: a line item whose
 * opportunity is already closed (stage "lost" OR "won") is a dead deal and should
 * stop showing up in Sam's queue - UNLESS it was already carried forward onto a
 * real order. Once an opportunity is won, addLineItem is hidden on the deal page
 * (only markOpportunityWon or the order's own "add item" form can attach items to
 * a won deal from then on), so a leftover item with no orderId is stranded: the
 * proposal it was meant to feed into already closed, one way or the other.
 */
export function isDeadDealItem(item: { opportunity?: { stage: string } | null; orderId: string | null }): boolean {
  const stage = item.opportunity?.stage;
  return (stage === "lost" || stage === "won") && item.orderId === null;
}
