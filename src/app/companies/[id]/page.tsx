import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  OPPORTUNITY_STAGES,
  STAGE_COLORS,
  labelFor,
} from "@/lib/constants";
import {
  Card,
  DetailHeader,
  DetailRow,
  TypeBadge,
  VerticalLabel,
  fmtDate,
  fmtMoney,
} from "../_ui";

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
      <DetailHeader
        backHref="/phonebook"
        backLabel="Phone Book"
        title={company.name}
        subtitle={company.locationName ?? undefined}
        badges={
          <>
            <TypeBadge type={company.type} />
            {company.priorityClient ? <span className="badge badge-red">Priority</span> : null}
          </>
        }
        secondary={
          <Link href={`/companies/${company.id}/edit`} className="btn active:scale-[0.99]">
            Edit
          </Link>
        }
        action={
          <Link
            href={`/intake?companyId=${company.id}`}
            className="btn btn-primary active:scale-[0.99]"
          >
            New intake for this company
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Details">
            <DetailRow label="Type" value={<TypeBadge type={company.type} />} />
            <DetailRow label="Vertical" value={<VerticalLabel vertical={company.vertical} />} />
            <DetailRow
              label="Priority client"
              value={
                company.priorityClient ? (
                  <span className="badge badge-red">Priority</span>
                ) : (
                  "No"
                )
              }
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
              <Link href={`/contacts/new?companyId=${company.id}`} className="btn btn-sm">
                Add contact
              </Link>
            }
          >
            {company.contacts.length === 0 ? (
              <div className="empty-state">
                No people on file yet.{" "}
                <Link
                  href={`/contacts/new?companyId=${company.id}`}
                  className="text-accent transition-colors hover:underline"
                >
                  Add the first contact
                </Link>{" "}
                so calls and intakes have someone to reach.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {company.contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <div>
                      <Link
                        href={`/contacts/${c.id}/edit`}
                        className="font-medium text-ink transition-colors hover:text-accent"
                      >
                        {c.firstName} {c.lastName ?? ""}
                      </Link>
                      <div className="text-xs text-gray">
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
              <div className="empty-state">
                No deals yet. Start one from{" "}
                <Link
                  href={`/intake?companyId=${company.id}`}
                  className="text-accent transition-colors hover:underline"
                >
                  Intake
                </Link>{" "}
                — projects and anything needing a price land in the pipeline.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {company.opportunities.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                  >
                    <Link
                      href={`/pipeline/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-ink transition-colors hover:text-accent"
                    >
                      {o.title}
                    </Link>
                    <span className="text-gray-dark">{fmtMoney(o.value)}</span>
                    <span className={`badge ${STAGE_COLORS[o.stage] ?? "badge-gray"}`}>
                      {labelFor(OPPORTUNITY_STAGES, o.stage)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Orders (${company.orders.length})`}>
            {company.orders.length === 0 ? (
              <div className="empty-state">
                No orders yet. Orders appear here once a deal is marked Won, or straight from
                Intake when the pricing is already known.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {company.orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                  >
                    <Link
                      href={`/orders/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-ink transition-colors hover:text-accent"
                    >
                      {o.title}
                    </Link>
                    <span className="text-gray-dark">{fmtMoney(o.orderValue)}</span>
                    <span className={`badge ${ORDER_STATUS_COLORS[o.status] ?? "badge-gray"}`}>
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
