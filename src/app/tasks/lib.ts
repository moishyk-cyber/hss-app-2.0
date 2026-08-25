// Shared, non-action helpers for the tasks module (plain functions/data, safe to
// import from both server and client components).

export const TYPE_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  order: "Order",
  line_item: "Line Item",
  company: "Company",
  contact: "Contact",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  internal: "Internal",
  customer_service: "Customer Service",
  external: "External",
};

// No shared source of truth for task-status badge colors exists in lib/constants.ts,
// so it lives here (small, local) per the same pattern used for other status families
// that lack one.
export const TASK_STATUS_COLORS: Record<string, string> = {
  not_started: "badge-gray",
  in_progress: "badge-blue",
  done: "badge-green",
  stuck: "badge-red",
};

export function linkedHref(type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "order":
      return `/orders/${id}`;
    case "opportunity":
      return `/pipeline/${id}`;
    case "company":
      return `/companies/${id}`;
    case "contact":
      return `/contacts/${id}/edit`;
    case "line_item":
      return `/rfq#li-${id}`;
    default:
      return null;
  }
}

export function isOverdue(dueDate: Date | string | null, status: string): boolean {
  if (!dueDate || status === "done") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function fmtRelative(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
