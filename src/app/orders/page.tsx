import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, URGENCY_COLORS, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { fmtDate, fmtMoney, paymentState, PAYMENT_STATE_COLORS } from "./utils";

export const dynamic = "force-dynamic";

const URGENCY_RANK: Record<string, number> = { emergency: 0, same_day: 1, standard: 2 };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; due?: string }>;
}) {
  const { status, due } = await searchParams;

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (due === "week") {
    where.neededByDate = { gte: now, lte: in7Days };
    where.status = { notIn: ["delivered", "complete"] };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { company: { select: { id: true, name: true } }, payments: { select: { status: true } } },
  });

  orders.sort((a, b) => {
    const ur = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
    if (ur !== 0) return ur;
    const ad = a.neededByDate ? new Date(a.neededByDate).getTime() : Infinity;
    const bd = b.neededByDate ? new Date(b.neededByDate).getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Orders</h1>
        <p className="page-sub">Fulfillment pipeline — payment, POs, delivery.</p>
      </div>

      <div className="flex flex-wrap gap-2">
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

      {orders.length === 0 ? (
        <div className="empty-state">
          {status || due ? (
            "No orders match this filter."
          ) : (
            <>
              No orders yet. Orders are created automatically when an opportunity is won, or directly from a
              simple intake.{" "}
              <Link href="/intake" className="text-blue transition-colors hover:underline">
                Go to Intake →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="table-klyne min-w-[900px]">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Type</th>
                <th>Value</th>
                <th>Needed By</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const accent =
                  order.urgency === "emergency"
                    ? "border-l-4 border-red"
                    : order.urgency === "same_day"
                    ? "border-l-4 border-orange"
                    : "";
                const ps = paymentState(order.payments);
                return (
                  <tr key={order.id} className={`transition-colors ${accent}`}>
                    <td>
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-blue transition-colors hover:underline"
                      >
                        {order.title}
                      </Link>
                    </td>
                    <td className="text-gray-dark">{order.company?.name ?? "—"}</td>
                    <td>
                      <span className={`badge ${ORDER_STATUS_COLORS[order.status] ?? "badge-gray"}`}>
                        {labelFor(ORDER_STATUSES, order.status)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${URGENCY_COLORS[order.urgency] ?? "badge-gray"}`}>
                        {order.urgency.replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-gray-dark capitalize">{order.orderType}</td>
                    <td className="text-gray-dark">{fmtMoney(order.orderValue)}</td>
                    <td className="text-gray-dark">{fmtDate(order.neededByDate)}</td>
                    <td>
                      <span className={`badge ${PAYMENT_STATE_COLORS[ps]}`}>{ps}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
