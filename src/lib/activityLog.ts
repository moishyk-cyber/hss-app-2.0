// Shared vocabulary for the Admin audit view and record-level history panels
// (reliability spec P0-2). Every logActivity() linkedType that exists today
// gets a human label and, where the id resolves to a real page, a link.

export const ACTIVITY_RECORD_TYPES: Record<string, string> = {
  order: "Order",
  line_item: "RFQ / line item",
  opportunity: "Deal",
  task: "Task",
  user: "Teammate",
  company: "Business",
  contact: "Contact",
  service_issue: "Service issue",
  setting: "Setting",
  field_requirement: "Required-field setting",
  role_permission: "Permission",
};

export function activityRecordTypeLabel(linkedType: string): string {
  return ACTIVITY_RECORD_TYPES[linkedType] ?? linkedType;
}

/** Where a linkedType/linkedId pair opens, or null when there's no dedicated page for it. */
export function activityRecordHref(linkedType: string, linkedId: string): string | null {
  switch (linkedType) {
    case "order":
      return `/orders/${linkedId}`;
    case "opportunity":
      return `/pipeline/${linkedId}`;
    case "line_item":
      return `/rfq#li-${linkedId}`;
    case "company":
      return `/companies/${linkedId}`;
    case "service_issue":
      return `/service/${linkedId}`;
    case "task":
      return `/tasks/${linkedId}`;
    case "contact":
      return `/contacts/${linkedId}`;
    default:
      return null;
  }
}
