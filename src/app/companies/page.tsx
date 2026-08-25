import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { PageHeader, TypeBadge, VerticalLabel } from "./_ui";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const search = (q ?? "").trim();
  const typeFilter = (type ?? "").trim();

  const companies = await prisma.company.findMany({
    where: {
      ...(search ? { name: { contains: search } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: [{ priorityClient: "desc" }, { name: "asc" }],
    include: { _count: { select: { contacts: true, opportunities: true, orders: true } } },
  });

  const chipHref = (value: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value) params.set("type", value);
    const query = params.toString();
    return query ? `/companies?${query}` : "/companies";
  };

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${companies.length} record(s)`}>
        <Link href="/companies/new" className="btn btn-primary">
          New company
        </Link>
      </PageHeader>

      <div className="mb-4">
        <label className="block">
          <span className="field-label">Search by name</span>
          <InstantSearch paramKey="q" placeholder="Company name…" className="input-klyne w-64" />
        </label>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={chipHref("")}
          className={`chip transition-colors active:scale-[0.98] ${
            typeFilter ? "" : "chip-active"
          }`}
        >
          All types
        </Link>
        {COMPANY_TYPES.map((t) => (
          <Link
            key={t.value}
            href={chipHref(t.value)}
            className={`chip transition-colors active:scale-[0.98] ${
              typeFilter === t.value ? "chip-active" : ""
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {companies.length === 0 ? (
        <div className="empty-state">No companies match this filter.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-klyne">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Vertical</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Activity</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/companies/${c.id}`}
                      className="font-medium text-ink transition-colors hover:text-accent"
                    >
                      {c.name}
                    </Link>
                    {c.locationName ? (
                      <div className="text-xs text-gray">{c.locationName}</div>
                    ) : null}
                  </td>
                  <td>
                    <TypeBadge type={c.type} />
                  </td>
                  <td className="text-gray-dark">
                    <VerticalLabel vertical={c.vertical} />
                  </td>
                  <td className="text-gray-dark">
                    {c.phone ?? "—"}
                    {c.phoneExt ? <span className="text-gray"> x{c.phoneExt}</span> : null}
                  </td>
                  <td className="text-gray-dark">{c.email ?? "—"}</td>
                  <td className="text-xs text-gray">
                    {c._count.contacts} contacts · {c._count.opportunities} opps ·{" "}
                    {c._count.orders} orders
                  </td>
                  <td>
                    {c.priorityClient ? (
                      <span className="badge badge-red">Priority</span>
                    ) : (
                      <span className="text-gray">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
