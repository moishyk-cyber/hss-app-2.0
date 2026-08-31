// Shared status vocabularies — the ONLY source of truth for enum values and labels.
// Both sales and ops modules import from here. Do not redefine these anywhere.

export const OPPORTUNITY_STAGES = [
  { value: "new", label: "New" },
  { value: "info_missing", label: "Information Missing" },
  { value: "estimating", label: "Estimating" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "revisions_needed", label: "Revisions Needed" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

export const RFQ_STATUSES = [
  { value: "needs_pricing", label: "Needs Pricing" },
  { value: "rfq_sent", label: "RFQ Sent" },
  { value: "quote_received", label: "Quote Received" },
  { value: "priced_in_autoquotes", label: "Priced in AutoQuotes" },
  { value: "approved", label: "Approved" },
  { value: "removed", label: "Removed" },
] as const;

export const DELIVERY_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "ordered", label: "Ordered" },
  { value: "backordered", label: "Backordered" },
  { value: "in_transit_to_hss", label: "In Transit to HSS" },
  { value: "in_transit_to_client", label: "In Transit to Client" },
  { value: "arrived_complete", label: "Arrived — Complete" },
] as const;

// PO-level delivery/trucking status — modeled on the client's real delivery
// tracking spreadsheet (pending -> scheduled -> partial/full delivery).
export const PO_DELIVERY_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "scheduled", label: "Scheduled" },
  { value: "delivered_partial", label: "Delivered — Partial" },
  { value: "delivered_full", label: "Delivered — Full" },
] as const;

export const ORDER_STATUSES = [
  { value: "new", label: "New" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "payment_received", label: "Payment Received" },
  { value: "pos_in_progress", label: "POs In Progress" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivery_scheduled", label: "Delivery Scheduled" },
  { value: "delivered", label: "Delivered" },
  { value: "complete", label: "Complete" },
  { value: "stuck", label: "Stuck" },
] as const;

export const PO_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "shipped", label: "Shipped" },
  { value: "received", label: "Received" },
] as const;

export const TASK_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "stuck", label: "Stuck" },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export const COMPANY_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "lost_lead", label: "Lost Lead" },
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "installer", label: "Installer" },
  { value: "delivery_partner", label: "Delivery Partner" },
] as const;

export const COMPANY_VERTICALS = [
  { value: "restaurant", label: "Restaurant" },
  { value: "supermarket", label: "Supermarket / Grocery" },
  { value: "healthcare", label: "Healthcare" },
  { value: "venue_catering", label: "Venue / Catering" },
  { value: "school", label: "School" },
  { value: "shul", label: "Shul" },
  { value: "hotel", label: "Hotel" },
  { value: "other", label: "Other" },
] as const;

export const ORDER_URGENCIES = [
  { value: "standard", label: "Standard" },
  { value: "same_day", label: "Same Day" },
  { value: "emergency", label: "Emergency" },
] as const;

export const ITEM_KINDS = [
  { value: "sourced", label: "Sourced" },
  { value: "custom_fabrication", label: "Custom Fabrication" },
  { value: "service", label: "Service" },
] as const;

export const USER_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "purchasing", label: "Purchasing" },
  { value: "billing", label: "Billing" },
  { value: "design", label: "Design" },
  { value: "viewer", label: "Viewer" },
] as const;

/** True when `value` is one of the list's enum values — validate before persisting. */
export function isValidValue(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined
): boolean {
  return !!value && list.some((x) => x.value === value);
}

export function labelFor(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined
): string {
  if (!value) return "—";
  return list.find((x) => x.value === value)?.label ?? value;
}

// Badge classes per status family — defined in globals.css (.badge-*).
// Always render as: className={`badge ${STAGE_COLORS[stage]}`}
export const STAGE_COLORS: Record<string, string> = {
  new: "badge-blue",
  info_missing: "badge-orange",
  estimating: "badge-yellow",
  proposal_sent: "badge-blue",
  revisions_needed: "badge-orange",
  negotiation: "badge-yellow",
  won: "badge-green",
  lost: "badge-gray",
};

export const URGENCY_COLORS: Record<string, string> = {
  standard: "badge-gray",
  same_day: "badge-orange",
  emergency: "badge-red",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  new: "badge-blue",
  awaiting_payment: "badge-orange",
  payment_received: "badge-green",
  pos_in_progress: "badge-yellow",
  in_transit: "badge-blue",
  delivery_scheduled: "badge-yellow",
  delivered: "badge-green",
  complete: "badge-green",
  stuck: "badge-red",
};

export const RFQ_STATUS_COLORS: Record<string, string> = {
  needs_pricing: "badge-orange",
  rfq_sent: "badge-blue",
  quote_received: "badge-yellow",
  priced_in_autoquotes: "badge-blue",
  approved: "badge-green",
  removed: "badge-gray",
};

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: "badge-gray",
  medium: "badge-yellow",
  high: "badge-orange",
  critical: "badge-red",
};

export const PO_DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "badge-gray",
  scheduled: "badge-blue",
  delivered_partial: "badge-orange",
  delivered_full: "badge-green",
};
