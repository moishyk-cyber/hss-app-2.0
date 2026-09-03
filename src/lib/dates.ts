// Deterministic date formatting - safe to call in BOTH server and client
// components without a hydration mismatch.
//
// Why: the Sep 2 QA round hit intermittent React #418 blank pages. The app's
// date-only fields (due dates, needed-by, scheduled deliveries) are stored as
// UTC midnight, but they were being rendered with toLocaleDateString(), which
// uses the runtime's locale AND timezone. The server (UTC) and the browser
// (America/New_York) would disagree by a whole day - different text, hydration
// mismatch, blank panel. Fixed locale + fixed UTC timezone renders the same
// string everywhere, and reads the date-only fields back out as the day that
// was actually picked.

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sep 2, 2026" - deterministic across server and client. */
export function fmtDateUTC(d: Date | string | number): string {
  return DATE_FMT.format(new Date(d));
}

/** "Sep 2, 2026, 4:15 PM" (UTC) - deterministic across server and client. */
export function fmtDateTimeUTC(d: Date | string | number): string {
  return DATE_TIME_FMT.format(new Date(d));
}

/** The stored day as "YYYY-MM-DD" (UTC calendar day - how date fields are stored). */
export function ymdUTC(d: Date | string | number): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** The viewer's local calendar day as "YYYY-MM-DD" (client) / server day on SSR. */
export function ymdToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * True once the stored (UTC-midnight) day is strictly before today's calendar
 * day. Compares day strings, so a task due "today" is never overdue while
 * today lasts - the old Date-object comparison flipped it hours early.
 */
export function isPastDay(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  return ymdUTC(d) < ymdToday();
}
