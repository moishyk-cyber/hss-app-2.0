import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { InstantSearch } from "@/lib/ui";
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
 * Name is sort-only (the pinned search box already covers name text) and Type is
 * sort-only (the type chips own the `type` param - a second control for the same
 * column would write a different param and fight the chips).
 */
const PHONEBOOK_FIELDS: ReadonlyArray<ListField> = [
  { key: "kind", label: "Business or person", type: "enum", options: ROW_KINDS },
  { key: "name", label: "Name", type: "text", filterable: false },
  { key: "type", label: "Type", type: "enum", options: COMPANY_TYPES, filterable: false },
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

/** A-Z buckets; everything that doesn't start with a letter falls into "#". */
function groupLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

function DirectoryRowItem({ row }: { row: DirectoryRow }) {
  return (
    <li className="relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover">
      <Avatar name={row.name} kind={row.kind} />

      {/*
        Stretched link: the whole row is clickable, but the email/phone anchors sit
        above it (relative z-10) so they still dial and compose. Nesting real <a>
        tags inside one another would be invalid HTML.
      */}
      <Link
        href={row.href}
        className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
      >
        {row.priority ? (
          <span className="mr-1 text-ink" title="Priority client" aria-label="Priority client">
            ★
          </span>
        ) : null}
        {row.name}
      </Link>

      <span className="hidden min-w-0 flex-[3] truncate text-[13px] text-gray-dark lg:block">
        {row.subtitle}
      </span>

      <span className="relative z-10 hidden min-w-0 flex-[3] md:block">
        <EmailLink email={row.email} />
      </span>

      <span className="relative z-10 hidden min-w-0 flex-[2] sm:block">
        <PhoneLink phone={row.phone} ext={row.phoneExt} />
      </span>

      <span className="shrink-0">
        <TypeBadge type={row.type} />
      </span>
    </li>
  );
}

export default async function PhoneBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const typeFilter = typeof params.type === "string" ? params.type.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(PHONEBOOK_FIELDS, params);
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
            ? [{ phone: { contains: digits } }, { cellPhone: { contains: digits } }]
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
              ? [{ phone: { contains: digits } }, { cellPhone: { contains: digits } }]
              : []),
            // A person matching pulls their business's ROW in (for context) -
            // not the rest of its people.
            { contacts: { some: contactMatch } },
          ],
        }
      : {}),
  };

  const [companies, matchedContacts, unassigned, allCompanies] = await Promise.all([
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
          include: { company: { select: { id: true, name: true, type: true } } },
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
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Businesses and their people flattened into one list, then alphabetised together.
  const rows: DirectoryRow[] = [];
  for (const company of companies) {
    rows.push({
      key: `company-${company.id}`,
      kind: "business",
      name: company.name,
      subtitle: company.locationName ?? company.deliveryAddress ?? company.billingAddress,
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

  // Filter by, applied to the merged rows. Only `kind` is filterable here: name is
  // covered by the search box and type by the chips.
  const kindFilter = filters.kind ?? "";
  const visibleRows = kindFilter ? rows.filter((r) => r.kind === kindFilter) : rows;

  // Sort by, likewise on the merged rows. Rows arrive name-ascending already.
  const dir = sortDir === "desc" ? -1 : 1;
  const sortedRows =
    sortKey === "name"
      ? [...visibleRows].sort((a, b) => dir * a.name.localeCompare(b.name))
      : sortKey === "kind"
        ? [...visibleRows].sort(
            (a, b) => dir * a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
          )
        : sortKey === "type"
          ? [...visibleRows].sort(
              (a, b) => dir * a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
            )
          : visibleRows;

  // A-Z headers only make sense while the list is in its default A-Z order.
  const grouped = !sortKey || (sortKey === "name" && sortDir === "asc");

  const groups: { letter: string; rows: DirectoryRow[] }[] = [];
  if (grouped) {
    for (const row of sortedRows) {
      const letter = groupLetter(row.name);
      const last = groups[groups.length - 1];
      if (last && last.letter === letter) last.rows.push(row);
      else groups.push({ letter, rows: [row] });
    }
  }

  // Orphan people are people too - a "businesses only" filter hides that section.
  const shownUnassigned = kindFilter === "business" ? [] : unassigned;
  const businessCount = visibleRows.filter((r) => r.kind === "business").length;
  const peopleCount = visibleRows.length - businessCount + shownUnassigned.length;

  // Chips rewrite only `type` - search, sort and f_* params ride along untouched.
  const chipHref = (value: string) => {
    const next = new URLSearchParams();
    for (const [key, raw] of Object.entries(params)) {
      if (key === "type") continue;
      if (typeof raw === "string" && raw !== "") next.set(key, raw);
    }
    if (value) next.set("type", value);
    const query = next.toString();
    return query ? `/phonebook?${query}` : "/phonebook";
  };

  return (
    <div>
      <PageHeader title="Phone Book" subtitle="Every business and every person - one directory.">
        <Link href="/companies/new" className="btn">
          New business
        </Link>
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      {/* Search and filters stay pinned - the list under them can run for pages. */}
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 pb-3 pt-1">
        <div className="card space-y-3 bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* useSearchParams needs a boundary even on a force-dynamic page. */}
            <Suspense fallback={<div className="input-klyne h-9 w-full animate-pulse sm:w-96" />}>
              <InstantSearch
                paramKey="q"
                placeholder="Search business, person, phone or email…"
                className="input-klyne w-full sm:w-96"
                ariaLabel="Search the phone book"
              />
            </Suspense>
            <p className="text-[13px] text-gray" role="status">
              {businessCount} business{businessCount === 1 ? "" : "es"} · {peopleCount}{" "}
              {peopleCount === 1 ? "person" : "people"}
              {search ? <> matching &ldquo;{search}&rdquo;</> : null}
            </p>
          </div>

          <Suspense fallback={<div className="h-8" />}>
            <ListControls fields={PHONEBOOK_FIELDS} />
          </Suspense>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={chipHref("")}
              className={`chip transition-colors active:scale-[0.98] ${
                typeFilter ? "" : "chip-active"
              }`}
            >
              All
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
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `Nothing in the phone book matches “${search}”.`
          ) : kindFilter || typeFilter ? (
            "Nothing in the phone book matches this filter."
          ) : (
            <>
              No businesses yet.{" "}
              <Link href="/companies/new" className="text-primary transition-colors hover:underline">
                Add the first one
              </Link>{" "}
              - every contact, deal and order hangs off a business.
            </>
          )}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          {grouped ? (
            groups.map((group) => (
              <section key={group.letter}>
                <h2 className="border-y border-border bg-panel px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-dark first:border-t-0">
                  {group.letter}
                </h2>
                <ul className="divide-y divide-border">
                  {group.rows.map((row) => (
                    <DirectoryRowItem key={row.key} row={row} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            /* A chosen sort breaks the alphabet, so the letter headers come off. */
            <ul className="divide-y divide-border">
              {sortedRows.map((row) => (
                <DirectoryRowItem key={row.key} row={row} />
              ))}
            </ul>
          )}
        </div>
      )}

      {shownUnassigned.length > 0 ? (
        <section className="mt-10">
          <h2 className="section-label">Unassigned people</h2>
          <div className="banner-warn mb-4">
            Every contact should belong to a business. Pick one for each person below to file them
            correctly.
          </div>
          <div className="card card-flush overflow-hidden">
            <ul className="divide-y divide-border">
              {shownUnassigned.map((contact) => {
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
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
                      <PhoneLink phone={contact.phone ?? contact.cellPhone} ext={contact.phoneExt} />
                    </span>
                    <AssignCompanySelect contactId={contact.id} companies={allCompanies} />
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
