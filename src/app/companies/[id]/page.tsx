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
  Empty,
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
        backLabel="Back to Phone Book"
        title={company.name}
        subtitle={company.locationName ?? undefined}
        badges={
          <>
            <TypeBadge type={company.type} />
            {company.priorityClient ? <span className="badge badge-blue">Priority</span> : null}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Details">
            <DetailRow label="Type" value={<TypeBadge type={company.type} />} />
            <DetailRow
              label="Vertical"
              value={<VerticalLabel vertical={company.vertical} />}
            />
            {company.priorityClient ? (
              <DetailRow
                label="Priority client"
                value={<span className="badge badge-blue">Priority</span>}
              />
            ) : null}
            <DetailRow
              label="Deposit"
              value={
                company.requiresDeposit
                  ? `${company.depositPercent}% required`
                  : "not required - full payment after delivery"
              }
            />
            <DetailRow
              label="Phone"
              value={
                company.phone
                  ? `${company.phone}${company.phoneExt ? ` ext ${company.phoneExt}` : ""}`
                  : null
              }
              emptyLabel="no number on file"
            />
            <DetailRow label="Cell phone" value={company.cellPhone} />
            <DetailRow label="Email" value={company.email} emptyLabel="no email on file" />
            <DetailRow label="Website" value={company.website} />
            <DetailRow
              label="Delivery address"
              value={company.deliveryAddress}
              emptyLabel="not set"
            />
            <DetailRow label="Billing address" value={company.billingAddress} />
            <DetailRow label="Zip" value={company.zip} />
            <DetailRow label="Notes" value={company.notes} />
            <DetailRow label="monday id" value={company.mondayId} />
            <DetailRow label="Created" value={fmtDate(company.createdAt)} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
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
                  className="text-primary transition-colors hover:underline"
                >
                  Add the first contact
                </Link>{" "}
                so calls and intakes have someone to reach.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {company.contacts.map((c) => {
                  const detail = [c.title, c.email, c.phone].filter(Boolean).join(" · ");
                  return (
                    <li key={c.id} className="py-3 text-[13px] first:pt-0 last:pb-0">
                      <Link
                        href={`/contacts/${c.id}/edit`}
                        className="font-medium text-ink hover:underline"
                      >
                        {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                      </Link>
                      <div className="mt-1 text-xs text-gray">
                        {detail || <span className="empty-value">no contact details yet</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={`Opportunities (${company.opportunities.length})`}>
            {company.opportunities.length === 0 ? (
              <div className="empty-state">
                No deals yet. Start one from{" "}
                <Link
                  href={`/intake?companyId=${company.id}`}
                  className="text-primary transition-colors hover:underline"
                >
                  Intake
                </Link>{" "}
                - projects and anything needing a price land in the pipeline.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {company.opportunities.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-4 py-3 text-[13px] first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/pipeline/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className="shrink-0 text-gray-dark tabular-nums">
                      {fmtMoney(o.value) ?? <Empty>no value yet</Empty>}
                    </span>
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
                    className="flex items-center justify-between gap-4 py-3 text-[13px] first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/orders/${o.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className="shrink-0 text-gray-dark tabular-nums">
                      {fmtMoney(o.orderValue) ?? <Empty>no value yet</Empty>}
                    </span>
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
