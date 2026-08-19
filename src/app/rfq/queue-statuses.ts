import { RFQ_STATUSES } from "@/lib/constants";

export const RFQ_QUEUE_STATUSES = RFQ_STATUSES.filter((s) =>
  ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes"].includes(s.value)
);
