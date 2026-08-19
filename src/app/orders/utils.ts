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

export const PAYMENT_STATE_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  awaiting_payment: "bg-amber-100 text-amber-800",
  payment_received: "bg-cyan-100 text-cyan-800",
  pos_in_progress: "bg-purple-100 text-purple-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  delivery_scheduled: "bg-teal-100 text-teal-800",
  delivered: "bg-green-100 text-green-800",
  complete: "bg-gray-200 text-gray-700",
  stuck: "bg-red-100 text-red-800",
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  ordered: "bg-blue-100 text-blue-800",
  in_transit_to_hss: "bg-purple-100 text-purple-800",
  in_transit_to_client: "bg-indigo-100 text-indigo-800",
  arrived_complete: "bg-green-100 text-green-800",
};

export const PO_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-800",
  acknowledged: "bg-cyan-100 text-cyan-800",
  shipped: "bg-indigo-100 text-indigo-800",
  received: "bg-green-100 text-green-800",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  invoiced: "bg-cyan-100 text-cyan-800",
  paid: "bg-green-100 text-green-800",
};
