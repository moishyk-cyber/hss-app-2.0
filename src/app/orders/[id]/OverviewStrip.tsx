// Order overview strip: four mini-cards under the stepper - Items, POs,
// Deliveries, Invoices - each with a count, a plain-language status breakdown
// and a jump to the tab that owns it. Server-rendered (no client JS): it is a
// read-out, and every control it points at lives in the tab it links to.

import { DELIVERY_LEG_STATUSES, DELIVERY_STATUSES, PO_STATUSES } from "@/lib/constants";
import type { PaymentGate } from "@/lib/flow";

type StripItem = { rfqStatus: string; deliveryStatus: string; purchaseOrderId: string | null };

/** RFQ statuses that mean the office is still pricing it (matches ItemStatusChips). */
const BEING_PRICED = new Set(["needs_pricing", "rfq_sent", "quote_received"]);

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** "2 delivered · 1 in transit" from a status -> count map, in vocabulary order. */
function breakdown(
  vocabulary: ReadonlyArray<{ value: string; label: string }>,
  counts: Record<string, number>
): string {
  return vocabulary
    .filter((s) => (counts[s.value] ?? 0) > 0)
    .map((s) => `${counts[s.value]} ${s.label.toLowerCase()}`)
    .join(" · ");
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
}

function MiniCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
}) {
  return (
    <a href={href} className="stat-card block !p-4 transition-colors hover:bg-hover">
      <div className="section-label !mb-1">{label}</div>
      <div className="stat-value !text-[22px]">{value}</div>
      <div className="mt-1 truncate text-[12px] text-gray-dark" title={detail}>
        {detail}
      </div>
    </a>
  );
}

export function OverviewStrip({
  items,
  purchaseOrders,
  deliveries,
  payments,
  gate,
}: {
  items: StripItem[];
  purchaseOrders: { status: string }[];
  deliveries: { status: string }[];
  payments: { status: string; amount: number }[];
  gate: PaymentGate;
}) {
  const live = items.filter((i) => i.rfqStatus !== "removed");
  const pricingCount = live.filter((i) => BEING_PRICED.has(i.rfqStatus)).length;
  const noPoCount = live.filter((i) => !BEING_PRICED.has(i.rfqStatus) && !i.purchaseOrderId).length;
  const itemDetailParts = [
    breakdown(
      DELIVERY_STATUSES,
      countBy(
        live.filter((i) => !BEING_PRICED.has(i.rfqStatus) && i.purchaseOrderId),
        (i) => i.deliveryStatus
      )
    ),
    pricingCount > 0 ? `${pricingCount} being priced` : "",
    noPoCount > 0 ? `${noPoCount} not on a PO` : "",
  ].filter(Boolean);

  const invoicedTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, invoicedTotal - gate.paidTotal);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MiniCard
        label="Items"
        value={live.length}
        detail={itemDetailParts.join(" · ") || "nothing to track yet"}
        href="#delivery"
      />
      <MiniCard
        label="POs"
        value={purchaseOrders.length}
        detail={
          breakdown(PO_STATUSES, countBy(purchaseOrders, (p) => p.status)) || "no purchase orders yet"
        }
        href="#purchase-orders"
      />
      <MiniCard
        label="Deliveries"
        value={deliveries.length}
        detail={
          breakdown(DELIVERY_LEG_STATUSES, countBy(deliveries, (d) => d.status)) ||
          "no delivery legs yet"
        }
        href="#delivery"
      />
      <MiniCard
        label="Invoices"
        value={payments.length}
        detail={
          payments.length === 0
            ? "nothing invoiced yet"
            : `${money(gate.paidTotal)} paid of ${money(invoicedTotal)}${
                outstanding > 0 ? ` · ${money(outstanding)} outstanding` : ""
              }`
        }
        href="#invoice"
      />
    </div>
  );
}
