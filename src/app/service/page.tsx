import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { redirect } from "next/navigation";
import { PageHeader } from "@/lib/PageLayout";
import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import IssueRow, { type IssueRowData } from "./IssueRow";

export const dynamic = "force-dynamic";

type ServiceSearchParams = { companyId?: string; orderId?: string } & Record<
  string,
  string | string[] | undefined
>;

const OPEN_STATUSES = new Set(["open", "in_progress"]);

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<ServiceSearchParams>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const { companyId: prefillCompanyId, orderId: prefillOrderId } = sp;

  if (prefillCompanyId || prefillOrderId) {
    const prefill = new URLSearchParams();
    if (prefillCompanyId) prefill.set("companyId", prefillCompanyId);
    if (prefillOrderId) prefill.set("orderId", prefillOrderId);
    redirect(`/service/new?${prefill}`);
  }

  const users = await getActiveUsers();

  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: SERVICE_ISSUE_STATUSES,
    },
    {
      key: "assignee",
      label: "Assignee",
      type: "enum",
      options: users.map((u) => ({ value: u.id, label: u.name })),
    },
    { key: "company", label: "Business", type: "text" },
    {
      key: "priority",
      label: "Priority",
      type: "enum",
      options: TASK_PRIORITIES,
    },
    { key: "reportedAt", label: "Reported Date", type: "date" },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  // Filters other than status feed both the row list and the status count
  // chips, so a company/priority/assignee filter narrows the counts too - but
  // picking a status chip never hides the other chips' counts.
  const baseWhere: Prisma.ServiceIssueWhereInput = {};
  if (filters.title)
    baseWhere.title = { contains: filters.title, mode: "insensitive" };
  if (filters.assignee) baseWhere.assigneeId = filters.assignee;
  if (filters.company)
    baseWhere.company = {
      name: { contains: filters.company, mode: "insensitive" },
    };
  if (filters.priority) baseWhere.priority = filters.priority;
  if (filters.reportedAt) {
    const day = new Date(filters.reportedAt);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    baseWhere.reportedAt = { gte: day, lt: nextDay };
  }

  const nestedWhere = compileFilterTree<Prisma.ServiceIssueWhereInput>(
    FIELDS,
    sp.filter_tree,
    {
      title: "title",
      status: "status",
      assignee: "assigneeId",
      company: "company.name",
      priority: "priority",
      reportedAt: "reportedAt",
    },
  );
  if (nestedWhere) baseWhere.AND = [nestedWhere];

  const where: Prisma.ServiceIssueWhereInput = filters.status
    ? { ...baseWhere, status: filters.status }
    : baseWhere;

  const ORDER_BY: Record<string, Prisma.ServiceIssueOrderByWithRelationInput> =
    {
      title: { title: sortDir },
      status: { status: sortDir },
      assignee: { assignee: { name: sortDir } },
      company: { company: { name: sortDir } },
      priority: { priority: sortDir },
      reportedAt: { reportedAt: sortDir },
    };

  const include = {
    company: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
    order: { select: { id: true, title: true } },
    lineItem: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
  } satisfies Prisma.ServiceIssueInclude;
  const query = (where: Prisma.ServiceIssueWhereInput) =>
    prisma.serviceIssue.findMany({
      take: limit + 1,
      where,
      include,
      orderBy: [
        sortKey ? ORDER_BY[sortKey] : { reportedAt: "desc" },
        { id: "asc" },
      ],
    });
  // Query the open section first so a page boundary never hides older open issues.
  const rows =
    !sortKey && !filters.status
      ? (
          await Promise.all([
            query({ ...baseWhere, status: { in: [...OPEN_STATUSES] } }),
            query({ ...baseWhere, status: { notIn: [...OPEN_STATUSES] } }),
          ])
        )
          .flat()
          .slice(0, limit + 1)
      : await query(where);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  // Default (no explicit Sort by): open issues first, then reported most-recently first
  // within each group - the query already sorted by reportedAt desc, and JS sort is
  // stable, so grouping by openness preserves that secondary order.
  const issueRows = sortKey
    ? rows
    : [...rows].sort((a, b) =>
        Number(OPEN_STATUSES.has(a.status)) ===
        Number(OPEN_STATUSES.has(b.status))
          ? 0
          : OPEN_STATUSES.has(a.status)
            ? -1
            : 1,
      );

  const toRowData = (r: (typeof rows)[number]): IssueRowData => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    reportedAt: r.reportedAt,
    resolvedAt: r.resolvedAt,
    resolution: r.resolution,
    assigneeId: r.assigneeId,
    assigneeName: r.assignee?.name ?? null,
    company: r.company,
    location: r.location,
    order: r.order,
    lineItem: r.lineItem,
  });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Customer Service"
        subtitle="Customer issues from every order and line item."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={issueRows.length}
            />
          </Suspense>
        }
      >
        <Link href="/service/new" className="btn btn-primary">
          Log an issue
        </Link>
      </PageHeader>

      {issueRows.length === 0 ? (
        <div className="empty-state">
          {Object.values(filters).some(Boolean) || !!nestedWhere
            ? "No issues match these filters."
            : "No service issues yet. They land here once someone logs a customer call from the header, or from an order's Service tab."}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table-klyne min-w-[900px]">
            <thead>
              <tr>
                <SortHeader field="title">Issue</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="priority">Priority</SortHeader>
                <SortHeader field="company">Related record</SortHeader>
                <SortHeader field="assignee">Assignee</SortHeader>
                <SortHeader field="reportedAt">Reported</SortHeader>
              </tr>
            </thead>
            <TableRows columns={6}>
              {issueRows.map((r) => (
                <IssueRow key={r.id} issue={toRowData(r)} users={users} />
              ))}
            </TableRows>
          </table>
        </div>
      )}
      <MoreRecords href="/service" limit={limit} hasMore={hasMore} />
    </div>
  );
}
