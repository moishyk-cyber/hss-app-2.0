import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import {
  Avatar,
  CONTACT_STATUSES,
  CONTACT_STATUS_BADGES,
  EmailLink,
  PageHeader,
  PhoneLink,
} from "./_ui";

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

      {/* Search stays pinned - the list under it can run for pages. */}
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 pb-3 pt-1">
        <div className="card bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <InstantSearch
              paramKey="q"
              placeholder="Search name or email…"
              className="input-klyne w-full sm:w-96"
            />
            <p className="text-[13px] text-gray">
              {contacts.length} {contacts.length === 1 ? "person" : "people"}
            </p>
          </div>
        </div>
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
        <div className="card card-flush overflow-hidden">
          <ul className="divide-y divide-border">
            {contacts.map((c) => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
              return (
                <li
                  key={c.id}
                  className="relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover"
                >
                  {/* Circle: this row is led by a person's name. */}
                  <Avatar name={name} kind="person" />

                  {/*
                    Stretched link: the whole row opens the contact, while the company,
                    mail and tel anchors sit above it (relative z-10) so they still work.
                  */}
                  <Link
                    href={`/contacts/${c.id}/edit`}
                    className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {name}
                  </Link>

                  <span className="relative z-10 hidden min-w-0 flex-[3] truncate text-[13px] lg:block">
                    {c.company ? (
                      <Link
                        href={`/companies/${c.company.id}`}
                        className="text-gray-dark transition-colors hover:text-ink"
                      >
                        {c.company.name}
                      </Link>
                    ) : (
                      <span className="empty-value">no business</span>
                    )}
                  </span>

                  <span className="hidden min-w-0 flex-[2] truncate text-[13px] text-gray xl:block">
                    {c.title}
                  </span>

                  <span className="relative z-10 hidden min-w-0 flex-[3] md:block">
                    <EmailLink email={c.email} />
                  </span>

                  <span className="relative z-10 hidden min-w-0 flex-[2] sm:block">
                    <PhoneLink
                      phone={c.phone ?? c.cellPhone}
                      ext={c.phone ? c.phoneExt : null}
                      label={c.phone ? "Phone" : "Cell"}
                    />
                  </span>

                  <span className="relative z-10 hidden min-w-0 flex-[2] 2xl:block">
                    {c.phone && c.cellPhone ? (
                      <PhoneLink phone={c.cellPhone} label="Cell" />
                    ) : null}
                  </span>

                  <span className="shrink-0">
                    <span className={`badge ${CONTACT_STATUS_BADGES[c.status] ?? "badge-gray"}`}>
                      {labelFor(CONTACT_STATUSES, c.status)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
