import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { Avatar, EmailLink, PageHeader, PhoneLink, TypeBadge, VerticalLabel } from "./_ui";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const search = (q ?? "").trim();
  const typeFilter = (type ?? "").trim();

  const companies = await prisma.company.findMany({
    where: {
      ...(search ? { name: { contains: search } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: [{ priorityClient: "desc" }, { name: "asc" }],
    include: { _count: { select: { contacts: true, opportunities: true, orders: true } } },
  });

  const chipHref = (value: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value) params.set("type", value);
    const query = params.toString();
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
            <InstantSearch
              paramKey="q"
              placeholder="Search company name…"
              className="input-klyne w-full sm:w-96"
            />
            <p className="text-[13px] text-gray">
              {companies.length} business{companies.length === 1 ? "" : "es"}
            </p>
          </div>

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
          {search || typeFilter ? (
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
