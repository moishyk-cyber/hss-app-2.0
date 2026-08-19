import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
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
        <Link
          href={`/pipeline/${opportunity.id}/edit`}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Edit
        </Link>
        <Link
          href="/pipeline"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Back to pipeline
        </Link>
      </PageHeader>

      {error === "lost_reason_required" ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
                    className="text-gray-900 hover:underline"
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
          <Card title={`Line items (${opportunity.lineItems.length})`}>
            {opportunity.lineItems.length === 0 ? (
              <p className="text-sm text-gray-500">No line items on this deal.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-1 font-medium">Item</th>
                      <th className="py-1 font-medium">Qty</th>
                      <th className="py-1 font-medium">Supplier</th>
                      <th className="py-1 font-medium">Cost</th>
                      <th className="py-1 font-medium">Price</th>
                      <th className="py-1 font-medium">RFQ status</th>
                      <th className="py-1 font-medium">Delivery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {opportunity.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="py-1.5 pr-3">
                          <div className="font-medium text-gray-900">{li.name}</div>
                          {li.description ? (
                            <div className="text-xs text-gray-500">{li.description}</div>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">{li.qty}</td>
                        <td className="py-1.5 pr-3 text-gray-600">
                          {li.supplier?.name ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">{fmtMoney(li.unitCost)}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{fmtMoney(li.unitPrice)}</td>
                        <td className="py-1.5 pr-3">
                          <RfqBadge status={li.rfqStatus} />
                        </td>
                        <td className="py-1.5 text-xs text-gray-600">
                          <DeliveryLabel status={li.deliveryStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {opportunity.orders.length > 0 ? (
            <Card title="Orders">
              <ul className="divide-y divide-gray-100">
                {opportunity.orders.map((o) => (
                  <li key={o.id} className="py-2 text-sm">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">{o.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Close this deal">
            {closed ? (
              <p className="text-sm text-gray-500">
                This deal is already closed as{" "}
                <span className="font-medium">{opportunity.stage}</span>.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <form action={markOpportunityWon}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <p className="mb-2 text-sm text-gray-600">
                    Creates an order, carries every non-removed line item across, and stages a{" "}
                    {isProject ? "30% deposit" : "full payment"} of{" "}
                    <span className="font-medium">
                      {fmtMoney(
                        Math.round(isProject ? (opportunity.value ?? 0) * 0.3 : opportunity.value ?? 0)
                      )}
                    </span>
                    .
                  </p>
                  <button
                    type="submit"
                    className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
                  >
                    Mark Won
                  </button>
                </form>

                <form action={markOpportunityLost}>
                  <input type="hidden" name="id" value={opportunity.id} />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      Lost reason (required)
                    </span>
                    <input
                      type="text"
                      name="lostReason"
                      required
                      defaultValue={opportunity.lostReason ?? ""}
                      placeholder="Why did we lose it?"
                      className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
                    />
                  </label>
                  <button
                    type="submit"
                    className="mt-2 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
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
