import type { ReactNode } from "react";
import { fmtDateUTC } from "@/lib/dates";

// Table-cell date/money formatters. Per DESIGN_V2.md §2, a bare "-" is only
// allowed inside table bodies for numeric/currency-like cells where column
// alignment matters, and even then it must read as de-emphasized (reduced
// opacity), never bold/dark. These return a muted thin dash for that case -
// do NOT reuse them outside a <table>; card/detail views need the full
// `.empty-value` muted phrase instead (see orders/[id]/page.tsx).
function mutedDash() {
  return <span className="text-gray/60">–</span>;
}

// Deterministic (fixed locale + UTC) formatting via @/lib/dates: these run in
// client components too, and locale/timezone-dependent output was one of the
// hydration-mismatch sources behind the Sep 2 blank-page reports.
export function fmtDate(d: Date | string | null | undefined): ReactNode {
  if (!d) return mutedDash();
  return fmtDateUTC(d);
}

export function fmtMoney(v: number | null | undefined): ReactNode {
  if (v == null) return mutedDash();
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Hostnames that are carriers/aggregators even when "track" isn't in the URL.
const TRACKING_HOST_PATTERN =
  /(^|\.)(ups|fedex|usps|dhl|ontrac|lasership|rlcarriers|rrts|abfs|arcb|xpo|tforcefreight|saia|sefl|estes-express|oldominion|odfl|pilotdelivers|averittexpress|daytonfreight|aftership|17track|parcelsapp|shipstation|shippo|narvar)\.(com|net|us|org)$/i;

/**
 * A carrier's tracking field is free text, and production has seen non-URLs
 * ("gewryher") and internal links land there - a chat.google.com link once
 * rendered as a live "Track" button on PO-E9V05J-2. A link renders as tracking
 * only when it's http(s) AND either points at a known carrier/aggregator or
 * mentions tracking in its host/path/query. Anything else on file is treated
 * as missing in the UI.
 */
export function isLikelyTrackingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (TRACKING_HOST_PATTERN.test(parsed.hostname)) return true;
    return /track|shipment|waybill|consignment/i.test(
      `${parsed.hostname}${parsed.pathname}${parsed.search}`
    );
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
// Methods offered by the mark-paid review dialog; markPaymentPaid validates against it.
export const PAYMENT_METHODS = [
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH / bank transfer" },
  { value: "credit_card", label: "Credit card" },
  { value: "cash", label: "Cash" },
  { value: "quickbooks", label: "QuickBooks payment" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "final", label: "Final" },
  { value: "full", label: "Full" },
] as const;
