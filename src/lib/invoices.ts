/** Billing uses HSS's business calendar consistently on server and client. */
export function billingToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function invoiceOverdue(status: string, dueDate: Date | string | null, today: string): boolean {
  return status !== "paid" && !!dueDate && new Date(dueDate).toISOString().slice(0, 10) < today;
}

/** Reject rollover dates such as February 30; blank explicitly clears a date. */
export function parseInvoiceDueDate(raw: string): Date | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}
