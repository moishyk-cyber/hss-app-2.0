import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { DetailHeader } from "@/lib/PageLayout";
import InvoiceForm from "../InvoiceForm";

export default async function NewInvoicePage() {
  if (!await can("payments.edit")) {
    return <p role="alert" className="banner-alert">Your role cannot create billing records. Ask an admin for billing access.</p>;
  }
  const orders = await prisma.order.findMany({
    select: { id: true, title: true, jobId: true, company: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return <div className="mx-auto max-w-3xl">
    <DetailHeader backHref="/invoices" backLabel="Back to Invoices" title="New billing record" subtitle="Record a deposit or invoice and set its due date." />
    <InvoiceForm orders={orders.map(o => ({ id: o.id, name: `${o.title}${o.company ? ` · ${o.company.name}` : ""}${o.jobId ? ` · ${o.jobId}` : ""}` }))} />
  </div>;
}
