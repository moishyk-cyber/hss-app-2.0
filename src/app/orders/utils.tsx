import type { ReactNode } from "react";

// Table-cell date/money formatters. Per DESIGN_V2.md §2, a bare "-" is only
// allowed inside table bodies for numeric/currency-like cells where column
// alignment matters, and even then it must read as de-emphasized (reduced
// opacity), never bold/dark. These return a muted thin dash for that case -
// do NOT reuse them outside a <table>; card/detail views need the full
// `.empty-value` muted phrase instead (see orders/[id]/page.tsx).
function mutedDash() {
  return <span className="text-gray/60">–</span>;
}

export function fmtDate(d: Date | string | null | undefined): ReactNode {
  if (!d) return mutedDash();
  return new Date(d).toLocaleDateString();
}

export function fmtDateTime(d: Date | string | null | undefined): ReactNode {
  if (!d) return mutedDash();
  return new Date(d).toLocaleString();
}

export function fmtMoney(v: number | null | undefined): ReactNode {
  if (v == null) return mutedDash();
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * True only for an absolute http(s) URL. Guards tracking-link rendering: a
 * carrier's tracking field is free text entered by a person, and production
 * has seen non-URLs ("gewryher") and internal links (chat.google.com) land
 * there - neither should render as a clickable "Track" link.
 */
export function isValidTrackingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function paymentState(payments: { status: string }[]): "none" | "pending" | "paid" {
  if (payments.length === 0) return "none";
  if (payments.every((p) => p.status === "paid")) return "paid";
  return "pending";
}

// Badge classes (.badge-*, defined in globals.css) for status families that
// don't have a shared source of truth in lib/constants.ts.
export const PAYMENT_STATE_COLORS: Record<string, string> = {
  none: "badge-gray",
  pending: "badge-orange",
  paid: "badge-green",
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "badge-gray",
  ordered: "badge-blue",
  backordered: "badge-orange",
  in_transit_to_hss: "badge-yellow",
  in_transit_to_client: "badge-blue",
  arrived_complete: "badge-green",
};

export const PO_STATUS_COLORS: Record<string, string> = {
  draft: "badge-gray",
  sent: "badge-blue",
  acknowledged: "badge-yellow",
  shipped: "badge-blue",
  received: "badge-green",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "badge-orange",
  invoiced: "badge-yellow",
  paid: "badge-green",
};

// Payment.type enum (deposit | final | full) - no shared source of truth for it in
// lib/constants.ts, so it lives here alongside the other payment vocab for this module.
export const PAYMENT_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "final", label: "Final" },
  { value: "full", label: "Full" },
] as const;
