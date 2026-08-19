export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
