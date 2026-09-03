import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
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

/**
 * Sort by / Filter by columns for this list (Aug 31 feedback: every list, any field).
 * Name is sort-only: the pinned search box already searches first name, last name
 * and email, so a second name box would be the same control twice.
 */
const CONTACT_FIELDS: ReadonlyArray<ListField> = [
  { key: "name", label: "Name", type: "text", filterable: false },
  { key: "company", label: "Business", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "status", label: "Status", type: "enum", options: CONTACT_STATUSES },
  { key: "created", label: "Created", type: "date", filterable: false },
];

/** sortKey to Prisma orderBy. Anything not listed falls back to the page default. */
const CONTACT_ORDER: Record<
  string,
  (dir: "asc" | "desc") => Prisma.ContactOrderByWithRelationInput[]
> = {
  name: (dir) => [{ firstName: dir }, { lastName: dir }],
  company: (dir) => [{ company: { name: dir } }, { firstName: "asc" }],
  title: (dir) => [{ title: dir }, { firstName: "asc" }],
  status: (dir) => [{ status: dir }, { firstName: "asc" }],
  created: (dir) => [{ createdAt: dir }],
};

const DEFAULT_ORDER: Prisma.ContactOrderByWithRelationInput[] = [{ firstName: "asc" }];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(CONTACT_FIELDS, params);

  const filterWhere: Prisma.ContactWhereInput = {};
  if (filters.company) {
    filterWhere.company = { name: { contains: filters.company, mode: "insensitive" } };
  }
  if (filters.title) filterWhere.title = { contains: filters.title, mode: "insensitive" };
  if (filters.status) filterWhere.status = filters.status;
  const hasListFilter = Object.keys(filterWhere).length > 0;

  const contacts = await prisma.contact.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...filterWhere,
    },
    orderBy: sortKey && CONTACT_ORDER[sortKey] ? CONTACT_ORDER[sortKey](sortDir) : DEFAULT_ORDER,
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
        <div className="card space-y-3 bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={<div className="input-klyne h-9 w-full animate-pulse sm:w-96" />}>
              <InstantSearch
                paramKey="q"
                placeholder="Search name or email…"
                className="input-klyne w-full sm:w-96"
                ariaLabel="Search contacts"
              />
            </Suspense>
            <p className="text-[13px] text-gray">
              {contacts.length} {contacts.length === 1 ? "person" : "people"}
            </p>
          </div>

          {/* useSearchParams needs a boundary even on a force-dynamic page. */}
          <Suspense fallback={<div className="h-8" />}>
            <ListControls fields={CONTACT_FIELDS} />
          </Suspense>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `No contacts match “${search}”.`
          ) : hasListFilter ? (
            "No contacts match this filter."
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
                    href={`/contacts/${c.id}`}
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
