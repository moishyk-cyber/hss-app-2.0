import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit } from "@/lib/CollectionWindow";
import { CollectionGroup, SortHeader, TableRows } from "@/lib/CollectionViews";
import Link from "@/lib/IntentLink";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import DeliveryCollection from "./DeliveryCollection";
import { deliveryLane, deliveryLanes } from "./boardConfig";
import { loadDeliveryCollection } from "./collectionData";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_COLORS,
  DELIVERY_LEG_STATUSES,
  labelFor,
} from "@/lib/constants";
import { isPastDay } from "@/lib/dates";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { fmtDate, isLikelyTrackingUrl, paymentState } from "../orders/utils";
import { DeliveryStatusPill } from "./DeliveryStatusPill";
import { TruckerSelect } from "./TruckerSelect";
import { hasTruckerLeg, manufacturerShipmentStatus } from "./_ui";

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
  order: { select: { id: true, title: true, neededByDate: true, payments: { select: { status: true } } } },
  purchaseOrder: {
    select: { poNumber: true, supplier: { select: { name: true } } },
  },
  lineItems: { where: { rfqStatus: { not: "removed" } }, select: { deliveryStatus: true } },
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
  return paymentState(leg.order.payments) !== "paid" && isPastDay(leg.order.neededByDate) && !DELIVERED.includes(leg.status);
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
      <table className="table-klyne min-w-[1100px]">
        <thead>
          <tr>
            <SortHeader field="supplier">Delivery / vendor</SortHeader>
            <SortHeader field="mode">Mode</SortHeader>
            <SortHeader field="trucker">Trucker</SortHeader>
            <SortHeader field="scheduledDate">Scheduled</SortHeader>
            <SortHeader field="expectedDate">Expected</SortHeader>
            <th>Shipment / tracking</th>
            <SortHeader field="status">Delivery status</SortHeader>
          </tr>
        </thead>
        <TableRows columns={7}>
          {legs.map((leg) => {
            const vendor = supplierName(leg);
            const overdue = isOverdueLeg(leg);
            const identifier = `${leg.purchaseOrder?.poNumber ?? "HSS stock"} - ${leg.order.title}`;
            return (
              <tr
                key={leg.id}
                className="group align-top transition-colors hover:bg-hover"
              >
                <td className="sticky left-0 z-10 min-w-[220px] max-w-[280px] bg-surface align-top group-hover:bg-hover">
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
                    <div className="mt-0.5 truncate text-xs text-gray-dark" title={vendor ?? undefined}>{vendor ?? "HSS stock"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-dark">
                      {leg.order.neededByDate ? (
                        <span className={overdue ? "font-medium text-red" : undefined}>due {fmtDate(leg.order.neededByDate)}</span>
                      ) : (
                        <span className="empty-value">no due date</span>
                      )}
                    </div>
                  </Link>
                </td>

                <td className="min-w-[130px] align-top">
                  <span
                    className={`badge ${DELIVERY_MODE_COLORS[leg.mode] ?? "badge-gray"}`}
                  >
                    {labelFor(DELIVERY_MODES, leg.mode)}
                  </span>
                </td>

                <td className="min-w-[130px] align-top">
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

                <td className="min-w-[100px] whitespace-nowrap align-top text-[12px] text-gray-dark">
                  {leg.scheduledDeliveryDate ? (
                    fmtDate(leg.scheduledDeliveryDate)
                  ) : (
                    <span className="empty-value">not scheduled</span>
                  )}
                </td>

                <td className="min-w-[100px] whitespace-nowrap align-top text-[12px] text-gray-dark">
                  {leg.expectedDelivery ? (
                    fmtDate(leg.expectedDelivery)
                  ) : (
                    <span className="empty-value">not set</span>
                  )}
                </td>

                <td className="min-w-[160px] align-top text-[12px] text-gray-dark">
                  <div>{manufacturerShipmentStatus(leg) ?? <span className="empty-value">HSS delivery</span>}</div>
                  {leg.trackingUrl && isLikelyTrackingUrl(leg.trackingUrl) ? (
                    <a href={leg.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 block text-blue hover:underline">
                      Track{leg.trackingCarrier ? ` · ${leg.trackingCarrier}` : " shipment"}
                    </a>
                  ) : (
                    <div className="mt-1 empty-value" title={leg.trackingUrl ?? undefined}>{leg.trackingCarrier ?? "No tracking link"}</div>
                  )}
                </td>

                <td className="min-w-[130px] align-top">
                  <DeliveryStatusPill deliveryId={leg.id} value={leg.status} />
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
  const where: Prisma.DeliveryWhereInput = { AND: [
    ...filterAnd,
    { OR: [
      { status: { in: OPEN_STATUSES } },
      { status: { in: DELIVERED }, OR: [
        { deliveredAt: { gte: fourteenDaysAgo } },
        { deliveredAt: null, scheduledDeliveryDate: { gte: fourteenDaysAgo } },
        { deliveredAt: null, scheduledDeliveryDate: null, createdAt: { gte: fourteenDaysAgo } },
      ] },
    ] },
  ] };
  const [truckerRows, collection, canEdit] = await Promise.all([
    prisma.delivery.findMany({ where: { trucker: { not: null } }, select: { trucker: true }, distinct: ["trucker"] }),
    loadDeliveryCollection(
      (where, take) => prisma.delivery.findMany({ where, take, orderBy: openOrder, select: LEG_SELECT }),
      where, limit,
      (where, take) => prisma.delivery.findMany({ where, take, orderBy: openOrder, select: { id: true } }),
    ),
    can("deliveries.edit"),
  ]);
  const knownTruckers = truckerRows.map(row => row.trucker as string);
  const { hasMore } = collection;
  const openRaw = collection.rows.filter(row => OPEN_STATUSES.includes(row.status));
  const deliveredRaw = collection.rows.filter(row => DELIVERED.includes(row.status));

  const open = sortKey
    ? sortLegsBy(openRaw, sortKey, sortDir)
    : sortLegs(openRaw, targetDate);
  const delivered = sortKey
    ? sortLegsBy(deliveredRaw, sortKey, sortDir)
    : sortLegs(
        deliveredRaw,
        (l) => l.deliveredAt ?? targetDate(l) ?? l.createdAt,
      ).reverse();

  const groupKey = typeof sp.group === "string" ? sp.group : "stage";
  const rows = [...open, ...delivered];
  const group = groupKey === "mode" ? "mode" : "stage";
  const groups = groupKey === "none" ? [{ label: "All deliveries", legs: rows }] :
    deliveryLanes(group).map(lane => ({ label: lane.label, legs: rows.filter(row => deliveryLane(row, group) === lane.value) }));

  return (
    <DeliveryCollection rows={rows} fields={FIELDS} canEdit={canEdit} hasMore={hasMore} limit={limit}>
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
    </DeliveryCollection>
  );
}
