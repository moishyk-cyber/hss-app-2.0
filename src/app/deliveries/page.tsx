import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { URGENCY_COLORS } from "@/lib/constants";
import { fmtDate } from "../orders/utils";
import { CountPill } from "../dashboard/QueueCard";
import { DeliveryStatusPill } from "./DeliveryStatusPill";

export const dynamic = "force-dynamic";

// Every delivery leg in flight, in one place (Aug 31 feedback round 3: "Add me
// a place where I can see all of the deliveries so I can track all the
// deliveries"). A delivery leg IS a purchase order here - vendor to trucker to
// the client's door - so this page is PO-shaped. An order that is somehow in
// transit with no PO on it therefore does not appear; the order list and each
// order's Delivery tab still cover that case.

const URGENCY_RANK: Record<string, number> = { emergency: 0, same_day: 1, standard: 2 };
const DELIVERED = ["delivered_partial", "delivered_full"];
const FAR_FUTURE = 8.64e15;

type DeliveryLeg = {
  id: string;
  poNumber: string | null;
  status: string;
  shipTo: string;
  trucker: string | null;
  scheduledDeliveryDate: Date | null;
  expectedDelivery: Date | null;
  deliveryStatus: string;
  trackingUrl: string | null;
  createdAt: Date;
  orderId: string;
  order: { id: string; title: string; urgency: string; neededByDate: Date | null };
  supplier: { name: string } | null;
};

const LEG_SELECT = {
  id: true,
  poNumber: true,
  status: true,
  shipTo: true,
  trucker: true,
  scheduledDeliveryDate: true,
  expectedDelivery: true,
  deliveryStatus: true,
  trackingUrl: true,
  createdAt: true,
  orderId: true,
  order: { select: { id: true, title: true, urgency: true, neededByDate: true } },
  supplier: { select: { name: true } },
} as const;

/** Urgent first, then by the group's own date, then oldest PO first. */
function sortLegs(legs: DeliveryLeg[], dateOf: (l: DeliveryLeg) => Date | null): DeliveryLeg[] {
  return [...legs].sort((a, b) => {
    const ur = (URGENCY_RANK[a.order.urgency] ?? 9) - (URGENCY_RANK[b.order.urgency] ?? 9);
    if (ur !== 0) return ur;
    const ad = dateOf(a)?.getTime() ?? FAR_FUTURE;
    const bd = dateOf(b)?.getTime() ?? FAR_FUTURE;
    if (ad !== bd) return ad - bd;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function isUrgent(leg: DeliveryLeg): boolean {
  return leg.order.urgency === "same_day" || leg.order.urgency === "emergency";
}

function LegTable({ legs }: { legs: DeliveryLeg[] }) {
  return (
    <div className="card card-flush overflow-hidden overflow-x-auto">
      <table className="table-klyne min-w-[980px]">
        <thead>
          <tr>
            <th>PO / Order</th>
            <th>Supplier</th>
            <th>Trucker</th>
            <th>Scheduled</th>
            <th>Expected</th>
            <th>Delivery Status</th>
            <th>Tracking</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg) => (
            <tr key={leg.id} className={isUrgent(leg) ? "border-l-4 border-red transition-colors" : "transition-colors"}>
              <td>
                <Link
                  href={`/orders/${leg.orderId}#delivery`}
                  className="font-medium text-blue transition-colors hover:underline"
                >
                  {leg.poNumber ?? "(no PO#)"} - {leg.order.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-dark">
                  {isUrgent(leg) && (
                    <span className={`badge ${URGENCY_COLORS[leg.order.urgency] ?? "badge-red"}`}>
                      {leg.order.urgency.replace("_", " ")}
                    </span>
                  )}
                  <span>{leg.shipTo === "client_direct" ? "ships direct to client" : "ships to HSS"}</span>
                  {leg.order.neededByDate && <span>needed by {leg.order.neededByDate.toLocaleDateString()}</span>}
                </div>
              </td>
              <td className="text-gray-dark">
                {leg.supplier?.name ?? <span className="empty-value">no supplier</span>}
              </td>
              <td className="text-gray-dark">
                {leg.trucker ?? <span className="empty-value">no trucker yet</span>}
              </td>
              <td className="text-gray-dark">
                {leg.scheduledDeliveryDate ? (
                  fmtDate(leg.scheduledDeliveryDate)
                ) : (
                  <span className="empty-value">not scheduled</span>
                )}
              </td>
              <td className="text-gray-dark">{fmtDate(leg.expectedDelivery)}</td>
              <td>
                <DeliveryStatusPill poId={leg.id} value={leg.deliveryStatus} />
              </td>
              <td>
                {leg.trackingUrl ? (
                  <a
                    href={leg.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue transition-colors hover:underline"
                  >
                    Track
                  </a>
                ) : (
                  <span className="empty-value">no link</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="section-label flex items-center gap-2">
        {title}
        <CountPill count={count} />
      </h2>
      {children}
    </section>
  );
}

export default async function DeliveriesPage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fourteenDaysAgo = new Date(startOfToday.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [inFlightRaw, deliveredRaw] = await Promise.all([
    // A PO is "in flight" once it is out with the vendor, or while its delivery
    // leg still has to happen at all.
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { status: { in: ["sent", "acknowledged", "shipped"] } },
          { deliveryStatus: { in: ["pending", "scheduled"] } },
        ],
      },
      select: LEG_SELECT,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        deliveryStatus: { in: DELIVERED },
        OR: [
          { scheduledDeliveryDate: { gte: fourteenDaysAgo } },
          { scheduledDeliveryDate: null, createdAt: { gte: fourteenDaysAgo } },
        ],
      },
      select: LEG_SELECT,
    }),
  ]);

  // A shipped-but-already-delivered PO matches the in-flight filter on status;
  // it belongs in "recently delivered", not in the open work.
  const open = inFlightRaw.filter((l) => !DELIVERED.includes(l.deliveryStatus));

  const needsAttention = sortLegs(
    open.filter((l) => !l.scheduledDeliveryDate || l.scheduledDeliveryDate < startOfToday),
    (l) => l.scheduledDeliveryDate ?? l.order.neededByDate
  );
  const scheduled = sortLegs(
    open.filter((l) => l.scheduledDeliveryDate != null && l.scheduledDeliveryDate >= startOfToday),
    (l) => l.scheduledDeliveryDate
  );
  const delivered = sortLegs(deliveredRaw, (l) => l.scheduledDeliveryDate ?? l.createdAt).reverse();

  const totalOpen = needsAttention.length + scheduled.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Deliveries</h1>
        <p className="page-sub">
          Every delivery leg in flight - vendor, trucker, and the date it lands. {totalOpen} open.
        </p>
      </div>

      <Section title="Overdue / Needs Scheduling" count={needsAttention.length}>
        {needsAttention.length === 0 ? (
          <div className="empty-state">
            Nothing overdue or unscheduled. POs land here while they have no delivery date, or once that date has
            passed without a delivered status.
          </div>
        ) : (
          <LegTable legs={needsAttention} />
        )}
      </Section>

      <Section title="Scheduled" count={scheduled.length}>
        {scheduled.length === 0 ? (
          <div className="empty-state">
            Nothing scheduled ahead. Set a scheduled delivery date on an order&apos;s Delivery tab and it shows up
            here.
          </div>
        ) : (
          <LegTable legs={scheduled} />
        )}
      </Section>

      <section>
        <details className="space-y-3">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <span className="font-heading text-xs font-medium uppercase tracking-[0.06em] text-gray-dark">
              Recently Delivered
            </span>
            <CountPill count={delivered.length} />
            <span className="ml-auto text-xs text-gray">last 14 days</span>
          </summary>
          <div className="mt-3">
            {delivered.length === 0 ? (
              <div className="empty-state">Nothing marked delivered in the last 14 days.</div>
            ) : (
              <LegTable legs={delivered} />
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
