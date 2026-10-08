import type { ComponentProps } from "react";
import { prisma } from "@/lib/prisma";
import { uploadsConfigured } from "@/lib/storage";
import { EditableCompanyField, EditableContactField } from "./OrderPartyFields";
import FilesSection, { type FileDocData } from "./FilesSection";
import PurchaseOrdersSection from "./PurchaseOrdersSection";
import DeliverySection from "./DeliverySection";
import OrderIssuesPanel from "./OrderIssuesPanel";
import type { OrderSupportingReads } from "./supportingData";

export function SectionLoading({ name }: { name: string }) {
  return <p role="status" className="empty-value text-sm py-4">Loading {name}…</p>;
}

export async function OrderCompanyEditor({ companies, ...props }:
  Omit<ComponentProps<typeof EditableCompanyField>, "companies"> & { companies: OrderSupportingReads["companies"] }) {
  return <EditableCompanyField {...props} companies={await companies} />;
}
export async function OrderContactEditor({ contacts, ...props }:
  Omit<ComponentProps<typeof EditableContactField>, "contacts"> & { contacts: OrderSupportingReads["contacts"] }) {
  return <EditableContactField {...props} contacts={await contacts} />;
}

export async function OrderFiles({ orderId, opportunityId }: { orderId: string; opportunityId: string | null }) {
  const documents = await prisma.document.findMany({
    where: { OR: [
      { linkedType: "order", linkedId: orderId },
      ...(opportunityId ? [{ linkedType: "opportunity", linkedId: opportunityId }] : []),
    ] },
    orderBy: { uploadedAt: "desc" },
  });
  return <FilesSection linkedType="order" linkedId={orderId}
    docs={documents.filter(d => d.linkedType === "order")}
    ownLabel="On this order"
    inheritedDocs={documents.filter(d => d.linkedType === "opportunity")}
    inheritedLabel="From the deal" uploadsEnabled={uploadsConfigured()} />;
}

export async function OrderService({ issues, ...props }:
  Omit<ComponentProps<typeof OrderIssuesPanel>, "issues"> & { issues: OrderSupportingReads["issues"] }) {
  const rows = await issues;
  return <OrderIssuesPanel {...props} issues={rows.map(r => ({
    id: r.id, title: r.title, description: r.description, status: r.status,
    priority: r.priority, reportedAt: r.reportedAt, resolvedAt: r.resolvedAt,
    resolution: r.resolution, assigneeId: r.assigneeId,
    assigneeName: r.assignee?.name ?? null, company: r.company,
    location: r.location, order: r.order, lineItem: r.lineItem,
  }))} />;
}

export async function OrderPurchasing({ data, purchaseOrderIds, ...props }:
  Pick<ComponentProps<typeof PurchaseOrdersSection>, "orderId" | "unassignedLineItems" | "gate"> & { data: OrderSupportingReads; purchaseOrderIds: string[] }) {
  // The core record already has PO IDs; documents can run alongside PO details.
  const documentsPromise = purchaseOrderIds.length ? prisma.document.findMany({
    where: { linkedType: "purchase_order", linkedId: { in: purchaseOrderIds } },
    orderBy: { uploadedAt: "desc" },
  }) : Promise.resolve([]);
  const [purchaseOrders, vendors, documents] = await Promise.all([
    data.purchaseOrders, data.vendors, documentsPromise,
  ]);
  const documentsByPoId: Record<string, FileDocData[]> = {};
  for (const document of documents) (documentsByPoId[document.linkedId] ??= []).push(document);
  return <PurchaseOrdersSection {...props} purchaseOrders={purchaseOrders}
    vendors={vendors} documentsByPoId={documentsByPoId} uploadsEnabled={uploadsConfigured()} />;
}

export async function OrderDelivery({ data, ...props }:
  Pick<ComponentProps<typeof DeliverySection>, "orderId" | "users"> & { data: OrderSupportingReads }) {
  const [items, deliveries] = await Promise.all([data.items, data.deliveries]);
  return <DeliverySection {...props} items={items} deliveries={deliveries} />;
}
