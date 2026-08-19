import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { CONTACT_STATUSES, CONTACT_STATUS_BADGES, CONTACT_TITLES, PageHeader } from "./_ui";

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
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      <form method="get" className="mb-5 flex items-end gap-2">
        <label className="block">
          <span className="field-label">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name or email…"
            className="input-klyne w-72"
          />
        </label>
        <button type="submit" className="btn">
          Search
        </button>
        {search ? (
          <Link href="/contacts" className="btn">
            Clear
          </Link>
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <div className="empty-state">No contacts found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-klyne">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Title</th>
                <th>Phone</th>
                <th>Cell</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/contacts/${c.id}/edit`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td>
                    {c.company ? (
                      <Link
                        href={`/companies/${c.company.id}`}
                        className="text-accent hover:underline"
                      >
                        {c.company.name}
                      </Link>
                    ) : (
                      <span className="text-gray">—</span>
                    )}
                  </td>
                  <td className="text-gray-dark">{labelFor(CONTACT_TITLES, c.title)}</td>
                  <td className="text-gray-dark">
                    {c.phone ?? "—"}
                    {c.phoneExt ? <span className="text-gray"> x{c.phoneExt}</span> : null}
                  </td>
                  <td className="text-gray-dark">{c.cellPhone ?? "—"}</td>
                  <td className="text-gray-dark">{c.email ?? "—"}</td>
                  <td>
                    <span className={`badge ${CONTACT_STATUS_BADGES[c.status] ?? "badge-gray"}`}>
                      {labelFor(CONTACT_STATUSES, c.status)}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/contacts/${c.id}/edit`} className="btn btn-sm">
                      Edit
                    </Link>
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
