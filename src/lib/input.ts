// Shared input sanitizers for server actions (Sep 22 audit, items 12 and 13).
// Every free-text field should pass through cleanText so nothing unbounded
// reaches the database, and every date-only field through parseDateOnly so an
// unparseable string is a validation message, not an Invalid Date thrown
// inside safeAction.

/** Common caps. Pick the smallest that fits the field. */
export const TEXT_LIMITS = {
  short: 200, // names, titles, job ids, phone numbers, reference numbers
  medium: 1000, // addresses, single-line notes, subjects
  long: 4000, // notes, descriptions, comment bodies, resolutions
} as const;

/**
 * Trim, collapse to a plain string, and cap the length. Returns "" for
 * null/undefined so callers can `|| null` when the column is optional.
 */
export function cleanText(value: FormDataEntryValue | string | null | undefined, max: number): string {
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmed = s.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date-only input ("YYYY-MM-DD", the value an <input type="date">
 * submits) into the UTC-midnight Date the app stores. Returns null for empty
 * input and `undefined` for anything unparseable, so callers can tell "cleared"
 * from "garbage":
 *   const d = parseDateOnly(raw); if (d === undefined) return { ok: false, message: "Enter a valid date." };
 */
export function parseDateOnly(raw: FormDataEntryValue | string | null | undefined): Date | null | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const ymd = YMD.test(s) ? s : s.length >= 10 && YMD.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a non-negative finite number. Returns null for empty input and
 * `undefined` when the value is not a usable number (NaN, negative, infinite).
 */
export function parseNonNegativeNumber(raw: FormDataEntryValue | string | number | null | undefined): number | null | undefined {
  if (raw == null) return null;
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
