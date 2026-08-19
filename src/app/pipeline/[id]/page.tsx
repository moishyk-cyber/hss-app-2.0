import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { markOpportunityLost, markOpportunityWon } from "../actions";
import {
  Card,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  DetailRow,
  DeliveryLabel,
  ORDER_TYPES,
  PageHeader,
  RfqBadge,
  StageBadge,
  fmtDate,
  fmtMoney,
} from "../_ui";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      company: true,
      primaryContact: true,
      salesperson: true,
      lineItems: { include: { supplier: { select: { id: true, name: true } } } },
      orders: { select: { id: true, title: true, status: true } },
    },
  });
  if (!opportunity) notFound();

  const closed = opportunity.stage === "won" || opportunity.stage === "lost";
  const isProject = opportunity.orderType === "project";

  return (
    <div>
      <PageHeader
        title={opportunity.title}
        subtitle={opportunity.company?.name ?? "No company linked"}
      >
        <Link href="/pipeline" className="btn">
          Back to pipeline
        </Link>
        <Link href={`/pipeline/${opportunity.id}/edit`} className="btn btn-primary">
          Edit
        </Link>
      </PageHeader>

      {error === "lost_reason_required" ? (
        <div className="banner-warn mb-4">
          A lost reason is required before a deal can be marked Lost.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card title="Deal">
            <DetailRow label="Stage" value={<StageBadge stage={opportunity.stage} />} />
            <DetailRow label="Order type" value={labelFor(ORDER_TYPES, opportunity.orderType)} />
            <DetailRow label="Needs pricing" value={opportunity.needsPricing ? "Yes" : "No"} />
            <DetailRow label="Value" value={fmtMoney(opportunity.value)} />
            <DetailRow label="Budget" value={fmtMoney(opportunity.budget)} />
            <DetailRow
              label="Company"
              value={
                opportunity.company ? (
                  <Link
                    href={`/companies/${opportunity.company.id}`}
                    className="text-blue hover:underline"
                  >
                    {opportunity.company.name}
                  </Link>
                ) : null
              }
            />
            <DetailRow
              label="Primary contact"
              value={
                opportunity.primaryContact
                  ? [opportunity.primaryContact.firstName, opportunity.primaryContact.lastName]
                      .filter(Boolean)
                      .join(" ")
                  : null
              }
            />
            <DetailRow label="Salesperson" value={opportunity.salesperson?.name ?? null} />
            <DetailRow label="Needed by" value={fmtDate(opportunity.neededByDate)} />
            <DetailRow label="Est./order due" value={fmtDate(opportunity.estDueDate)} />
            <DetailRow label="Next follow-up" value={fmtDate(opportunity.nextFollowUp)} />
            <DetailRow label="Submitted via" value={opportunity.submittedVia} />
            <DetailRow label="Created" value={fmtDate(opportunity.createdAt)} />
            {opportunity.lostReason ? (
              <DetailRow label="Lost reason" value={opportunity.lostReason} />
            ) : null}
          </Card>

          <Card title={isProject ? "Project details" : "Site details"}>
            <DetailRow label="Facility type" value={opportunity.facilityType} />
            <DetailRow label="Menu" value={opportunity.menu} />
            <DetailRow label="Room dimensions" value={opportunity.roomDimensions} />
            <DetailRow label="Wall measurements" value={opportunity.wallMeasurements} />
            <DetailRow
              label="Plumbing / electrical"
              value={opportunity.plumbingElectricalNotes}
            />
            <DetailRow
              label="Delivery type"
              value={labelFor(DELIVERY_TYPES, opportunity.deliveryType)}
            />
            <DetailRow label="Opening size" value={opportunity.openingSize} />
            <DetailRow
              label="Installation needed"
              value={opportunity.installationNeeded ? "Yes" : "No"}
            />
            <DetailRow
              label="Design status"
              value={labelFor(DESIGN_STATUSES, opportunity.designStatus)}
            />
            <DetailRow label="Location name" value={opportunity.locationName} />
            <DetailRow label="Delivery address" value={opportunity.deliveryAddress} />
            <DetailRow label="Client vision" value={opportunity.clientVisionNotes} />
            <DetailRow label="Notes" value={opportunity.notes} />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="section-label">Line items</h2>
              <span className="badge badge-gray">{opportunity.lineItems.length}</span>
            </div>
            {opportunity.lineItems.length === 0 ? (
              <div className="p-4">
                <div className="empty-state">No line items on this deal.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-klyne">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Supplier</th>
                      <th>Cost</th>
                      <th>Price</th>
                      <th>RFQ status</th>
                      <th>Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td>
                          <div className="font-medium text-ink">{li.name}</div>
                          {li.description ? (
                            <div className="text-xs text-gray">{li.description}</div>
                          ) : null}
                        </td>
                        <td className="text-gray-dark">{li.qty}</td>
                        <td className="text-gray-dark">{li.supplier?.name ?? "—"}</td>
                        <td className="text-gray-dark">{fmtMoney(li.unitCost)}</td>
                        <td className="text-gray-dark">{fmtMoney(li.unitPrice)}</td>
                        <td>
                          <RfqBadge status={li.rfqStatus} />
                        </td>
                        <td className="text-xs text-gray-dark">
                          <DeliveryLabel status={li.deliveryStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {opportunity.orders.length > 0 ? (
            <Card title="Orders">
              <ul className="divide-y divide-border">
                {opportunity.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-ink hover:text-blue"
                    >
                      {o.title}
                    </Link>
                    <span className={`badge ${ORDER_STATUS_COLORS[o.status] ?? "badge-gray"}`}>
                      {labelFor(ORDER_STATUSES, o.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Close this deal">
            {closed ? (
              <p className="text-[13px] text-gray-dark">
                This deal is already closed as{" "}
                <span className="font-medium text-ink">{opportunity.stage}</span>.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <form action={markOpportunityWon}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <p className="mb-3 text-[13px] text-gray-dark">
                    Creates an order, carries every non-removed line item across, and stages a{" "}
                    {isProject ? "30% deposit" : "full payment"} of{" "}
                    <span className="font-medium text-ink">
                      {fmtMoney(
                        Math.round(
                          isProject ? (opportunity.value ?? 0) * 0.3 : opportunity.value ?? 0
                        )
                      )}
                    </span>
                    .
                  </p>
                  <button type="submit" className="btn btn-primary">
                    Mark Won
                  </button>
                </form>

                <form action={markOpportunityLost}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <label className="block">
                    <span className="field-label">Lost reason (required)</span>
                    <input
                      type="text"
                      name="lostReason"
                      required
                      defaultValue={opportunity.lostReason ?? ""}
                      placeholder="Why did we lose it?"
                      className="input-klyne w-full"
                    />
                  </label>
                  <button type="submit" className="btn btn-danger mt-3">
                    Mark Lost
                  </button>
                </form>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
