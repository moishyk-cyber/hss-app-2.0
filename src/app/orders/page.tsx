import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, URGENCY_COLORS, labelFor } from "@/lib/constants";
import { fmtDate, fmtMoney, paymentState, PAYMENT_STATE_COLORS, ORDER_STATUS_COLORS } from "./utils";

export const dynamic = "force-dynamic";

const URGENCY_RANK: Record<string, number> = { emergency: 0, same_day: 1, standard: 2 };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { company: true, payments: { select: { status: true } } },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Fulfillment pipeline — payment, POs, delivery.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/orders"
          className={`rounded-full border px-3 py-1 font-medium ${
            !status ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
          }`}
        >
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/orders?status=${s.value}`}
            className={`rounded-full border px-3 py-1 font-medium ${
              status === s.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          No orders found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pl-3 pr-3 font-medium">Title</th>
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Urgency</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Needed By</th>
                <th className="py-2 pr-3 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const accent =
                  order.urgency === "emergency"
                    ? "border-l-4 border-l-red-500"
                    : order.urgency === "same_day"
                    ? "border-l-4 border-l-amber-500"
                    : "";
                const ps = paymentState(order.payments);
                return (
                  <tr key={order.id} className={`border-b border-gray-100 last:border-0 ${accent}`}>
                    <td className="py-2 pl-3 pr-3">
                      <Link href={`/orders/${order.id}`} className="font-medium text-blue-600 hover:underline">
                        {order.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{order.company?.name ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {labelFor(ORDER_STATUSES, order.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          URGENCY_COLORS[order.urgency] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {order.urgency.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-700 capitalize">{order.orderType}</td>
                    <td className="py-2 pr-3 text-gray-700">{fmtMoney(order.orderValue)}</td>
                    <td className="py-2 pr-3 text-gray-700">{fmtDate(order.neededByDate)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATE_COLORS[ps]}`}>
                        {ps}
                      </span>
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
