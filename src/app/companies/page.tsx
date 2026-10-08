import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { Suspense } from "react";
import Link from "@/lib/IntentLink";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TYPES, COMPANY_VERTICALS } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import {
  Avatar,
  EmailLink,
  PageHeader,
  PhoneLink,
  TypeBadge,
  VerticalLabel,
} from "./_ui";

export const dynamic = "force-dynamic";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

/** Shared directory fields for column sorting and independent filters. */
const COMPANY_FIELDS: ReadonlyArray<ListField> = [
  { key: "name", label: "Name", type: "text" },
  { key: "type", label: "Type", type: "enum", options: COMPANY_TYPES },
  {
    key: "vertical",
    label: "Vertical",
    type: "enum",
    options: COMPANY_VERTICALS,
  },
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
  const limit = collectionLimit(params);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const { sortKey, sortDir, filters } = parseListQuery(COMPANY_FIELDS, params);
  const legacyType = typeof params.type === "string" ? params.type : "";
  const typeFilter =
    filters.type ??
    (COMPANY_TYPES.some((t) => t.value === legacyType) ? legacyType : "");

  const filterWhere: Prisma.CompanyWhereInput = {};
  if (filters.name)
    filterWhere.name = { contains: filters.name, mode: "insensitive" };
  if (filters.vertical) filterWhere.vertical = filters.vertical;
  if (filters.priority) filterWhere.priorityClient = filters.priority === "yes";
  const hasListFilter =
    Object.keys(filterWhere).length > 0 || !!params.filter_tree;

  const nestedWhere = compileFilterTree<Prisma.CompanyWhereInput>(
    COMPANY_FIELDS,
    params.filter_tree,
    {
      name: "name",
      type: "type",
      vertical: "vertical",
      priority: (condition) => ({ priorityClient: condition.value === "yes" }),
    },
  );

  const companies = await prisma.company.findMany({
    take: limit + 1,
    where: {
      AND: nestedWhere ? [nestedWhere] : undefined,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...filterWhere,
    },
    orderBy:
      sortKey && COMPANY_ORDER[sortKey]
        ? COMPANY_ORDER[sortKey](sortDir)
        : DEFAULT_ORDER,
  });

  const hasMore = companies.length > limit;
  if (hasMore) companies.pop();

  return (
    <div>
      <PageHeader
        title="Businesses"
        subtitle="Business directory and contact details."
        toolbar={
          <Suspense fallback={<div className="h-8" />}>
            <ListControls
              hasMore={hasMore}
              searchParam="q"
              fields={COMPANY_FIELDS}
              count={companies.length}
            />
          </Suspense>
        }
      >
        <Link href="/companies/new" className="btn btn-primary">
          New business
        </Link>
      </PageHeader>

      {companies.length === 0 ? (
        <div className="empty-state">
          {search || typeFilter || hasListFilter ? (
            "No businesses match this filter."
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
                <SortHeader field="name">Business</SortHeader>
                <SortHeader>Location</SortHeader>
                <SortHeader>Email</SortHeader>
                <SortHeader>Phone</SortHeader>
                <SortHeader field="vertical">Vertical</SortHeader>
                <SortHeader field="type">Type</SortHeader>
                <SortHeader field="created">Created</SortHeader>
              </tr>
            </thead>
            <TableRows columns={7}>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={c.name} kind="business" />
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.priorityClient ? "★ " : ""}
                        {c.name}
                      </Link>
                    </div>
                  </td>
                  <td>
                    {c.locationName ??
                      c.deliveryAddress ??
                      c.billingAddress ??
                      "—"}
                  </td>
                  <td>
                    <EmailLink email={c.email} />
                  </td>
                  <td>
                    <PhoneLink phone={c.phone} ext={c.phoneExt} />
                  </td>
                  <td>
                    <VerticalLabel vertical={c.vertical} />
                  </td>
                  <td>
                    <TypeBadge type={c.type} />
                  </td>
                  <td className="whitespace-nowrap">
                    {c.createdAt.toLocaleDateString("en-US", {
                      timeZone: "UTC",
                    })}
                  </td>
                </tr>
              ))}
            </TableRows>
          </table>
        </div>
      )}
      <MoreRecords href="/companies" limit={limit} hasMore={hasMore} />
    </div>
  );
}
