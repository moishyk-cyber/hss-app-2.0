import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ORDER_URGENCIES, URGENCY_COLORS, labelFor } from "@/lib/constants";
import { fmtDate, ORDER_STATUS_COLORS } from "../utils";
import { UrgencyStatusControls, QbInvoiceEdit } from "./OrderHeaderControls";
import PaymentsSection from "./PaymentsSection";
import LineItemsSection from "./LineItemsSection";
import PurchaseOrdersSection from "./PurchaseOrdersSection";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      company: true,
      contact: true,
      owner: true,
      payments: true,
      lineItems: { include: { supplier: true }, orderBy: { createdAt: "asc" } },
      purchaseOrders: {
        include: { supplier: true, lineItems: { select: { id: true, name: true, qty: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) notFound();

  const hasPaidPayment = order.payments.some((p) => p.status === "paid");

  const unassignedMap = new Map<string, { supplierId: string; supplierName: string; count: number }>();
  for (const li of order.lineItems) {
    if (li.supplierId && !li.purchaseOrderId && li.rfqStatus !== "removed") {
      const existing = unassignedMap.get(li.supplierId);
      if (existing) existing.count += 1;
      else unassignedMap.set(li.supplierId, { supplierId: li.supplierId, supplierName: li.supplier?.name ?? "Supplier", count: 1 });
    }
  }
  const unassignedGroups = Array.from(unassignedMap.values());

  const activeLineItems = order.lineItems.filter((li) => li.rfqStatus !== "removed");
  const allPosReceived = order.purchaseOrders.length > 0 && order.purchaseOrders.every((po) => po.status === "received");
  const allItemsArrived = activeLineItems.length > 0 && activeLineItems.every((li) => li.deliveryStatus === "arrived_complete");
  const suggestDelivered = allPosReceived && allItemsArrived && !["delivered", "complete"].includes(order.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-xs text-blue-600 hover:underline">
          ← Back to Orders
        </Link>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{order.title}</h1>
            <div className="mt-1 text-sm text-gray-600">
              {order.company ? (
                <Link href={`/companies/${order.company.id}`} className="text-blue-600 hover:underline">
                  {order.company.name}
                </Link>
              ) : (
                "—"
              )}
              {order.contact && <span> · {order.contact.firstName} {order.contact.lastName ?? ""}</span>}
              {order.owner && <span> · Owner: {order.owner.name}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                {order.status.replace(/_/g, " ")}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY_COLORS[order.urgency] ?? "bg-gray-100 text-gray-700"}`}>
                {labelFor(ORDER_URGENCIES, order.urgency)}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
                {order.orderType}
              </span>
            </div>
          </div>
          <UrgencyStatusControls orderId={order.id} urgency={order.urgency} status={order.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs text-gray-400">Job ID</div>
            <div className="text-gray-800">{order.jobId ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Client PO #</div>
            <div className="text-gray-800">{order.clientPoNumber ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">QuickBooks Invoice #</div>
            <QbInvoiceEdit orderId={order.id} value={order.quickbooksInvoiceNo} />
          </div>
          <div>
            <div className="text-xs text-gray-400">Needed By</div>
            <div className="text-gray-800">{fmtDate(order.neededByDate)}</div>
          </div>
          <div className="col-span-2 md:col-span-4">
            <div className="text-xs text-gray-400">Delivery Address</div>
            <div className="text-gray-800">{order.deliveryAddress ?? "—"}</div>
          </div>
        </div>
      </div>

      {suggestDelivered && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          All POs received and items arrived — consider marking this order <strong>Delivered</strong>.
        </div>
      )}

      {!hasPaidPayment && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Payment gate:</strong>{" "}
          {order.orderType === "project" ? "deposit" : "full"} payment required before POs are sent.
        </div>
      )}

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Payments</h2>
        <PaymentsSection orderId={order.id} payments={order.payments} />
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Line Items</h2>
        <LineItemsSection items={order.lineItems} />
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Purchase Orders</h2>
        <PurchaseOrdersSection
          orderId={order.id}
          purchaseOrders={order.purchaseOrders}
          unassignedGroups={unassignedGroups}
          hasPaidPayment={hasPaidPayment}
        />
      </section>
    </div>
  );
}
