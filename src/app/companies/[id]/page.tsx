import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUSES,
  OPPORTUNITY_STAGES,
  STAGE_COLORS,
  labelFor,
} from "@/lib/constants";
import { Card, DetailRow, PageHeader, TypeBadge, VerticalLabel, fmtDate, fmtMoney } from "../_ui";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { firstName: "asc" } },
      opportunities: { orderBy: { createdAt: "desc" } },
      orders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!company) notFound();

  return (
    <div>
      <PageHeader
        title={company.name}
        subtitle={company.locationName ?? undefined}
      >
        <Link
          href={`/companies/${company.id}/edit`}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Edit
        </Link>
        <Link
          href="/companies"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Back to list
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Details">
            <DetailRow label="Type" value={<TypeBadge type={company.type} />} />
            <DetailRow label="Vertical" value={<VerticalLabel vertical={company.vertical} />} />
            <DetailRow
              label="Priority client"
              value={company.priorityClient ? "Yes" : "No"}
            />
            <DetailRow
              label="Phone"
              value={
                company.phone
                  ? `${company.phone}${company.phoneExt ? ` x${company.phoneExt}` : ""}`
                  : null
              }
            />
            <DetailRow label="Cell phone" value={company.cellPhone} />
            <DetailRow label="Email" value={company.email} />
            <DetailRow label="Website" value={company.website} />
            <DetailRow label="Delivery address" value={company.deliveryAddress} />
            <DetailRow label="Billing address" value={company.billingAddress} />
            <DetailRow label="Zip" value={company.zip} />
            <DetailRow label="Notes" value={company.notes} />
            <DetailRow label="monday id" value={company.mondayId} />
            <DetailRow label="Created" value={fmtDate(company.createdAt)} />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card
            title={`Contacts (${company.contacts.length})`}
            action={
              <Link
                href={`/contacts/new?companyId=${company.id}`}
                className="text-xs font-medium text-gray-600 underline hover:text-gray-900"
              >
                Add contact
              </Link>
            }
          >
            {company.contacts.length === 0 ? (
              <p className="text-sm text-gray-500">No contacts yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {company.contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <Link
                        href={`/contacts/${c.id}/edit`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {c.firstName} {c.lastName ?? ""}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Opportunities (${company.opportunities.length})`}>
            {company.opportunities.length === 0 ? (
              <p className="text-sm text-gray-500">No opportunities yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {company.opportunities.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link
                      href={`/pipeline/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-gray-900 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className="text-gray-600">{fmtMoney(o.value)}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        STAGE_COLORS[o.stage] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {labelFor(OPPORTUNITY_STAGES, o.stage)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Orders (${company.orders.length})`}>
            {company.orders.length === 0 ? (
              <p className="text-sm text-gray-500">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {company.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link
                      href={`/orders/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-gray-900 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className="text-gray-600">{fmtMoney(o.orderValue)}</span>
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {labelFor(ORDER_STATUSES, o.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
