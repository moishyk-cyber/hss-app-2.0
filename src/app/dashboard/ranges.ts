// Dashboard date-range vocabulary. Shared by the server page (which turns the
// URL params into concrete start/end dates and chart bucket counts) and the
// client RangePicker (which only needs the option list), so the two can never
// drift. Custom From/To always wins over the preset dropdown.

export type RangeKey = "month" | "30d" | "90d" | "12m" | "ytd";

export const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
];

export const DEFAULT_RANGE: RangeKey = "90d";

export type ResolvedRange = {
  key: RangeKey | "custom";
  /** Short human label, used by the "Won (...)" stat tile. */
  label: string;
  start: Date;
  end: Date;
  /** Trend-chart bucket counts, derived from the span so custom ranges work too. */
  weeks: number;
  months: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (an <input type="date"> value) to local midnight, or null. */
function parseDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function spans(start: Date, end: Date): { weeks: number; months: number } {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
  const weeks = Math.min(30, Math.max(4, Math.ceil(days / 7) + 1));
  const monthSpan =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  const months = Math.min(12, Math.max(3, monthSpan));
  return { weeks, months };
}

/**
 * Resolves ?range= / ?from= / ?to= into a concrete window. A From and/or To
 * date puts the dashboard in "custom" mode; otherwise the preset key applies,
 * falling back to the 90-day default for anything unrecognized.
 */
export function resolveRange(
  now: Date,
  rawRange?: string,
  from?: string,
  to?: string
): ResolvedRange {
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);

  if (fromDate || toDate) {
    // Inclusive To: run to the end of the chosen day.
    const end = toDate ? new Date(toDate.getTime() + DAY - 1) : now;
    const requested = fromDate ?? new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const start = requested <= end ? requested : new Date(end.getTime() - 30 * DAY);
    return { key: "custom", label: "Custom range", start, end, ...spans(start, end) };
  }

  const key = RANGE_OPTIONS.find((o) => o.value === rawRange)?.value ?? DEFAULT_RANGE;
  const label = RANGE_OPTIONS.find((o) => o.value === key)?.label ?? "Last 90 days";

  let start: Date;
  switch (key) {
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * DAY);
      break;
    case "12m":
      start = new Date(now.getTime() - 365 * DAY);
      break;
    case "ytd":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now.getTime() - 90 * DAY);
  }
  return { key, label, start, end: now, ...spans(start, now) };
}
