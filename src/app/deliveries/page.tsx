import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { CollectionGroup, SortHeader, TableRows } from "@/lib/CollectionViews";
import { PageHeader } from "@/lib/PageLayout";
import Link from "@/lib/IntentLink";
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
import { DeliveryStatusPill } from "./DeliveryStatusPill";
import { TruckerSelect } from "./TruckerSelect";
import { hasTruckerLeg } from "./_ui";

export const dynamic = "force-dynamic";

const FIELDS: ListField[] = [
  { key: "supplier", label: "Supplier", type: "text" },
  { key: "trucker", label: "Trucker", type: "text" },
  {
    key: "mode",
    label: "Delivery Mode",
    type: "enum",
    options: DELIVERY_MODES,
  },
  { key: "scheduledDate", label: "Scheduled Date", type: "date" },
  { key: "expectedDate", label: "Expected Date", type: "date" },
  {
    key: "status",
    label: "Delivery Status",
    type: "enum",
    options: DELIVERY_LEG_STATUSES,
  },
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
  purchaseOrder: {
    select: { poNumber: true, supplier: { select: { name: true } } },
  },
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
function sortLegs(
  legs: DeliveryLeg[],
  dateOf: (l: DeliveryLeg) => Date | null,
): DeliveryLeg[] {
  return [...legs].sort((a, b) => {
    const nd =
      (a.order.neededByDate?.getTime() ?? FAR_FUTURE) -
      (b.order.neededByDate?.getTime() ?? FAR_FUTURE);
    if (nd !== 0) return nd;
    const ad = dateOf(a)?.getTime() ?? FAR_FUTURE;
    const bd = dateOf(b)?.getTime() ?? FAR_FUTURE;
    if (ad !== bd) return ad - bd;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Explicit Sort by choice from ListControls - overrides the due-date default within each group. */
function sortLegsBy(
  legs: DeliveryLeg[],
  key: string,
  dir: "asc" | "desc",
): DeliveryLeg[] {
  const factor = dir === "desc" ? -1 : 1;
  return [...legs].sort((a, b) => {
    switch (key) {
      case "supplier":
        return (
          factor * (supplierName(a) ?? "").localeCompare(supplierName(b) ?? "")
        );
      case "trucker":
        return factor * (a.trucker ?? "").localeCompare(b.trucker ?? "");
      case "mode":
        return factor * a.mode.localeCompare(b.mode);
      case "scheduledDate":
        return (
          factor *
          ((a.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE) -
            (b.scheduledDeliveryDate?.getTime() ?? FAR_FUTURE))
        );
      case "expectedDate":
        return (
          factor *
          ((a.expectedDelivery?.getTime() ?? FAR_FUTURE) -
            (b.expectedDelivery?.getTime() ?? FAR_FUTURE))
        );
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

/**
 * Reliability spec P0-3: the old version was a flex row with several columns
 * (mode, trucker, dates) simply `hidden` below a breakpoint - at a 1280px
 * desktop viewport with real 20-leg data it collapsed into a near-unreadable
 * strip. This is a real table instead: every column stays visible at every
 * desktop width, min-widths keep labels from wrapping character-by-character,
 * and the identifier column is sticky so a row's identity survives horizontal
 * scroll on narrower screens rather than columns disappearing.
 */
function LegTable({
  legs,
  truckers,
}: {
  legs: DeliveryLeg[];
  truckers: string[];
}) {
  return (
    <div className="table-scroll">
      <table className="table-klyne min-w-[1180px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-surface">Order / PO</th>
            <SortHeader field="supplier">Vendor</SortHeader>
            <SortHeader field="mode">Mode</SortHeader>
            <SortHeader field="trucker">Trucker</SortHeader>
            <SortHeader field="scheduledDate">Scheduled</SortHeader>
            <SortHeader field="expectedDate">Expected</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <th>Tracking</th>
          </tr>
        </thead>
        <TableRows columns={8}>
          {legs.map((leg) => {
            const vendor = supplierName(leg);
            const itemCount = leg._count.lineItems;
            const overdue = isOverdueLeg(leg);
            const identifier = `${leg.purchaseOrder?.poNumber ?? "HSS stock"} - ${leg.order.title}`;
            return (
              <tr
                key={leg.id}
                className="group align-top transition-colors hover:bg-hover"
              >
                <td className="sticky left-0 z-10 min-w-[260px] max-w-[320px] bg-surface align-top group-hover:bg-hover">
                  <Link
                    href={`/deliveries/${leg.id}`}
                    className="block min-w-0"
                  >
                    <div
                      className="truncate text-[13.5px] font-semibold text-ink"
                      title={identifier}
                    >
                      {identifier}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-dark">
                      {overdue ? (
                        <span className="badge badge-red">overdue</span>
                      ) : leg.order.neededByDate ? (
                        <span>due {fmtDate(leg.order.neededByDate)}</span>
                      ) : (
                        <span className="empty-value">no due date</span>
                      )}
                      <span>
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                </td>

                <td className="min-w-[160px] align-top">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={vendor ?? "HSS"} kind="business" size="sm" />
                    <span
                      className="min-w-0 truncate text-[12px] text-gray-dark"
                      title={vendor ?? undefined}
                    >
                      {vendor ?? <span className="empty-value">HSS stock</span>}
                    </span>
                  </span>
                </td>

                <td className="min-w-[150px] align-top">
                  <span
                    className={`badge ${DELIVERY_MODE_COLORS[leg.mode] ?? "badge-gray"}`}
                  >
                    {labelFor(DELIVERY_MODES, leg.mode)}
                  </span>
                </td>

                <td className="min-w-[170px] align-top">
                  {hasTruckerLeg(leg.mode) ? (
                    <TruckerSelect
                      deliveryId={leg.id}
                      value={leg.trucker}
                      truckers={truckers}
                    />
                  ) : (
                    <span className="empty-value text-[12px]">
                      carrier delivery
                    </span>
                  )}
                </td>

                <td className="min-w-[120px] whitespace-nowrap align-top text-[12px] text-gray-dark">
                  {leg.scheduledDeliveryDate ? (
                    fmtDate(leg.scheduledDeliveryDate)
                  ) : (
                    <span className="empty-value">not scheduled</span>
                  )}
                </td>

                <td className="min-w-[110px] whitespace-nowrap align-top text-[12px] text-gray-dark">
                  {leg.expectedDelivery ? (
                    fmtDate(leg.expectedDelivery)
                  ) : (
                    <span className="empty-value">not set</span>
                  )}
                </td>

                <td className="min-w-[150px] align-top">
                  <DeliveryStatusPill deliveryId={leg.id} value={leg.status} />
                </td>

                <td className="min-w-[90px] max-w-[140px] truncate align-top text-[12px]">
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
                    <span
                      className="empty-value"
                      title={leg.trackingUrl ?? undefined}
                    >
                      no link
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </TableRows>
      </table>
    </div>
  );
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<DeliveriesSearchParams>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const fourteenDaysAgo = new Date(
    startOfToday.getTime() - 14 * 24 * 60 * 60 * 1000,
  );

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Both queries below share the same filter set so a filter applies across
  // all three sections at once.
  const filterAnd: Prisma.DeliveryWhereInput[] = [];
  if (filters.supplier) {
    filterAnd.push({
      purchaseOrder: {
        supplier: { name: { contains: filters.supplier, mode: "insensitive" } },
      },
    });
  }
  if (filters.trucker)
    filterAnd.push({
      trucker: { contains: filters.trucker, mode: "insensitive" },
    });
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

  const nestedWhere = compileFilterTree<Prisma.DeliveryWhereInput>(
    FIELDS,
    sp.filter_tree,
    {
      supplier: "purchaseOrder.supplier.name",
      trucker: "trucker",
      mode: "mode",
      scheduledDate: "scheduledDeliveryDate",
      expectedDate: "expectedDelivery",
      status: "status",
    },
  );
  if (nestedWhere) filterAnd.push(nestedWhere);

  const ORDER_BY: Record<string, Prisma.DeliveryOrderByWithRelationInput> = {
    supplier: { purchaseOrder: { supplier: { name: sortDir } } },
    trucker: { trucker: sortDir },
    mode: { mode: sortDir },
    scheduledDate: { scheduledDeliveryDate: { sort: sortDir, nulls: "last" } },
    expectedDate: { expectedDelivery: { sort: sortDir, nulls: "last" } },
    status: { status: sortDir },
  };
  const openOrder: Prisma.DeliveryOrderByWithRelationInput[] = [
    (sortKey ? ORDER_BY[sortKey] : undefined) ?? {
      order: { neededByDate: { sort: "asc", nulls: "last" } },
    },
    { scheduledDeliveryDate: { sort: "asc", nulls: "last" } },
    { createdAt: "asc" },
    { id: "asc" },
  ];
  const recentOrder: Prisma.DeliveryOrderByWithRelationInput[] = [
    (sortKey ? ORDER_BY[sortKey] : undefined) ?? {
      deliveredAt: { sort: "desc", nulls: "last" },
    },
    { id: "asc" },
  ];

  const [truckerRows, openRaw, deliveredRaw] = await Promise.all([
    prisma.delivery.findMany({
      where: { trucker: { not: null } },
      select: { trucker: true },
      distinct: ["trucker"],
    }),
    prisma.delivery.findMany({
      take: limit + 1,
      orderBy: openOrder,
      where: { AND: [{ status: { in: OPEN_STATUSES } }, ...filterAnd] },
      select: LEG_SELECT,
    }),
    prisma.delivery.findMany({
      take: limit + 1,
      orderBy: recentOrder,
      where: {
        AND: [
          {
            status: { in: DELIVERED },
            OR: [
              { deliveredAt: { gte: fourteenDaysAgo } },
              {
                deliveredAt: null,
                scheduledDeliveryDate: { gte: fourteenDaysAgo },
              },
              {
                deliveredAt: null,
                scheduledDeliveryDate: null,
                createdAt: { gte: fourteenDaysAgo },
              },
            ],
          },
          ...filterAnd,
        ],
      },
      select: LEG_SELECT,
    }),
  ]);

  const knownTruckers = truckerRows.map((t) => t.trucker as string);

  const hasMore = openRaw.length > limit || deliveredRaw.length > limit;
  if (openRaw.length > limit) openRaw.pop();
  if (deliveredRaw.length > limit) deliveredRaw.pop();

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
    : sortLegs(
        deliveredRaw,
        (l) => l.deliveredAt ?? targetDate(l) ?? l.createdAt,
      ).reverse();

  const totalOpen = needsAttention.length + scheduled.length;
  const groupKey = typeof sp.group === "string" ? sp.group : "stage";
  const defaultGroups = [
    { label: "Needs scheduling / Overdue", legs: needsAttention },
    { label: "Scheduled", legs: scheduled },
    { label: "Recently delivered", legs: delivered },
  ];
  const grouped = new Map<string, DeliveryLeg[]>();
  if (groupKey !== "stage")
    for (const leg of [...needsAttention, ...scheduled, ...delivered]) {
      const key =
        groupKey === "none"
          ? "All deliveries"
          : groupKey === "mode"
            ? labelFor(DELIVERY_MODES, leg.mode)
            : labelFor(DELIVERY_LEG_STATUSES, leg.status);
      const group = grouped.get(key);
      if (group) group.push(leg);
      else grouped.set(key, [leg]);
    }
  const groups =
    groupKey === "stage"
      ? defaultGroups
      : Array.from(grouped, ([label, legs]) => ({ label, legs }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deliveries"
        subtitle="Every delivery leg in flight — vendor, trucker, and the date it lands."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={totalOpen + delivered.length}
            />
          </Suspense>
        }
      />

      {groups.map((group) => (
        <CollectionGroup
          flat={groupKey === "none"}
          key={group.label}
          title={group.label}
          count={group.legs.length}
        >
          {group.legs.length ? (
            <LegTable legs={group.legs} truckers={knownTruckers} />
          ) : (
            <div className="empty-state">No deliveries in this group.</div>
          )}
        </CollectionGroup>
      ))}
      <MoreRecords href="/deliveries" limit={limit} hasMore={hasMore} />
    </div>
  );
}
