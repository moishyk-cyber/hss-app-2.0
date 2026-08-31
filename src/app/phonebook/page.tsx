import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { AssignCompanySelect } from "./AssignCompanySelect";
import { Avatar, EmailLink, PageHeader, PhoneLink, TypeBadge } from "./_ui";

export const dynamic = "force-dynamic";

/**
 * One line in the directory. Businesses and people share the same shape so they can
 * be sorted into a single alphabetical list (Aug 31 feedback: the card grid buried
 * people inside their business — a phone book should be one dense scannable list).
 */
type DirectoryRow = {
  key: string;
  kind: "business" | "person";
  /** Alphabetised on this — the same string that's displayed. */
  name: string;
  /** Second column: the person's business, or the site the business sits at. */
  subtitle: string | null;
  email: string | null;
  phone: string | null;
  phoneExt: string | null;
  /** Company type, for the chip — a person inherits their business's. */
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
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const search = (q ?? "").trim();
  const typeFilter = (type ?? "").trim();
  // Stored numbers are digits-only, so a search of "(718) 871" should still hit.
  const digits = search.replace(/\D/g, "");

  const contactMatch: Prisma.ContactWhereInput | undefined = search
    ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
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
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
            { cellPhone: { contains: search } },
            { locationName: { contains: search } },
            { deliveryAddress: { contains: search } },
            { billingAddress: { contains: search } },
            ...(digits.length >= 3
              ? [{ phone: { contains: digits } }, { cellPhone: { contains: digits } }]
              : []),
            // A person matching pulls their whole business into the results.
            { contacts: { some: contactMatch } },
          ],
        }
      : {}),
  };

  const [companies, unassigned, allCompanies] = await Promise.all([
    prisma.company.findMany({
      where: companyWhere,
      orderBy: { name: "asc" },
      include: {
        contacts: { orderBy: [{ firstName: "asc" }, { lastName: "asc" }] },
      },
    }),
    // Orphans only make sense when we aren't filtering by a business type.
    typeFilter
      ? Promise.resolve([])
      : prisma.contact.findMany({
          where: { companyId: null, ...(contactMatch ?? {}) },
          orderBy: [{ firstName: "asc" }],
        }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const peopleCount = companies.reduce((sum, c) => sum + c.contacts.length, 0) + unassigned.length;

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
        href: `/contacts/${contact.id}/edit`,
        priority: false,
      });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const groups: { letter: string; rows: DirectoryRow[] }[] = [];
  for (const row of rows) {
    const letter = groupLetter(row.name);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.rows.push(row);
    else groups.push({ letter, rows: [row] });
  }

  const chipHref = (value: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value) params.set("type", value);
    const query = params.toString();
    return query ? `/phonebook?${query}` : "/phonebook";
  };

  return (
    <div>
      <PageHeader title="Phone Book" subtitle="Every business and every person — one directory.">
        <Link href="/companies/new" className="btn">
          New business
        </Link>
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      {/* Search and filters stay pinned — the list under them can run for pages. */}
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 pb-3 pt-1">
        <div className="card space-y-3 bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <InstantSearch
              paramKey="q"
              placeholder="Search business, person, phone or email…"
              className="input-klyne w-full sm:w-96"
            />
            <p className="text-[13px] text-gray">
              {companies.length} business{companies.length === 1 ? "" : "es"} · {peopleCount}{" "}
              {peopleCount === 1 ? "person" : "people"}
            </p>
          </div>

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

      {rows.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `Nothing in the phone book matches “${search}”.`
          ) : (
            <>
              No businesses yet.{" "}
              <Link href="/companies/new" className="text-primary transition-colors hover:underline">
                Add the first one
              </Link>{" "}
              — every contact, deal and order hangs off a business.
            </>
          )}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          {groups.map((group) => (
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
          ))}
        </div>
      )}

      {unassigned.length > 0 ? (
        <section className="mt-10">
          <h2 className="section-label">Unassigned people</h2>
          <div className="banner-warn mb-4">
            Every contact should belong to a business. Pick one for each person below to file them
            correctly.
          </div>
          <div className="card card-flush overflow-hidden">
            <ul className="divide-y divide-border">
              {unassigned.map((contact) => {
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
                return (
                  <li
                    key={contact.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors hover:bg-hover"
                  >
                    <Avatar name={name} kind="person" />
                    <Link
                      href={`/contacts/${contact.id}/edit`}
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
