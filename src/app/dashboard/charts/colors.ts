// Validated chart palette - use EXACTLY these. Never red/green as series colors
// (those are reserved for status/overdue elsewhere in the app).
export const SERIES_1 = "#1C1C1E"; // primary series - Charcoal
export const SERIES_2 = "#5B6B7A"; // second categorical hue - Slate, only for the one 2-series chart

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "$0";
  return `$${Math.round(v).toLocaleString()}`;
}

/** Compact money for tight chart labels, e.g. $12.3k / $1.2M. */
export function fmtCompactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

export function fmtCount(v: number): string {
  return String(Math.round(v));
}
