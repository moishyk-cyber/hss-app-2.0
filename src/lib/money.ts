// Money helpers - shared by server actions and client forms.
//
// Amounts are stored as floats (schema decision predating this file), which
// means every write MUST round to cents: the Sep 2 QA round caught 1234.56
// sitting in a control as 1234.56005859375. Rounding at the write boundary
// keeps stored values exact-to-the-cent; a future migration to integer cents
// can then be a pure type change.

/** Round to the nearest cent. Only ever store money that went through this. */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parse human money input: "$1,234.56", "1234.56", " 1234 ".
 * Returns null for an empty string, NaN for anything unparseable -
 * callers branch on Number.isNaN() for the error path.
 */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? roundCents(n) : NaN;
}

/** "$1,234.56" / "$1,234" - fixed locale so server and client render identically. */
export function fmtUSD(n: number, opts?: { cents?: boolean }): string {
  const showCents = opts?.cents ?? !Number.isInteger(roundCents(n));
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
