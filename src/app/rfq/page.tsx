import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { RFQ_QUEUE_STATUSES } from "./actions";
import RfqRow from "./RfqRow";

export const dynamic = "force-dynamic";

export default async function RfqPage() {
  const statusValues = RFQ_QUEUE_STATUSES.map((s) => s.value);

  const [items, suppliers] = await Promise.all([
    prisma.lineItem.findMany({
      where: { rfqStatus: { in: statusValues as string[] } },
      include: {
        opportunity: { select: { id: true, title: true } },
        order: { select: { id: true, title: true } },
        supplier: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.company.findMany({
      where: { type: { in: ["supplier", "vendor"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
        <h1 className="text-2xl font-bold text-gray-900">RFQ Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Estimating queue — items awaiting pricing before they can move to a proposal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RFQ_QUEUE_STATUSES.map((s) => (
          <div
            key={s.value}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
          >
            {s.label}: <span className="font-bold text-gray-900">{counts[s.value] ?? 0}</span>
          </div>
        ))}
      </div>

      {grouped.map((group) => (
        <section key={group.status}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {group.label}{" "}
            <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
              {group.items.length}
            </span>
          </h2>
          {group.items.length === 0 ? (
            <div className="rounded border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
              No items in this stage.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pl-3 pr-3 font-medium">Item</th>
                    {/* first column padded to align with row cells */}
                    <th className="py-2 pr-3 font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Parent</th>
                    <th className="py-2 pr-3 font-medium">Supplier</th>
                    <th className="py-2 pr-3 font-medium">Cost / Price</th>
                    <th className="py-2 pr-3 font-medium">Lead (days)</th>
                    <th className="py-2 pr-3 font-medium">Assignee</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
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
                      <RfqRow
                        key={item.id}
                        item={item}
                        suppliers={suppliers}
                        parentHref={parentHref}
                        parentLabel={parentLabel}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
