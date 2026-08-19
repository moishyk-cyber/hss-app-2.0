import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { CONTACT_TITLES, PageHeader } from "./_ui";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = (q ?? "").trim();

  const contacts = await prisma.contact.findMany({
    where: search
      ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : undefined,
    orderBy: [{ firstName: "asc" }],
    include: { company: { select: { id: true, name: true } } },
  });

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${contacts.length} record(s)`}>
        <Link
          href="/contacts/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          New contact
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name or email…"
            className="w-72 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
          />
        </label>
        <button
          type="submit"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Search
        </button>
        {search ? (
          <Link
            href="/contacts"
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
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Cell</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">
                  <Link href={`/contacts/${c.id}/edit`} className="hover:underline">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {c.company ? (
                    <Link
                      href={`/companies/${c.company.id}`}
                      className="text-gray-700 hover:underline"
                    >
                      {c.company.name}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{labelFor(CONTACT_TITLES, c.title)}</td>
                <td className="px-4 py-2 text-gray-600">
                  {c.phone ?? "—"}
                  {c.phoneExt ? <span className="text-gray-400"> x{c.phoneExt}</span> : null}
                </td>
                <td className="px-4 py-2 text-gray-600">{c.cellPhone ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">{c.email ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/contacts/${c.id}/edit`}
                    className="text-xs text-gray-500 underline hover:text-gray-900"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No contacts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
