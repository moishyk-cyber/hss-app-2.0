import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ORDER_URGENCIES, URGENCY_COLORS, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { fmtDate } from "../utils";
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
        <Link href="/orders" className="text-xs text-blue hover:underline">
          ← Back to Orders
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{order.title}</h1>
            <div className="mt-1 text-sm text-gray-dark">
              {order.company ? (
                <Link href={`/companies/${order.company.id}`} className="text-blue hover:underline">
                  {order.company.name}
                </Link>
              ) : (
                "—"
              )}
              {order.contact && <span> · {order.contact.firstName} {order.contact.lastName ?? ""}</span>}
              {order.owner && <span> · Owner: {order.owner.name}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`badge ${ORDER_STATUS_COLORS[order.status] ?? "badge-gray"}`}>
                {order.status.replace(/_/g, " ")}
              </span>
              <span className={`badge ${URGENCY_COLORS[order.urgency] ?? "badge-gray"}`}>
                {labelFor(ORDER_URGENCIES, order.urgency)}
              </span>
              <span className="badge badge-gray capitalize">{order.orderType}</span>
            </div>
          </div>
          <UrgencyStatusControls orderId={order.id} urgency={order.urgency} status={order.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-4">
          <div>
            <div className="field-label">Job ID</div>
            <div className="text-ink">{order.jobId ?? "—"}</div>
          </div>
          <div>
            <div className="field-label">Client PO #</div>
            <div className="text-ink">{order.clientPoNumber ?? "—"}</div>
          </div>
          <div>
            <div className="field-label">QuickBooks Invoice #</div>
            <QbInvoiceEdit orderId={order.id} value={order.quickbooksInvoiceNo} />
          </div>
          <div>
            <div className="field-label">Needed By</div>
            <div className="text-ink">{fmtDate(order.neededByDate)}</div>
          </div>
          <div className="col-span-2 md:col-span-4">
            <div className="field-label">Delivery Address</div>
            <div className="text-ink">{order.deliveryAddress ?? "—"}</div>
          </div>
        </div>
      </div>

      {suggestDelivered && (
        <div className="banner-info">
          All POs received and items arrived — consider marking this order <strong>Delivered</strong>.
        </div>
      )}

      {!hasPaidPayment && (
        <div className="banner-warn">
          <strong>Payment gate:</strong>{" "}
          {order.orderType === "project" ? "deposit" : "full"} payment required before POs are sent.
        </div>
      )}

      <section className="card p-4">
        <h2 className="section-label mb-3">Payments</h2>
        <PaymentsSection orderId={order.id} payments={order.payments} />
      </section>

      <section className="card p-4">
        <h2 className="section-label mb-3">Line Items</h2>
        <LineItemsSection items={order.lineItems} />
      </section>

      <section className="card p-4">
        <h2 className="section-label mb-3">Purchase Orders</h2>
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
