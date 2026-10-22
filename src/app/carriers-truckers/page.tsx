import { PencilIcon } from "@/lib/ui";
import { Suspense } from "react";
import Link from "@/lib/IntentLink";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { Avatar } from "@/lib/Avatar";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { matchFilterTree } from "@/lib/nestedFilters";
import { getDeliveryPartners } from "@/lib/deliveryPartnerData";
import { can } from "@/lib/permissionsServer";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
export const dynamic = "force-dynamic";
const fields: ListField[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "kind", label: "Type", type: "enum", options: [{ value: "carriers", label: "Carrier" }, { value: "truckers", label: "Trucker" }] },
];
export default async function DeliveryPartnersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, partners, editable] = await Promise.all([searchParams, getDeliveryPartners(), can("deliveries.edit")]);
  const { sortKey, sortDir, filters } = parseListQuery(fields, params);
  const limit=collectionLimit(params);
  const search = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const rows = [
    ...partners.carriers.map(name => ({ name, kind: "carriers" })),
    ...partners.truckers.map(name => ({ name, kind: "truckers" })),
  ].filter(row => (!search || row.name.toLowerCase().includes(search)) && (!filters.name || row.name.toLowerCase().includes(filters.name.toLowerCase())) && (!filters.kind || row.kind === filters.kind) &&
    matchFilterTree(fields, params.filter_tree, { name: row.name, kind: row.kind }))
    .sort((a, b) => ((sortKey === "kind" ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name)) || a.name.localeCompare(b.name)) * (sortDir === "desc" ? -1 : 1));
  return <div>
    <PageHeader title="Carriers & Truckers" subtitle="Shared carriers and truckers for orders and deliveries."
      toolbar={<Suspense><ListControls searchParam="q" fields={fields} count={rows.length} /></Suspense>}>
      {editable && <Link href="/carriers-truckers/new" className="btn btn-primary">New carrier or trucker</Link>}
    </PageHeader>
    {!rows.length ? <div className="empty-state">{search || Object.keys(filters).length ? "No carriers or truckers match your search or filters." : "No carriers or truckers yet. Add the first one above."}</div> :
      <div className="table-scroll"><table className="table-klyne">
        <thead><tr><SortHeader field="name">Name</SortHeader><SortHeader field="kind">Type</SortHeader></tr></thead>
        <TableRows columns={2}>{rows.slice(0,limit).map(row => <tr key={`${row.kind}:${row.name}`}>
          <td><div className="flex items-center gap-2"><Avatar name={row.name} kind="business" /><Link href={`/carriers-truckers/edit?${new URLSearchParams({ kind: row.kind, name: row.name })}`} className="inline-flex items-center gap-1.5 font-medium hover:underline" aria-label={`Edit ${row.name}`} title={`Edit ${row.name}`}>{row.name}<PencilIcon /></Link></div></td>
          <td><span className="badge badge-gray">{row.kind === "carriers" ? "Carrier" : "Trucker"}</span></td>
        </tr>)}</TableRows>
      </table></div>}
    <MoreRecords href="/carriers-truckers" limit={limit} hasMore={rows.length>limit}/>
  </div>;
}
