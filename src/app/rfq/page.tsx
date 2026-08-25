import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelFor, RFQ_STATUS_COLORS } from "@/lib/constants";
import { RFQ_QUEUE_STATUSES } from "./queue-statuses";
import RfqRow from "./RfqRow";

export const dynamic = "force-dynamic";

const NEEDS_PRICING_EMPTY =
  "Nothing needs pricing. Items land here from Intake when they need a price.";

type RfqLineItem = Prisma.LineItemGetPayload<{
  include: {
    opportunity: { select: { id: true; title: true } };
    order: { select: { id: true; title: true } };
    assignee: { select: { name: true } };
  };
}>;

export default async function RfqPage() {
  const statusValues = RFQ_QUEUE_STATUSES.map((s) => s.value);

  const items: RfqLineItem[] = await prisma.lineItem.findMany({
    where: { rfqStatus: { in: statusValues as string[] } },
    include: {
      opportunity: { select: { id: true, title: true } },
      order: { select: { id: true, title: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const counts: Record<string, number> = {};
  for (const s of statusValues) counts[s] = 0;
  for (const item of items) counts[item.rfqStatus] = (counts[item.rfqStatus] ?? 0) + 1;

  const grouped = statusValues.map((status) => ({
    status,
    label: labelFor(RFQ_QUEUE_STATUSES, status),
    items: items.filter((i) => i.rfqStatus === status),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">RFQ Queue</h1>
        <p className="page-sub">Estimating queue — items awaiting pricing before they can move to a proposal.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RFQ_QUEUE_STATUSES.map((s) => (
          <div key={s.value} className="chip cursor-default">
            {s.label}: <span className="font-semibold text-ink">{counts[s.value] ?? 0}</span>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          {NEEDS_PRICING_EMPTY}{" "}
          <Link href="/intake" className="text-blue transition-colors hover:underline">
            Go to Intake →
          </Link>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.status}>
            <h2 className="section-label mb-2 flex items-center gap-2">
              {group.label}
              <span className={`badge ${RFQ_STATUS_COLORS[group.status] ?? "badge-gray"}`}>{group.items.length}</span>
            </h2>
            {group.items.length === 0 ? (
              <div className="empty-state">
                {group.status === "needs_pricing" ? (
                  <>
                    {NEEDS_PRICING_EMPTY}{" "}
                    <Link href="/intake" className="text-blue transition-colors hover:underline">
                      Go to Intake →
                    </Link>
                  </>
                ) : (
                  "No items in this stage."
                )}
              </div>
            ) : (
              <div className="card overflow-hidden overflow-x-auto">
                <table className="table-klyne min-w-[820px]">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Parent</th>
                      <th>Cost / Price</th>
                      <th>Lead (days)</th>
                      <th>Assignee</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const parentHref = item.order
                        ? `/orders/${item.order.id}`
                        : item.opportunity
                        ? `/pipeline/${item.opportunity.id}`
                        : null;
                      const parentLabel = item.order?.title ?? item.opportunity?.title ?? "—";
                      return (
                        <RfqRow key={item.id} item={item} parentHref={parentHref} parentLabel={parentLabel} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
