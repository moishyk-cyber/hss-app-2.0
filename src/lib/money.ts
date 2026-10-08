// Money helpers - shared by server actions and client forms.
//
// Amounts are stored as NUMERIC(12,2) (Prisma `Decimal @db.Decimal(12, 2)`,
// audit item 18 - prisma/sql/20260922_money_decimal.sql). Before that they
// were floats, which is why every write still rounds to cents: the Sep 2 QA
// round caught 1234.56 sitting in a control as 1234.56005859375. Writes keep
// passing plain numbers that went through roundCents (Prisma accepts them).
//
// Reads come back as Prisma.Decimal objects (decimal.js). The app does its
// arithmetic and formatting on plain numbers, and a Decimal cannot cross the
// server -> client component boundary ("Only plain objects can be passed to
// Client Components"), so convert right after every query that selects a
// money column: toMoney() for one value, plainMoney() for a whole row/result.
// Both are client-safe (type-only Prisma import, no runtime dependency).

import type { Prisma } from "@prisma/client";

/** A money value as Prisma returns or accepts it. */
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Decimal -> number (null/undefined -> null). */
export function toMoney(v: MoneyInput): number | null {
  if (v == null) return null;
  return Number(v);
}

/** decimal.js tags its instances; no runtime import of @prisma/client needed. */
function isDecimal(v: unknown): v is Prisma.Decimal {
  return v != null && typeof v === "object" && Object.prototype.toString.call(v) === "[object Decimal]";
}

/**
 * `T` with every Prisma.Decimal (at any depth) replaced by number. The mapped
 * branch is homomorphic, so arrays and tuples (a whole Promise.all result)
 * keep their shape.
 */
export type PlainMoney<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T]: PlainMoney<T[K]> }
      : T;

/**
 * Deep-convert a Prisma result (row, array of rows, nested includes) so every
 * Decimal becomes a plain number. Dates and other values pass through
 * untouched. Wrap each query that selects a money column with this, so the
 * rest of the page/action - and any client component it renders - only ever
 * sees numbers.
 */
export function plainMoney<T>(value: T): PlainMoney<T> {
  return convert(value) as PlainMoney<T>;
}

function convert(v: unknown): unknown {
  if (isDecimal(v)) return v.toNumber();
  if (Array.isArray(v)) return v.map(convert);
  if (v != null && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Date, Buffer, ...
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v)) out[k] = convert(inner);
    return out;
  }
  return v;
}

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

/** Currency while typing: preserve a trailing decimal and unfinished cents. */
export function formatMoneyDraft(raw: string): string {
  if (raw === "") return "";
  const match = /^(-?)(\d*)(\.?)(\d*)$/.exec(raw);
  if (!match) return raw;
  const [, sign, whole, dot, fraction] = match;
  const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}${dot}${fraction}`;
}

/** "$1,234.56" / "$1,234" - fixed locale so server and client render identically. */
export function fmtUSD(n: number, opts?: { cents?: boolean }): string {
  const showCents = opts?.cents ?? !Number.isInteger(roundCents(n));
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
