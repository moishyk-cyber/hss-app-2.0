import { matchFilterTree } from "@/lib/nestedFilters";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { Suspense } from "react";
import Link from "@/lib/IntentLink";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { AssignCompanySelect } from "./AssignCompanySelect";
import { Avatar, EmailLink, PageHeader, PhoneLink, TypeBadge } from "./_ui";

export const dynamic = "force-dynamic";

const ROW_KINDS = [
  { value: "business", label: "Business" },
  { value: "person", label: "Person" },
] as const;

/**
 * Sort by / Filter by columns for this list (Aug 31 feedback: every list, any
 * field). Businesses and people are merged in JS here, so these are applied to
 * the merged rows rather than to either Prisma query.
 *
 * Search owns name matching; Type shares the common additive filter menu.
 */
const PHONEBOOK_FIELDS: ReadonlyArray<ListField> = [
  {
    key: "kind",
    label: "Business or person",
    type: "enum",
    options: ROW_KINDS,
  },
  { key: "name", label: "Name", type: "text" },
  { key: "type", label: "Type", type: "enum", options: COMPANY_TYPES },
];

/**
 * One line in the directory. Businesses and people share the same shape so they can
 * be sorted into a single alphabetical list (Aug 31 feedback: the card grid buried
 * people inside their business - a phone book should be one dense scannable list).
 */
type DirectoryRow = {
  key: string;
  kind: "business" | "person";
  /** Alphabetised on this - the same string that's displayed. */
  name: string;
  /** Second column: the person's business, or the site the business sits at. */
  subtitle: string | null;
  email: string | null;
  phone: string | null;
  phoneExt: string | null;
  /** Company type, for the chip - a person inherits their business's. */
  type: string;
  href: string;
  priority: boolean;
};

function DirectoryRowItem({ row }: { row: DirectoryRow }) {
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <Avatar name={row.name} kind={row.kind} />
          <Link href={row.href} className="font-medium hover:underline">
            {row.priority ? "★ " : ""}
            {row.name}
          </Link>
        </div>
      </td>
      <td>{row.subtitle ?? "—"}</td>
      <td>
        <EmailLink email={row.email} />
      </td>
      <td>
        <PhoneLink phone={row.phone} ext={row.phoneExt} />
      </td>
      <td className="capitalize">{row.kind}</td>
      <td>
        <TypeBadge type={row.type} />
      </td>
    </tr>
  );
}

export default async function PhoneBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(
    PHONEBOOK_FIELDS,
    params,
  );
  const legacyType = typeof params.type === "string" ? params.type : "";
  const typeFilter =
    filters.type ??
    (COMPANY_TYPES.some((t) => t.value === legacyType) ? legacyType : "");
  // Stored numbers are digits-only, so a search of "(718) 871" should still hit.
  const digits = search.replace(/\D/g, "");

  // Sep 2 QA (twice): search "definitively dead". Two causes fixed here:
  // every `contains` is now case-insensitive (Postgres is case-sensitive by
  // default, so "berel" matched nothing), and a search no longer dumps EVERY
  // person of a matched business into the results - only people who match
  // render as people rows, so unrelated names disappear from the list.
  const insensitive = { mode: "insensitive" as const };

  const contactMatch: Prisma.ContactWhereInput | undefined = search
    ? {
        OR: [
          { firstName: { contains: search, ...insensitive } },
          { lastName: { contains: search, ...insensitive } },
          { email: { contains: search, ...insensitive } },
          { phone: { contains: search } },
          { cellPhone: { contains: search } },
          ...(digits.length >= 3
            ? [
                { phone: { contains: digits } },
                { cellPhone: { contains: digits } },
              ]
            : []),
        ],
      }
    : undefined;

  const companyWhere: Prisma.CompanyWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(search && contactMatch
      ? {
          OR: [
            { name: { contains: search, ...insensitive } },
            { email: { contains: search, ...insensitive } },
            { phone: { contains: search } },
            { cellPhone: { contains: search } },
            { locationName: { contains: search, ...insensitive } },
            { deliveryAddress: { contains: search, ...insensitive } },
            { billingAddress: { contains: search, ...insensitive } },
            ...(digits.length >= 3
              ? [
                  { phone: { contains: digits } },
                  { cellPhone: { contains: digits } },
                ]
              : []),
            // A person matching pulls their business's ROW in (for context) -
            // not the rest of its people.
            { contacts: { some: contactMatch } },
          ],
        }
      : {}),
  };

  const [companies, matchedContacts, unassigned, allCompanies] =
    await Promise.all([
      prisma.company.findMany({
        where: companyWhere,
        orderBy: { name: "asc" },
        include: {
          contacts: { orderBy: [{ firstName: "asc" }, { lastName: "asc" }] },
        },
      }),
      // While searching, people rows come from THIS query - matching people only.
      search && contactMatch
        ? prisma.contact.findMany({
            where: {
              ...contactMatch,
              companyId: { not: null },
              ...(typeFilter ? { company: { type: typeFilter } } : {}),
            },
            include: {
              company: { select: { id: true, name: true, type: true } },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          })
        : Promise.resolve([]),
      // Orphans only make sense when we aren't filtering by a business type.
      typeFilter
        ? Promise.resolve([])
        : prisma.contact.findMany({
            where: { companyId: null, ...(contactMatch ?? {}) },
            orderBy: [{ firstName: "asc" }],
          }),
      prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  // Businesses and their people flattened into one list, then alphabetised together.
  const rows: DirectoryRow[] = [];
  for (const company of companies) {
    rows.push({
      key: `company-${company.id}`,
      kind: "business",
      name: company.name,
      subtitle:
        company.locationName ??
        company.deliveryAddress ??
        company.billingAddress,
      email: company.email,
      phone: company.phone,
      phoneExt: company.phoneExt,
      type: company.type,
      href: `/companies/${company.id}`,
      priority: company.priorityClient,
    });
    if (!search) {
      for (const contact of company.contacts) {
        rows.push({
          key: `contact-${contact.id}`,
          kind: "person",
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
          subtitle: company.name,
          email: contact.email,
          phone: contact.phone ?? contact.cellPhone,
          phoneExt: contact.phone ? contact.phoneExt : null,
          type: company.type,
          href: `/contacts/${contact.id}`,
          priority: false,
        });
      }
    }
  }
  for (const contact of matchedContacts) {
    rows.push({
      key: `contact-${contact.id}`,
      kind: "person",
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
      subtitle: contact.company?.name ?? null,
      email: contact.email,
      phone: contact.phone ?? contact.cellPhone,
      phoneExt: contact.phone ? contact.phoneExt : null,
      type: contact.company?.type ?? "customer",
      href: `/contacts/${contact.id}`,
      priority: false,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  // Independent nested conditions apply to both business and person rows.
  const kindFilter = filters.kind ?? "";
  const visibleRows = (
    kindFilter ? rows.filter((r) => r.kind === kindFilter) : rows
  ).filter((row) =>
    matchFilterTree(PHONEBOOK_FIELDS, params.filter_tree, {
      kind: row.kind,
      name: row.name,
      type: row.type,
    }),
  );

  // Sort by, likewise on the merged rows. Rows arrive name-ascending already.
  const dir = sortDir === "desc" ? -1 : 1;
  const sortedRows =
    sortKey === "name"
      ? [...visibleRows].sort((a, b) => dir * a.name.localeCompare(b.name))
      : sortKey === "kind"
        ? [...visibleRows].sort(
            (a, b) =>
              dir * a.kind.localeCompare(b.kind) ||
              a.name.localeCompare(b.name),
          )
        : sortKey === "type"
          ? [...visibleRows].sort(
              (a, b) =>
                dir * a.type.localeCompare(b.type) ||
                a.name.localeCompare(b.name),
            )
          : visibleRows;

  // Orphan people are people too - a "businesses only" filter hides that section.
  const shownUnassigned =
    kindFilter === "business"
      ? []
      : unassigned.filter((contact) =>
          matchFilterTree(PHONEBOOK_FIELDS, params.filter_tree, {
            kind: "person",
            name: [contact.firstName, contact.lastName]
              .filter(Boolean)
              .join(" "),
            type: "customer",
          }),
        );
  return (
    <div>
      <PageHeader
        title="Phone Book"
        subtitle="Every business and every person - one directory."
        toolbar={
          <Suspense fallback={<div className="h-8" />}>
            <ListControls
              searchParam="q"
              fields={PHONEBOOK_FIELDS}
              count={sortedRows.length}
            />
          </Suspense>
        }
      >
        <Link href="/companies/new" className="btn">
          New business
        </Link>
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      {sortedRows.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `Nothing in the phone book matches “${search}”.`
          ) : kindFilter || typeFilter ? (
            "Nothing in the phone book matches this filter."
          ) : (
            <>
              No businesses yet.{" "}
              <Link
                href="/companies/new"
                className="text-primary transition-colors hover:underline"
              >
                Add the first one
              </Link>{" "}
              - every contact, deal and order hangs off a business.
            </>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table-klyne min-w-[950px]">
            <thead>
              <tr>
                <SortHeader field="name">Name</SortHeader>
                <SortHeader>Business / location</SortHeader>
                <SortHeader>Email</SortHeader>
                <SortHeader>Phone</SortHeader>
                <SortHeader field="kind">Kind</SortHeader>
                <SortHeader field="type">Type</SortHeader>
              </tr>
            </thead>
            <TableRows columns={6}>
              {sortedRows.map((row) => (
                <DirectoryRowItem key={row.key} row={row} />
              ))}
            </TableRows>
          </table>
        </div>
      )}

      {shownUnassigned.length > 0 ? (
        <section className="mt-10">
          <h2 className="section-label">Unassigned people</h2>
          <div className="banner-warn mb-4">
            Every contact should belong to a business. Pick one for each person
            below to file them correctly.
          </div>
          <div className="card card-flush overflow-hidden">
            <ul className="divide-y divide-border">
              {shownUnassigned.map((contact) => {
                const name = [contact.firstName, contact.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li
                    key={contact.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors hover:bg-hover"
                  >
                    <Avatar name={name} kind="person" />
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="min-w-0 flex-[2] truncate text-[13.5px] font-semibold text-ink hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="min-w-0 flex-[2]">
                      <EmailLink email={contact.email} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <PhoneLink
                        phone={contact.phone ?? contact.cellPhone}
                        ext={contact.phoneExt}
                      />
                    </span>
                    <AssignCompanySelect
                      contactId={contact.id}
                      companies={allCompanies}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
