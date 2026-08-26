import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES, labelFor } from "@/lib/constants";
import { InstantSearch } from "@/lib/ui";
import { CONTACT_TITLES } from "../contacts/_ui";
import { AssignCompanySelect } from "./AssignCompanySelect";
import { AddressLine, EmailLink, PageHeader, PhoneLink, TypeBadge } from "./_ui";

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

      <div className="mb-5">
        <label className="block">
          <span className="field-label">Search</span>
          <InstantSearch
            paramKey="q"
            placeholder="Business, person, phone or email…"
            className="input-klyne w-80"
          />
        </label>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
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

      <p className="page-sub mb-5">
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
              <Link href="/companies/new" className="text-primary transition-colors hover:underline">
                Add the first one
              </Link>{" "}
              — every contact, deal and order hangs off a business.
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {companies.map((company) => (
            <section key={company.id} className="card card-interactive">
              {/* Header: identity first, reach-the-business details underneath. */}
              <header className="border-b border-border pb-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {company.priorityClient ? (
                    <span
                      className="text-[15px] leading-none text-ink"
                      title="Priority client"
                      aria-label="Priority client"
                    >
                      ★
                    </span>
                  ) : null}
                  <Link
                    href={`/companies/${company.id}`}
                    className="font-heading text-[16px] font-semibold text-ink hover:underline"
                  >
                    {company.name}
                  </Link>
                  <TypeBadge type={company.type} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <PhoneLink phone={company.phone} ext={company.phoneExt} label="Main line" />
                  <EmailLink email={company.email} />
                  <AddressLine address={company.deliveryAddress ?? company.billingAddress} />
                </div>
              </header>

              {company.contacts.length === 0 ? (
                <p className="pt-4 text-[13px] text-gray">
                  <span className="empty-value">No people yet.</span>{" "}
                  <Link
                    href={`/contacts/new?companyId=${company.id}`}
                    className="text-primary transition-colors hover:underline"
                  >
                    Add the first contact
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {company.contacts.map((contact) => (
                    <li key={contact.id} className="py-3.5 first:pt-4 last:pb-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Link
                          href={`/contacts/${contact.id}/edit`}
                          className="font-medium text-ink hover:underline"
                        >
                          {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                        </Link>
                        {contact.title ? (
                          <span className="text-[12.5px] text-gray">
                            {labelFor(CONTACT_TITLES, contact.title)}
                          </span>
                        ) : null}
                      </div>

                      {contact.phone || contact.cellPhone || contact.email ? (
                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                          <PhoneLink
                            phone={contact.phone}
                            ext={contact.phoneExt}
                            label="Direct line"
                          />
                          <PhoneLink phone={contact.cellPhone} label="Cell" />
                          <EmailLink email={contact.email} />
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[13px]">
                          <span className="empty-value">No phone or email on file</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
          <div className="card">
            <ul className="divide-y divide-border">
              {unassigned.map((contact) => (
                <li
                  key={contact.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/contacts/${contact.id}/edit`}
                      className="font-medium text-ink hover:underline"
                    >
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <PhoneLink phone={contact.phone} ext={contact.phoneExt} />
                      <EmailLink email={contact.email} />
                    </div>
                  </div>
                  <AssignCompanySelect contactId={contact.id} companies={allCompanies} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
