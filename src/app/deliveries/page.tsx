import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_COLORS,
  DELIVERY_LEG_STATUSES,
  labelFor,
} from "@/lib/constants";
import { isPastDay } from "@/lib/dates";
import { Avatar } from "@/lib/Avatar";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { fmtDate, isLikelyTrackingUrl } from "../orders/utils";
import { CountPill } from "../dashboard/QueueCard";
import { DeliveryStatusPill } from "./DeliveryStatusPill";
import { TruckerSelect } from "./TruckerSelect";
import { hasTruckerLeg } from "./_ui";

export const dynamic = "force-dynamic";

const FIELDS: ListField[] = [
  { key: "supplier", label: "Supplier", type: "text" },
  { key: "trucker", label: "Trucker", type: "text" },
  { key: "mode", label: "Delivery Mode", type: "enum", options: DELIVERY_MODES },
  { key: "scheduledDate", label: "Scheduled Date", type: "date" },
  { key: "expectedDate", label: "Expected Date", type: "date" },
  { key: "status", label: "Delivery Status", type: "enum", options: DELIVERY_LEG_STATUSES },
];

type DeliveriesSearchParams = Record<string, string | string[] | undefined>;

// Every delivery leg in flight, in one place (Aug 31 feedback round 3: "Add me
// a place where I can see all of the deliveries so I can track all the
// deliveries"). A leg is a Delivery row now, not a purchase order: most legs
// still come from one PO, but a split PO has two of them and an HSS-stock run
// has none at all - all three show up here.

const OPEN_STATUSES = ["pending", "scheduled", "in_transit"];
const DELIVERED = ["delivered_partial", "delivered_full"];
const FAR_FUTURE = 8.64e15;

const LEG_SELECT = {
  id: true,
  mode: true,
  status: true,
  trucker: true,
  scheduledDeliveryDate: true,
  expectedDelivery: true,
  deliveredAt: true,
  trackingUrl: true,
  trackingCarrier: true,
  createdAt: true,
  orderId: true,
  order: { select: { id: true, title: true, neededByDate: true } },
  purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } },
  _count: { select: { lineItems: true } },
} satisfies Prisma.DeliverySelect;

type DeliveryLeg = Prisma.DeliveryGetPayload<{ select: typeof LEG_SELECT }>;

function supplierName(leg: DeliveryLeg): string | null {
  return leg.purchaseOrder?.supplier?.name ?? null;
}

/** The date this leg is actually judged by: its trucker slot, else the carrier ETA. */
function targetDate(leg: DeliveryLeg): Date | null {
  return leg.scheduledDeliveryDate ?? leg.expectedDelivery;
}

/** Soonest order due date first, then by the group's own date, then oldest leg first. */
function sortLegs(legs: DeliveryLeg[], dateOf: (l: DeliveryLeg) => Date | null): DeliveryLeg[] {
  return [...legs].sort((a, b) => {
    const nd = (a.order.neededByDate?.getTime() ?? FAR_FUTURE) - (b.order.neededByDate?.getTime() ?? FAR_FUTURE);
    if (nd !== 0) return nd;
    const ad = dateOf(a)?.getTime() ?? FAR_FUTURE;
    const bd = dateOf(b)?.getTime() ?? FAR_FUTURE;
    if (ad !== bd) return ad - bd;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Explicit Sort by choice from ListControls - overrides the due-date default within each group. */
function sortLegsBy(legs: DeliveryLeg[], key: string, dir: "asc" | "desc"): DeliveryLeg[] {
  const factor = dir === "desc" ? -1 : 1;
  return [...legs].sort((a, b) => {
    switch (key) {
      case "supplier":
        return factor * (supplierName(a) ?? "").localeCompare(supplierName(b) ?? "");
      case "trucker":
        return factor * (a.trucker ?? "").localeCompare(b.trucker ?? "");
      case "mode":
        return factor * a.mode.localeCompare(b.mode);
      case "scheduledDate":
        return (
          factor *
          ((a.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE) - (b.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE))
        );
      case "expectedDate":
        return factor * ((a.expectedDelivery?.getTime() ?? FAR_FUTURE) - (b.expectedDelivery?.getTime() ?? FAR_FUTURE));
      case "status":
        return factor * a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });
}

/** Overdue: the order's neededByDate has passed and this leg hasn't delivered. */
function isOverdueLeg(leg: DeliveryLeg): boolean {
  return isPastDay(leg.order.neededByDate) && !DELIVERED.includes(leg.status);
}

function LegTable({ legs, truckers }: { legs: DeliveryLeg[]; truckers: string[] }) {
  return (
    <div className="card card-flush overflow-hidden">
      <ul className="divide-y divide-border">
        {legs.map((leg) => {
          const vendor = supplierName(leg);
          const itemCount = leg._count.lineItems;
          return (
            <li
              key={leg.id}
              className={`relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 transition-colors hover:bg-hover ${
                isOverdueLeg(leg) ? "border-l-4 border-red" : ""
              }`}
            >
              <span className="flex w-40 shrink-0 items-center gap-2 xl:w-56">
                <Avatar name={vendor ?? "HSS"} kind="business" size="sm" />
                <span className="hidden min-w-0 truncate text-[12px] text-gray-dark md:block" title={vendor ?? undefined}>
                  {vendor ?? <span className="empty-value">HSS stock</span>}
                </span>
              </span>

              <Link
                href={`/orders/${leg.orderId}#delivery`}
                className="min-w-0 flex-[3] after:absolute after:inset-0 after:content-['']"
              >
                <div
                  className="truncate text-[13.5px] font-semibold text-ink xl:whitespace-normal"
                  title={`${leg.purchaseOrder?.poNumber ?? "HSS stock"} - ${leg.order.title}`}
                >
                  {leg.purchaseOrder?.poNumber ?? "HSS stock"} - {leg.order.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-dark">
                  {isOverdueLeg(leg) ? (
                    <span className="badge badge-red">overdue</span>
                  ) : leg.order.neededByDate ? (
                    <span>due {fmtDate(leg.order.neededByDate)}</span>
                  ) : null}
                  <span>
                    {itemCount} item{itemCount === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>

              <span className="hidden w-52 shrink-0 lg:block">
                <span className={`badge ${DELIVERY_MODE_COLORS[leg.mode] ?? "badge-gray"}`}>
                  {labelFor(DELIVERY_MODES, leg.mode)}
                </span>
              </span>

              <span className="relative z-10 hidden w-44 shrink-0 lg:block">
                {hasTruckerLeg(leg.mode) ? (
                  <TruckerSelect deliveryId={leg.id} value={leg.trucker} truckers={truckers} />
                ) : (
                  <span className="empty-value text-[12px]">carrier delivery</span>
                )}
              </span>

              <span className="hidden w-28 shrink-0 whitespace-nowrap text-[12px] text-gray-dark sm:block">
                {leg.scheduledDeliveryDate ? (
                  fmtDate(leg.scheduledDeliveryDate)
                ) : (
                  <span className="empty-value">not scheduled</span>
                )}
              </span>

              <span className="hidden w-20 shrink-0 whitespace-nowrap text-[12px] text-gray-dark md:block">
                {fmtDate(leg.expectedDelivery)}
              </span>

              <span className="relative z-10 w-40 shrink-0">
                <DeliveryStatusPill deliveryId={leg.id} value={leg.status} />
              </span>

              <span className="relative z-10 block w-20 shrink-0 truncate text-[12px]">
                {leg.trackingUrl && isLikelyTrackingUrl(leg.trackingUrl) ? (
                  <a
                    href={leg.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue transition-colors hover:underline"
                    title={leg.trackingCarrier ?? undefined}
                  >
                    Track
                  </a>
                ) : (
                  // Junk on file (not a carrier link) reads as missing, per Sep 2 QA.
                  <span className="empty-value" title={leg.trackingUrl ?? undefined}>
                    no link
                  </span>
                )}
              </span>
            </li>
          );
        })}
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
  const filterAnd: Prisma.DeliveryWhereInput[] = [];
  if (filters.supplier) {
    filterAnd.push({
      purchaseOrder: { supplier: { name: { contains: filters.supplier, mode: "insensitive" } } },
    });
  }
  if (filters.trucker) filterAnd.push({ trucker: { contains: filters.trucker, mode: "insensitive" } });
  if (filters.mode) filterAnd.push({ mode: filters.mode });
  if (filters.status) filterAnd.push({ status: filters.status });
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

  const truckerRows = await prisma.delivery.findMany({
    where: { trucker: { not: null } },
    select: { trucker: true },
    distinct: ["trucker"],
  });
  const knownTruckers = truckerRows.map((t) => t.trucker as string);

  const [openRaw, deliveredRaw] = await Promise.all([
    prisma.delivery.findMany({
      where: { AND: [{ status: { in: OPEN_STATUSES } }, ...filterAnd] },
      select: LEG_SELECT,
    }),
    prisma.delivery.findMany({
      where: {
        AND: [
          {
            status: { in: DELIVERED },
            OR: [
              { deliveredAt: { gte: fourteenDaysAgo } },
              { deliveredAt: null, scheduledDeliveryDate: { gte: fourteenDaysAgo } },
              { deliveredAt: null, scheduledDeliveryDate: null, createdAt: { gte: fourteenDaysAgo } },
            ],
          },
          ...filterAnd,
        ],
      },
      select: LEG_SELECT,
    }),
  ]);

  // A leg whose own status pill already reads "scheduled" must land in the
  // Scheduled section even if its calendar date is missing or in the past -
  // otherwise the section list and the leg's own badge visibly disagree. Every
  // other open leg is judged by its date: a trucker slot when it has one, the
  // carrier ETA on a drop-ship that never gets one.
  const isScheduledStatus = (l: DeliveryLeg) => l.status === "scheduled";
  const needsAttentionRaw = openRaw.filter((l) => {
    const date = targetDate(l);
    return !isScheduledStatus(l) && (!date || date < startOfToday);
  });
  const scheduledRaw = openRaw.filter((l) => {
    const date = targetDate(l);
    return isScheduledStatus(l) || (date != null && date >= startOfToday);
  });

  const needsAttention = sortKey
    ? sortLegsBy(needsAttentionRaw, sortKey, sortDir)
    : sortLegs(needsAttentionRaw, (l) => targetDate(l) ?? l.order.neededByDate);
  const scheduled = sortKey
    ? sortLegsBy(scheduledRaw, sortKey, sortDir)
    : sortLegs(scheduledRaw, targetDate);
  const delivered = sortKey
    ? sortLegsBy(deliveredRaw, sortKey, sortDir)
    : sortLegs(deliveredRaw, (l) => l.deliveredAt ?? targetDate(l) ?? l.createdAt).reverse();

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
            Nothing overdue or unscheduled. A delivery lands here while it has no date on it, or once that date has
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
