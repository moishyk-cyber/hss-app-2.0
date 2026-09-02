import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES, COMPANY_VERTICALS } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { InstantSearch } from "@/lib/ui";
import { Avatar, EmailLink, PageHeader, PhoneLink, TypeBadge, VerticalLabel } from "./_ui";

export const dynamic = "force-dynamic";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

/**
 * Sort by / Filter by columns for this list (Aug 31 feedback: every list, any field).
 * Name and Type are sort-only on purpose: the pinned search box owns name text and
 * the type chips own the `type` param, so a second control for either would be a
 * duplicate that writes a different param and fights the first one.
 */
const COMPANY_FIELDS: ReadonlyArray<ListField> = [
  { key: "name", label: "Name", type: "text", filterable: false },
  { key: "type", label: "Type", type: "enum", options: COMPANY_TYPES, filterable: false },
  { key: "vertical", label: "Vertical", type: "enum", options: COMPANY_VERTICALS },
  { key: "priority", label: "Priority client", type: "enum", options: YES_NO },
  { key: "created", label: "Created", type: "date", filterable: false },
];

/** sortKey to Prisma orderBy. Anything not listed falls back to the page default. */
const COMPANY_ORDER: Record<
  string,
  (dir: "asc" | "desc") => Prisma.CompanyOrderByWithRelationInput[]
> = {
  name: (dir) => [{ name: dir }],
  type: (dir) => [{ type: dir }, { name: "asc" }],
  vertical: (dir) => [{ vertical: dir }, { name: "asc" }],
  priority: (dir) => [{ priorityClient: dir }, { name: "asc" }],
  created: (dir) => [{ createdAt: dir }],
};

const DEFAULT_ORDER: Prisma.CompanyOrderByWithRelationInput[] = [
  { priorityClient: "desc" },
  { name: "asc" },
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const typeFilter = typeof params.type === "string" ? params.type.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(COMPANY_FIELDS, params);

  const filterWhere: Prisma.CompanyWhereInput = {};
  if (filters.vertical) filterWhere.vertical = filters.vertical;
  if (filters.priority) filterWhere.priorityClient = filters.priority === "yes";
  const hasListFilter = Object.keys(filterWhere).length > 0;

  const companies = await prisma.company.findMany({
    where: {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...filterWhere,
    },
    orderBy: sortKey && COMPANY_ORDER[sortKey] ? COMPANY_ORDER[sortKey](sortDir) : DEFAULT_ORDER,
    include: { _count: { select: { contacts: true, opportunities: true, orders: true } } },
  });

  // Chips rewrite only `type` - search, sort and f_* params ride along untouched.
  const chipHref = (value: string) => {
    const next = new URLSearchParams();
    for (const [key, raw] of Object.entries(params)) {
      if (key === "type") continue;
      if (typeof raw === "string" && raw !== "") next.set(key, raw);
    }
    if (value) next.set("type", value);
    const query = next.toString();
    return query ? `/companies?${query}` : "/companies";
  };

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} ${companies.length === 1 ? "business" : "businesses"}`}
      >
        <Link href="/companies/new" className="btn btn-primary">
          New company
        </Link>
      </PageHeader>

      {/* Search and filters stay pinned - the list under them can run for pages. */}
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 pb-3 pt-1">
        <div className="card space-y-3 bg-surface/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={<div className="input-klyne h-9 w-full animate-pulse sm:w-96" />}>
              <InstantSearch
                paramKey="q"
                placeholder="Search company name…"
                className="input-klyne w-full sm:w-96"
                ariaLabel="Search businesses"
              />
            </Suspense>
            <p className="text-[13px] text-gray">
              {companies.length} business{companies.length === 1 ? "" : "es"}
            </p>
          </div>

          {/* useSearchParams needs a boundary even on a force-dynamic page. */}
          <Suspense fallback={<div className="h-8" />}>
            <ListControls fields={COMPANY_FIELDS} />
          </Suspense>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={chipHref("")}
              className={`chip transition-colors active:scale-[0.98] ${
                typeFilter ? "" : "chip-active"
              }`}
            >
              All types
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

      {companies.length === 0 ? (
        <div className="empty-state">
          {search || typeFilter || hasListFilter ? (
            "No businesses match this filter."
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
          <ul className="divide-y divide-border">
            {companies.map((c) => (
              <li
                key={c.id}
                className="relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover"
              >
                {/* Rounded square: this row is led by a business name. */}
                <Avatar name={c.name} kind="business" />

                {/*
                  Stretched link: the whole row opens the company, while the mail and
                  tel anchors sit above it (relative z-10) so they still compose and dial.
                */}
                <Link
                  href={`/companies/${c.id}`}
                  className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                >
                  {c.priorityClient ? (
                    <span className="mr-1 text-ink" title="Priority client" aria-label="Priority client">
                      ★
                    </span>
                  ) : null}
                  {c.name}
                </Link>

                <span className="hidden min-w-0 flex-[2] truncate text-[13px] text-gray-dark lg:block">
                  {c.locationName ?? c.deliveryAddress ?? c.billingAddress}
                </span>

                <span className="relative z-10 hidden min-w-0 flex-[3] md:block">
                  <EmailLink email={c.email} />
                </span>

                <span className="relative z-10 hidden min-w-0 flex-[2] sm:block">
                  <PhoneLink phone={c.phone} ext={c.phoneExt} />
                </span>

                <span className="hidden min-w-0 flex-[2] truncate text-[12px] text-gray 2xl:block">
                  <VerticalLabel vertical={c.vertical} /> · {c._count.contacts} contacts ·{" "}
                  {c._count.opportunities} deals · {c._count.orders} orders
                </span>

                <span className="shrink-0">
                  <TypeBadge type={c.type} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
