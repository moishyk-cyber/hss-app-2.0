import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { Suspense } from "react";
import Link from "@/lib/IntentLink";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
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

const DEFAULT_ORDER: Prisma.ContactOrderByWithRelationInput[] = [
  { firstName: "asc" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const limit = collectionLimit(params);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(CONTACT_FIELDS, params);

  const filterWhere: Prisma.ContactWhereInput = {};
  if (filters.company) {
    filterWhere.company = {
      name: { contains: filters.company, mode: "insensitive" },
    };
  }
  if (filters.title)
    filterWhere.title = { contains: filters.title, mode: "insensitive" };
  if (filters.status) filterWhere.status = filters.status;
  const hasListFilter =
    Object.keys(filterWhere).length > 0 || !!params.filter_tree;

  const nestedWhere = compileFilterTree<Prisma.ContactWhereInput>(
    CONTACT_FIELDS,
    params.filter_tree,
    { company: "company.name", title: "title", status: "status" },
  );

  const contacts = await prisma.contact.findMany({
    take: limit + 1,
    where: {
      AND: nestedWhere ? [nestedWhere] : undefined,
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
    orderBy:
      sortKey && CONTACT_ORDER[sortKey]
        ? CONTACT_ORDER[sortKey](sortDir)
        : DEFAULT_ORDER,
    include: { company: { select: { id: true, name: true } } },
  });

  const hasMore = contacts.length > limit;
  if (hasMore) contacts.pop();

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="People and their business contact details."
        toolbar={
          <Suspense fallback={<div className="h-8" />}>
            <ListControls
              hasMore={hasMore}
              searchParam="q"
              fields={CONTACT_FIELDS}
              count={contacts.length}
            />
          </Suspense>
        }
      >
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      {contacts.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `No contacts match “${search}”.`
          ) : hasListFilter ? (
            "No contacts match this filter."
          ) : (
            <>
              No people yet. Add them from the{" "}
              <Link
                href="/phonebook"
                className="text-primary transition-colors hover:underline"
              >
                Phone Book
              </Link>{" "}
              - every contact belongs to a business.
            </>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table-klyne min-w-[950px]">
            <thead>
              <tr>
                <SortHeader field="name">Person</SortHeader>
                <SortHeader field="company">Business</SortHeader>
                <SortHeader field="title">Title</SortHeader>
                <SortHeader>Email</SortHeader>
                <SortHeader>Phone</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="created">Created</SortHeader>
              </tr>
            </thead>
            <TableRows columns={7}>
              {contacts.map((c) => {
                const name = [c.firstName, c.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={name} kind="person" />
                        <Link
                          href={`/contacts/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {name}
                        </Link>
                      </div>
                    </td>
                    <td>
                      {c.company ? (
                        <Link
                          href={`/companies/${c.company.id}`}
                          className="hover:underline"
                        >
                          {c.company.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{c.title ?? "—"}</td>
                    <td>
                      <EmailLink email={c.email} />
                    </td>
                    <td>
                      <PhoneLink
                        phone={c.phone ?? c.cellPhone}
                        ext={c.phone ? c.phoneExt : null}
                      />
                    </td>
                    <td>
                      <span
                        className={`badge ${CONTACT_STATUS_BADGES[c.status] ?? "badge-gray"}`}
                      >
                        {labelFor(CONTACT_STATUSES, c.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.createdAt.toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}
                    </td>
                  </tr>
                );
              })}
            </TableRows>
          </table>
        </div>
      )}
      <MoreRecords href="/contacts" limit={limit} hasMore={hasMore} />
    </div>
  );
}
