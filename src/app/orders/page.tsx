import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, ORDER_URGENCIES, URGENCY_COLORS, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { fmtDate, fmtMoney, paymentState, PAYMENT_STATE_COLORS } from "./utils";

export const dynamic = "force-dynamic";

const URGENCY_RANK: Record<string, number> = { emergency: 0, same_day: 1, standard: 2 };

// Not a shared enum in lib/constants.ts (only two values, order-module local).
const ORDER_TYPE_OPTIONS = [
  { value: "order", label: "Order" },
  { value: "project", label: "Project" },
] as const;

type OrdersSearchParams = { status?: string; due?: string } & Record<string, string | string[] | undefined>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  const sp = await searchParams;
  const { status, due } = sp;

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Status keeps its own chips above (?status=) - filterable:false here so the
  // two controls never fight over the same value.
  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "company", label: "Company", type: "text" },
    { key: "status", label: "Status", type: "enum", options: ORDER_STATUSES, filterable: false },
    { key: "urgency", label: "Urgency", type: "enum", options: ORDER_URGENCIES },
    { key: "orderType", label: "Order Type", type: "enum", options: ORDER_TYPE_OPTIONS },
    { key: "value", label: "Value", type: "number", filterable: false },
    { key: "neededBy", label: "Needed By", type: "date" },
    { key: "owner", label: "Owner", type: "enum", options: users.map((u) => ({ value: u.id, label: u.name })) },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (due === "week") {
    where.neededByDate = { gte: now, lte: in7Days };
    where.status = { notIn: ["delivered", "complete"] };
  }
  if (filters.title) where.title = { contains: filters.title, mode: "insensitive" };
  if (filters.company) where.company = { name: { contains: filters.company, mode: "insensitive" } };
  if (filters.urgency) where.urgency = filters.urgency;
  if (filters.orderType) where.orderType = filters.orderType;
  if (filters.owner) where.ownerId = filters.owner;
  if (filters.neededBy) {
    const day = new Date(filters.neededBy);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.neededByDate = { gte: day, lt: nextDay };
  }

  const ORDER_BY: Record<string, Prisma.OrderOrderByWithRelationInput> = {
    title: { title: sortDir },
    company: { company: { name: sortDir } },
    status: { status: sortDir },
    urgency: { urgency: sortDir },
    orderType: { orderType: sortDir },
    value: { orderValue: sortDir },
    neededBy: { neededByDate: sortDir },
    owner: { owner: { name: sortDir } },
  };
  const orderBy = sortKey ? ORDER_BY[sortKey] : undefined;

  const orders = await prisma.order.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      payments: { select: { status: true } },
    },
    ...(orderBy ? { orderBy } : {}),
  });

  // Default view (no explicit sort chosen): urgent first, then soonest needed-by.
  if (!orderBy) {
    orders.sort((a, b) => {
      const ur = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
      if (ur !== 0) return ur;
      const ad = a.neededByDate ? new Date(a.neededByDate).getTime() : Infinity;
      const bd = b.neededByDate ? new Date(b.neededByDate).getTime() : Infinity;
      return ad - bd;
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Orders</h1>
        <p className="page-sub">Fulfillment pipeline - payment, POs, delivery.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/orders" className={!status && !due ? "chip chip-active" : "chip"}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s.value} href={`/orders?status=${s.value}`} className={status === s.value ? "chip chip-active" : "chip"}>
            {s.label}
          </Link>
        ))}
        <Link href="/orders?due=week" className={due === "week" ? "chip chip-active" : "chip"}>
          Due this week
        </Link>
      </div>

      <Suspense>
        <ListControls fields={FIELDS} />
      </Suspense>

      {orders.length === 0 ? (
        <div className="empty-state">
          {status || due ? (
            "No orders match this filter."
          ) : (
            <>
              No orders yet. Orders are created automatically when an opportunity is won, or directly from a
              simple intake.{" "}
              <Link href="/intake" className="text-blue transition-colors hover:underline">
                Go to Intake
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          <ul className="divide-y divide-border">
            {orders.map((order) => {
              const accent =
                order.urgency === "emergency"
                  ? "border-l-4 border-red"
                  : order.urgency === "same_day"
                  ? "border-l-4 border-orange"
                  : "";
              const ps = paymentState(order.payments);
              return (
                <li
                  key={order.id}
                  className={`relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover ${accent}`}
                >
                  <Avatar name={order.company?.name ?? "?"} kind="business" size="sm" />

                  <Link
                    href={`/orders/${order.id}`}
                    className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {order.title}
                  </Link>

                  <span className="hidden w-20 shrink-0 text-right text-[12.5px] font-medium tabular-nums text-gray-dark sm:block">
                    {fmtMoney(order.orderValue)}
                  </span>

                  {/* Quiet by default (Moishy: "too many details") - badges only
                      when they say something: urgency only when urgent, payment
                      only while money is still owed. */}
                  {order.urgency !== "standard" ? (
                    <span className="hidden shrink-0 sm:block">
                      <span className={`badge ${URGENCY_COLORS[order.urgency] ?? "badge-gray"}`}>
                        {order.urgency.replace("_", " ")}
                      </span>
                    </span>
                  ) : null}

                  <span className="shrink-0">
                    <span className={`badge ${ORDER_STATUS_COLORS[order.status] ?? "badge-gray"}`}>
                      {labelFor(ORDER_STATUSES, order.status)}
                    </span>
                  </span>

                  {ps !== "paid" ? (
                    <span className="hidden shrink-0 md:block">
                      <span className={`badge ${PAYMENT_STATE_COLORS[ps]}`}>{ps}</span>
                    </span>
                  ) : null}

                  <span className="hidden shrink-0 text-[12px] text-gray-dark lg:block">
                    {fmtDate(order.neededByDate)}
                  </span>

                  <span className="relative z-10 shrink-0">
                    {order.owner ? (
                      <span title={order.owner.name}>
                        <Avatar name={order.owner.name} kind="person" size="sm" />
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
