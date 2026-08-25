import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES, labelFor } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { CONTACT_TITLES } from "../contacts/_ui";
import { AssignCompanySelect } from "./AssignCompanySelect";
import { EmailLink, PageHeader, PhoneLink, TypeBadge } from "./_ui";

export const dynamic = "force-dynamic";

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
      orderBy: [{ priorityClient: "desc" }, { name: "asc" }],
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

  const peopleCount =
    companies.reduce((sum, c) => sum + c.contacts.length, 0) + unassigned.length;

  const chipHref = (value: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value) params.set("type", value);
    const query = params.toString();
    return query ? `/phonebook?${query}` : "/phonebook";
  };

  return (
    <div>
      <PageHeader
        title="Phone Book"
        subtitle="Every business and every person — one directory."
      >
        <Link href="/companies/new" className="btn">
          New business
        </Link>
        <Link href="/contacts/new" className="btn btn-primary">
          New contact
        </Link>
      </PageHeader>

      <div className="mb-4">
        <label className="block">
          <span className="field-label">Search</span>
          <InstantSearch
            paramKey="q"
            placeholder="Business, person, phone or email…"
            className="input-klyne w-80"
          />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      <p className="page-sub mb-4">
        {companies.length} business{companies.length === 1 ? "" : "es"} · {peopleCount} person
        {peopleCount === 1 ? "" : "s"}
      </p>

      {companies.length === 0 ? (
        <div className="empty-state">
          {search ? (
            `Nothing in the phone book matches “${search}”.`
          ) : (
            <>
              No businesses yet.{" "}
              <Link href="/companies/new" className="text-accent transition-colors hover:underline">
                Add the first one
              </Link>{" "}
              — every contact, deal and order hangs off a business.
            </>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {companies.map((company) => (
            <section key={company.id}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-panel px-4 py-3">
                {company.priorityClient ? (
                  <span className="text-accent" title="Priority client" aria-label="Priority client">
                    ★
                  </span>
                ) : null}
                <Link
                  href={`/companies/${company.id}`}
                  className="font-heading text-[14px] font-semibold text-ink transition-colors hover:text-accent"
                >
                  {company.name}
                </Link>
                <TypeBadge type={company.type} />
                <span className="badge badge-gray">{company.contacts.length}</span>

                <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-gray-dark">
                  <PhoneLink phone={company.phone} ext={company.phoneExt} />
                  <EmailLink email={company.email} />
                  {company.deliveryAddress || company.billingAddress ? (
                    <span className="max-w-xs truncate text-gray">
                      {company.deliveryAddress ?? company.billingAddress}
                    </span>
                  ) : null}
                </span>
              </div>

              {company.contacts.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray">
                  No people yet —{" "}
                  <Link
                    href={`/contacts/new?companyId=${company.id}`}
                    className="text-accent hover:underline"
                  >
                    add one
                  </Link>
                  .
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {company.contacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] transition-colors hover:bg-hover sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]"
                    >
                      <Link
                        href={`/contacts/${contact.id}/edit`}
                        className="truncate font-medium text-ink transition-colors hover:text-accent"
                      >
                        {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                      </Link>
                      <span className="truncate text-gray-dark">
                        {labelFor(CONTACT_TITLES, contact.title)}
                      </span>
                      <span className="truncate text-gray-dark">
                        <PhoneLink phone={contact.phone} ext={contact.phoneExt} />
                      </span>
                      <span className="truncate text-gray-dark">
                        <PhoneLink phone={contact.cellPhone} />
                      </span>
                      <span className="flex min-w-0 text-gray-dark">
                        <EmailLink email={contact.email} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {unassigned.length > 0 ? (
        <section className="mt-8">
          <h2 className="section-label mb-2">Unassigned people</h2>
          <div className="banner-warn mb-3">
            Every contact should belong to a business. Pick one for each person below to file them
            correctly.
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {unassigned.map((contact) => (
              <div
                key={contact.id}
                className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]"
              >
                <Link
                  href={`/contacts/${contact.id}/edit`}
                  className="truncate font-medium text-ink transition-colors hover:text-accent"
                >
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                </Link>
                <span className="truncate text-gray-dark">
                  <PhoneLink phone={contact.phone} ext={contact.phoneExt} />
                </span>
                <span className="flex min-w-0 text-gray-dark">
                  <EmailLink email={contact.email} />
                </span>
                <AssignCompanySelect contactId={contact.id} companies={allCompanies} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
