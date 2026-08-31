import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { URGENCY_COLORS, ORDER_URGENCIES, PO_DELIVERY_STATUSES } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { fmtDate } from "../orders/utils";
import { CountPill } from "../dashboard/QueueCard";
import { DeliveryStatusPill } from "./DeliveryStatusPill";
import { TruckerSelect } from "./TruckerSelect";

export const dynamic = "force-dynamic";

const FIELDS: ListField[] = [
  { key: "supplier", label: "Supplier", type: "text" },
  { key: "trucker", label: "Trucker", type: "text" },
  { key: "scheduledDate", label: "Scheduled Date", type: "date" },
  { key: "expectedDate", label: "Expected Date", type: "date" },
  { key: "deliveryStatus", label: "Delivery Status", type: "enum", options: PO_DELIVERY_STATUSES },
  { key: "urgency", label: "Urgency", type: "enum", options: ORDER_URGENCIES },
];

type DeliveriesSearchParams = Record<string, string | string[] | undefined>;

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

/** Explicit Sort by choice from ListControls - overrides the urgency/date default within each group. */
function sortLegsBy(legs: DeliveryLeg[], key: string, dir: "asc" | "desc"): DeliveryLeg[] {
  const factor = dir === "desc" ? -1 : 1;
  return [...legs].sort((a, b) => {
    switch (key) {
      case "supplier":
        return factor * (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "");
      case "trucker":
        return factor * (a.trucker ?? "").localeCompare(b.trucker ?? "");
      case "scheduledDate":
        return (
          factor *
          ((a.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE) - (b.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE))
        );
      case "expectedDate":
        return factor * ((a.expectedDelivery?.getTime() ?? FAR_FUTURE) - (b.expectedDelivery?.getTime() ?? FAR_FUTURE));
      case "deliveryStatus":
        return factor * a.deliveryStatus.localeCompare(b.deliveryStatus);
      case "urgency":
        return factor * ((URGENCY_RANK[a.order.urgency] ?? 9) - (URGENCY_RANK[b.order.urgency] ?? 9));
      default:
        return 0;
    }
  });
}

function isUrgent(leg: DeliveryLeg): boolean {
  return leg.order.urgency === "same_day" || leg.order.urgency === "emergency";
}

function LegTable({ legs, truckers }: { legs: DeliveryLeg[]; truckers: string[] }) {
  return (
    <div className="card card-flush overflow-hidden">
      <ul className="divide-y divide-border">
        {legs.map((leg) => (
          <li
            key={leg.id}
            className={`relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 transition-colors hover:bg-hover ${
              isUrgent(leg) ? "border-l-4 border-red" : ""
            }`}
          >
            <span className="flex shrink-0 items-center gap-2">
              <Avatar name={leg.supplier?.name ?? "?"} kind="business" size="sm" />
              <span className="hidden max-w-[9rem] truncate text-[12px] text-gray-dark md:block">
                {leg.supplier?.name ?? <span className="empty-value">no supplier</span>}
              </span>
            </span>

            <Link
              href={`/orders/${leg.orderId}#delivery`}
              className="min-w-0 flex-[3] after:absolute after:inset-0 after:content-['']"
            >
              <div className="truncate text-[13.5px] font-semibold text-ink">
                {leg.poNumber ?? "(no PO#)"} - {leg.order.title}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-dark">
                {isUrgent(leg) && (
                  <span className={`badge ${URGENCY_COLORS[leg.order.urgency] ?? "badge-red"}`}>
                    {leg.order.urgency.replace("_", " ")}
                  </span>
                )}
                <span>{leg.shipTo === "client_direct" ? "ships direct to client" : "ships to HSS"}</span>
                {leg.order.neededByDate && <span>needed by {leg.order.neededByDate.toLocaleDateString()}</span>}
              </div>
            </Link>

            <span className="relative z-10 hidden min-w-0 flex-1 lg:block">
              <TruckerSelect poId={leg.id} value={leg.trucker} truckers={truckers} />
            </span>

            <span className="hidden shrink-0 text-[12px] text-gray-dark sm:block">
              {leg.scheduledDeliveryDate ? (
                fmtDate(leg.scheduledDeliveryDate)
              ) : (
                <span className="empty-value">not scheduled</span>
              )}
            </span>

            <span className="hidden shrink-0 text-[12px] text-gray-dark md:block">
              {fmtDate(leg.expectedDelivery)}
            </span>

            <span className="relative z-10 shrink-0">
              <DeliveryStatusPill poId={leg.id} value={leg.deliveryStatus} />
            </span>

            <span className="relative z-10 shrink-0 text-[12px]">
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
            </span>
          </li>
        ))}
      </ul>
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

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<DeliveriesSearchParams>;
}) {
  const sp = await searchParams;
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fourteenDaysAgo = new Date(startOfToday.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Both queries below share the same filter set so a filter applies across
  // all three sections at once.
  const filterAnd: Prisma.PurchaseOrderWhereInput[] = [];
  if (filters.supplier) filterAnd.push({ supplier: { name: { contains: filters.supplier, mode: "insensitive" } } });
  if (filters.trucker) filterAnd.push({ trucker: { contains: filters.trucker, mode: "insensitive" } });
  if (filters.deliveryStatus) filterAnd.push({ deliveryStatus: filters.deliveryStatus });
  if (filters.urgency) filterAnd.push({ order: { urgency: filters.urgency } });
  if (filters.scheduledDate) {
    const day = new Date(filters.scheduledDate);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    filterAnd.push({ scheduledDeliveryDate: { gte: day, lt: nextDay } });
  }
  if (filters.expectedDate) {
    const day = new Date(filters.expectedDate);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    filterAnd.push({ expectedDelivery: { gte: day, lt: nextDay } });
  }

  const truckerRows = await prisma.purchaseOrder.findMany({
    where: { trucker: { not: null } },
    select: { trucker: true },
    distinct: ["trucker"],
  });
  const knownTruckers = truckerRows.map((t) => t.trucker as string);

  const [inFlightRaw, deliveredRaw] = await Promise.all([
    // A PO is "in flight" once it is out with the vendor, or while its delivery
    // leg still has to happen at all.
    prisma.purchaseOrder.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: { in: ["sent", "acknowledged", "shipped"] } },
              { deliveryStatus: { in: ["pending", "scheduled"] } },
            ],
          },
          ...filterAnd,
        ],
      },
      select: LEG_SELECT,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        AND: [
          {
            deliveryStatus: { in: DELIVERED },
            OR: [
              { scheduledDeliveryDate: { gte: fourteenDaysAgo } },
              { scheduledDeliveryDate: null, createdAt: { gte: fourteenDaysAgo } },
            ],
          },
          ...filterAnd,
        ],
      },
      select: LEG_SELECT,
    }),
  ]);

  // A shipped-but-already-delivered PO matches the in-flight filter on status;
  // it belongs in "recently delivered", not in the open work.
  const open = inFlightRaw.filter((l) => !DELIVERED.includes(l.deliveryStatus));

  const needsAttentionRaw = open.filter((l) => !l.scheduledDeliveryDate || l.scheduledDeliveryDate < startOfToday);
  const scheduledRaw = open.filter((l) => l.scheduledDeliveryDate != null && l.scheduledDeliveryDate >= startOfToday);

  const needsAttention = sortKey
    ? sortLegsBy(needsAttentionRaw, sortKey, sortDir)
    : sortLegs(needsAttentionRaw, (l) => l.scheduledDeliveryDate ?? l.order.neededByDate);
  const scheduled = sortKey
    ? sortLegsBy(scheduledRaw, sortKey, sortDir)
    : sortLegs(scheduledRaw, (l) => l.scheduledDeliveryDate);
  const delivered = sortKey
    ? sortLegsBy(deliveredRaw, sortKey, sortDir)
    : sortLegs(deliveredRaw, (l) => l.scheduledDeliveryDate ?? l.createdAt).reverse();

  const totalOpen = needsAttention.length + scheduled.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Deliveries</h1>
        <p className="page-sub">
          Every delivery leg in flight - vendor, trucker, and the date it lands. {totalOpen} open.
        </p>
      </div>

      <Suspense>
        <ListControls fields={FIELDS} />
      </Suspense>

      <Section title="Overdue / Needs Scheduling" count={needsAttention.length}>
        {needsAttention.length === 0 ? (
          <div className="empty-state">
            Nothing overdue or unscheduled. POs land here while they have no delivery date, or once that date has
            passed without a delivered status.
          </div>
        ) : (
          <LegTable legs={needsAttention} truckers={knownTruckers} />
        )}
      </Section>

      <Section title="Scheduled" count={scheduled.length}>
        {scheduled.length === 0 ? (
          <div className="empty-state">
            Nothing scheduled ahead. Set a scheduled delivery date on an order&apos;s Delivery tab and it shows up
            here.
          </div>
        ) : (
          <LegTable legs={scheduled} truckers={knownTruckers} />
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
              <LegTable legs={delivered} truckers={knownTruckers} />
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
