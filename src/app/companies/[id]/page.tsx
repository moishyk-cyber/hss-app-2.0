import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  OPPORTUNITY_STAGES,
  STAGE_COLORS,
  SERVICE_ISSUE_STATUSES,
  SERVICE_ISSUE_STATUS_COLORS,
  labelFor,
} from "@/lib/constants";
import { formatPhone } from "@/lib/ContactLinks";
import { fmtDateUTC } from "@/lib/dates";
import { plainMoney } from "@/lib/money";
import { LocationsCard } from "../LocationsCard";
import {
  Avatar,
  Card,
  DetailHeader,
  DetailRow,
  EmailLink,
  Empty,
  PhoneLink,
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
  // Opportunity/order money columns come back as Decimal; plain numbers here.
  const company = plainMoney(
    await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { firstName: "asc" } },
        // Sites this business takes delivery at (the Locations card below).
        locations: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
        opportunities: { orderBy: { createdAt: "desc" } },
        orders: { orderBy: { createdAt: "desc" } },
        // Service issues card below - open ones first, most recent on top.
        serviceIssues: { orderBy: { reportedAt: "desc" }, take: 10 },
      },
    })
  );
  if (!company) notFound();

  return (
    <div>
      <DetailHeader
        backHref="/phonebook"
        backLabel="Back to Phone Book"
        title={company.name}
        subtitle={company.locationName ?? undefined}
        avatar={<Avatar name={company.name} kind="business" />}
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
                  ? `${formatPhone(company.phone)}${company.phoneExt ? ` ext ${company.phoneExt}` : ""}`
                  : null
              }
              emptyLabel="no number on file"
            />
            <DetailRow label="Cell phone" value={formatPhone(company.cellPhone)} />
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
            <DetailRow label="Created" value={fmtDate(company.createdAt)} />
          </Card>

          {company.mondayId ? (
            <details className="mt-3 rounded-lg border border-border/70 px-3 py-2 text-gray">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.06em] text-gray">
                Sync info
              </summary>
              <div className="mt-2 flex gap-4 text-[12px]">
                <div className="w-28 shrink-0">Monday.com ID</div>
                <div className="min-w-0 break-words font-mono text-[11px]">{company.mondayId}</div>
              </div>
            </details>
          ) : null}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/*
            Locations: ask for the delivery address once, on the business, and let
            intake / the Close panel / the deal edit form pick it from here.
          */}
          <LocationsCard companyId={company.id} locations={company.locations} />

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
              // Same dense directory rows as the phone book: circle avatar for a person.
              <ul className="-mx-5 divide-y divide-border border-t border-border">
                {company.contacts.map((c) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
                  const hasDetails = Boolean(c.email || c.phone || c.cellPhone);
                  return (
                    <li
                      key={c.id}
                      className="relative flex items-center gap-3 px-5 py-2 transition-colors hover:bg-hover"
                    >
                      <Avatar name={name} kind="person" />

                      {/* Row-wide link; the mail and tel anchors sit above it (z-10). */}
                      <Link
                        href={`/contacts/${c.id}`}
                        className="min-w-0 flex-[2] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                      >
                        {name}
                      </Link>

                      <span className="hidden min-w-0 flex-1 truncate text-[13px] text-gray sm:block">
                        {c.title}
                      </span>

                      <span className="relative z-10 hidden min-w-0 flex-[2] md:block">
                        <EmailLink email={c.email} />
                      </span>

                      <span className="relative z-10 min-w-0 flex-[2]">
                        <PhoneLink
                          phone={c.phone ?? c.cellPhone}
                          ext={c.phone ? c.phoneExt : null}
                          label={c.phone ? "Phone" : "Cell"}
                        />
                      </span>

                      {hasDetails ? null : (
                        <span className="empty-value shrink-0">no contact details yet</span>
                      )}
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
              <ul className="-mx-5 divide-y divide-border border-t border-border">
                {company.opportunities.map((o) => (
                  <li
                    key={o.id}
                    className="relative flex items-center gap-3 px-5 py-2 transition-colors hover:bg-hover"
                  >
                    {/* Square avatar: a deal belongs to a business. */}
                    <Avatar name={o.title} kind="business" size="sm" />
                    <Link
                      href={`/pipeline/${o.id}`}
                      className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {o.title}
                    </Link>
                    <span className="shrink-0 text-[13px] tabular-nums text-gray-dark">
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
              <ul className="-mx-5 divide-y divide-border border-t border-border">
                {company.orders.map((o) => (
                  <li
                    key={o.id}
                    className="relative flex items-center gap-3 px-5 py-2 transition-colors hover:bg-hover"
                  >
                    {/* Square avatar: an order belongs to a business. */}
                    <Avatar name={o.title} kind="business" size="sm" />
                    <Link
                      href={`/orders/${o.id}`}
                      className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {o.title}
                    </Link>
                    <span className="shrink-0 text-[13px] tabular-nums text-gray-dark">
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

          <Card
            title={`Service issues (${company.serviceIssues.length})`}
            action={
              <Link href={`/service?companyId=${company.id}`} className="btn btn-sm">
                Log an issue
              </Link>
            }
          >
            {company.serviceIssues.length === 0 ? (
              <div className="empty-state">
                No service issues logged for this business.{" "}
                <Link
                  href={`/service?companyId=${company.id}`}
                  className="text-primary transition-colors hover:underline"
                >
                  Log one
                </Link>{" "}
                once a customer calls in a problem.
              </div>
            ) : (
              <ul className="-mx-5 divide-y divide-border border-t border-border">
                {company.serviceIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className="relative flex items-center gap-3 px-5 py-2 transition-colors hover:bg-hover"
                  >
                    <Link
                      href="/service"
                      className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {issue.title}
                    </Link>
                    <span className="shrink-0 text-[12px] text-gray-dark">{fmtDateUTC(issue.reportedAt)}</span>
                    <span className={`badge ${SERVICE_ISSUE_STATUS_COLORS[issue.status] ?? "badge-gray"}`}>
                      {labelFor(SERVICE_ISSUE_STATUSES, issue.status)}
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
