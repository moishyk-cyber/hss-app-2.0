import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelFor, RFQ_STATUS_COLORS } from "@/lib/constants";
import { ActionButton } from "@/lib/ui";
import { RFQ_QUEUE_STATUSES } from "./queue-statuses";
import { markSupplierItemsRfqSent } from "./actions";
import RfqRow from "./RfqRow";

export const dynamic = "force-dynamic";

const NEEDS_PRICING_EMPTY =
  "Nothing needs pricing. Items land here from Intake when they need a price.";

type RfqLineItem = Prisma.LineItemGetPayload<{
  include: {
    opportunity: { select: { id: true; title: true } };
    order: { select: { id: true; title: true } };
    supplier: { select: { id: true; name: true } };
    assignee: { select: { name: true } };
  };
}>;

export default async function RfqPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view = rawView === "supplier" ? "supplier" : "status";
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

  function renderTable(rows: RfqLineItem[]) {
    return (
      <div className="card overflow-hidden overflow-x-auto">
        <table className="table-klyne min-w-[900px]">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Parent</th>
              <th>Supplier</th>
              <th>Cost / Price</th>
              <th>Lead (days)</th>
              <th>Assignee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const parentHref = item.order
                ? `/orders/${item.order.id}`
                : item.opportunity
                ? `/pipeline/${item.opportunity.id}`
                : null;
              const parentLabel = item.order?.title ?? item.opportunity?.title ?? "—";
              return (
                <RfqRow key={item.id} item={item} suppliers={suppliers} parentHref={parentHref} parentLabel={parentLabel} />
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">RFQ Queue</h1>
        <p className="page-sub">Estimating queue — items awaiting pricing before they can move to a proposal.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {RFQ_QUEUE_STATUSES.map((s) => (
            <div key={s.value} className="chip cursor-default">
              {s.label}: <span className="font-semibold text-ink">{counts[s.value] ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href="/rfq" className={view === "status" ? "chip chip-active" : "chip"}>
            By status
          </Link>
          <Link href="/rfq?view=supplier" className={view === "supplier" ? "chip chip-active" : "chip"}>
            By supplier
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          {NEEDS_PRICING_EMPTY}{" "}
          <Link href="/intake" className="text-blue transition-colors hover:underline">
            Go to Intake →
          </Link>
        </div>
      ) : view === "supplier" ? (
        <SupplierView items={items} suppliers={suppliers} renderTable={renderTable} />
      ) : (
        <StatusView items={items} statusValues={statusValues} renderTable={renderTable} />
      )}
    </div>
  );
}

function StatusView({
  items,
  statusValues,
  renderTable,
}: {
  items: RfqLineItem[];
  statusValues: string[];
  renderTable: (rows: RfqLineItem[]) => React.ReactNode;
}) {
  const grouped = statusValues.map((status) => ({
    status,
    label: labelFor(RFQ_QUEUE_STATUSES, status),
    items: items.filter((i) => i.rfqStatus === status),
  }));

  return (
    <>
      {grouped.map((group) => (
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
            renderTable(group.items)
          )}
        </section>
      ))}
    </>
  );
}

function SupplierView({
  items,
  suppliers,
  renderTable,
}: {
  items: RfqLineItem[];
  suppliers: { id: string; name: string }[];
  renderTable: (rows: RfqLineItem[]) => React.ReactNode;
}) {
  const bySupplier = new Map<string, RfqLineItem[]>();
  for (const item of items) {
    const key = item.supplierId ?? "__unassigned";
    const list = bySupplier.get(key) ?? [];
    list.push(item);
    bySupplier.set(key, list);
  }

  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
  const unassigned = bySupplier.get("__unassigned") ?? [];
  const supplierKeys = Array.from(bySupplier.keys())
    .filter((k) => k !== "__unassigned")
    .sort((a, b) => (supplierNameById.get(a) ?? "").localeCompare(supplierNameById.get(b) ?? ""));

  const groups = [
    { key: "__unassigned", name: "Unassigned", items: unassigned, canBulkSend: false },
    ...supplierKeys.map((key) => ({
      key,
      name: supplierNameById.get(key) ?? "Supplier",
      items: bySupplier.get(key) ?? [],
      canBulkSend: true,
    })),
  ].filter((g) => g.items.length > 0);

  return (
    <>
      {groups.map((group) => {
        const needsPricingCount = group.items.filter((i) => i.rfqStatus === "needs_pricing").length;
        return (
          <section key={group.key}>
            <h2 className="section-label mb-2 flex items-center gap-2">
              {group.name}
              <span className="badge badge-gray">{group.items.length}</span>
              {group.canBulkSend && needsPricingCount > 0 && (
                <ActionButton
                  action={markSupplierItemsRfqSent.bind(null, group.key)}
                  className="btn btn-sm normal-case active:scale-[0.99]"
                >
                  Mark all RFQ Sent ({needsPricingCount})
                </ActionButton>
              )}
            </h2>
            {renderTable(group.items)}
          </section>
        );
      })}
    </>
  );
}
