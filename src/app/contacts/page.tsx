import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { CONTACT_STATUSES, CONTACT_STATUS_BADGES, PageHeader } from "./_ui";

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
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} ${contacts.length === 1 ? "person" : "people"}`}
      >
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      <div className="mb-5">
        <label className="block">
          <span className="field-label">Search</span>
          <InstantSearch paramKey="q" placeholder="Name or email…" className="input-klyne w-72" />
        </label>
      </div>

      {contacts.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `No contacts match “${search}”.`
          ) : (
            <>
              No people yet. Add them from the{" "}
              <Link href="/phonebook" className="text-primary transition-colors hover:underline">
                Phone Book
              </Link>{" "}
              - every contact belongs to a business.
            </>
          )}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden overflow-x-auto">
          <table className="table-klyne min-w-[960px]">
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
                      className="font-medium text-ink hover:underline"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td>
                    {c.company ? (
                      <Link
                        href={`/companies/${c.company.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.company.name}
                      </Link>
                    ) : (
                      <span className="empty-value">no business</span>
                    )}
                  </td>
                  <td className="text-gray-dark">{c.title}</td>
                  <td className="text-gray-dark tabular-nums">
                    {c.phone}
                    {c.phoneExt ? <span className="text-gray"> ext {c.phoneExt}</span> : null}
                  </td>
                  <td className="text-gray-dark tabular-nums">{c.cellPhone}</td>
                  <td className="text-gray-dark">{c.email}</td>
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
