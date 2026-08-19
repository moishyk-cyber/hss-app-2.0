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
  { value: "in_transit_to_hss", label: "In Transit to HSS" },
  { value: "in_transit_to_client", label: "In Transit to Client" },
  { value: "arrived_complete", label: "Arrived — Complete" },
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

export function labelFor(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined
): string {
  if (!value) return "—";
  return list.find((x) => x.value === value)?.label ?? value;
}

// Tailwind badge classes per status family (keep visual language consistent)
export const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  info_missing: "bg-amber-100 text-amber-800",
  estimating: "bg-purple-100 text-purple-800",
  proposal_sent: "bg-cyan-100 text-cyan-800",
  revisions_needed: "bg-orange-100 text-orange-800",
  negotiation: "bg-indigo-100 text-indigo-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-gray-200 text-gray-600",
};

export const URGENCY_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-700",
  same_day: "bg-amber-100 text-amber-800",
  emergency: "bg-red-100 text-red-800",
};
