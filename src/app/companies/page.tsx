import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
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

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${companies.length} record(s)`}>
        <Link
          href="/companies/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          New company
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Search by name</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Company name…"
            className="w-64 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Type</span>
          <select
            name="type"
            defaultValue={typeFilter}
            className="w-48 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
          >
            <option value="">All types</option>
            {COMPANY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Apply
        </button>
        {search || typeFilter ? (
          <Link
            href="/companies"
            className="px-2 py-1.5 text-sm text-gray-500 underline hover:text-gray-800"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Vertical</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Activity</th>
              <th className="px-4 py-2 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/companies/${c.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.locationName ? (
                    <div className="text-xs text-gray-500">{c.locationName}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <TypeBadge type={c.type} />
                </td>
                <td className="px-4 py-2 text-gray-600">
                  <VerticalLabel vertical={c.vertical} />
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {c.phone ?? "—"}
                  {c.phoneExt ? <span className="text-gray-400"> x{c.phoneExt}</span> : null}
                </td>
                <td className="px-4 py-2 text-gray-600">{c.email ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {c._count.contacts} contacts · {c._count.opportunities} opps ·{" "}
                  {c._count.orders} orders
                </td>
                <td className="px-4 py-2">
                  {c.priorityClient ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      Priority
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {companies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No companies match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
