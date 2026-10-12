import ServiceCollection from "./ServiceCollection";
import { loadServiceCollection } from "./collectionData";
import { collectionLimit } from "@/lib/CollectionWindow";
import { can } from "@/lib/permissionsServer";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import type { IssueListData } from "./IssueRow";

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

  const canEditPromise = can("service.edit");
  const usersPromise = getActiveUsers();
  // Only assignee filters require the directory before building the query.
  // Nested filters may contain an assignee condition, so keep their validation intact.
  const queryUsers = sp.f_assignee || sp.filter_tree ? await usersPromise : [];

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
      options: queryUsers.map((u) => ({ value: u.id, label: u.name })),
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

  const select = {
    id: true,
    title: true,
    status: true,
    priority: true,
    reportedAt: true,
    assigneeId: true,
    company: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
    order: { select: { id: true, title: true } },
    lineItem: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
  } satisfies Prisma.ServiceIssueSelect;
  const query = (where: Prisma.ServiceIssueWhereInput, take = limit + 1) =>
    prisma.serviceIssue.findMany({
      take,
      where,
      select,
      relationLoadStrategy: "join",
      orderBy: [
        sortKey ? ORDER_BY[sortKey] : { reportedAt: "desc" },
        { id: "asc" },
      ],
    });
  const queryIds = (where: Prisma.ServiceIssueWhereInput, take = limit + 1) =>
    prisma.serviceIssue.findMany({
      where, take, select: { id: true },
      orderBy: [sortKey ? ORDER_BY[sortKey] : { reportedAt: "desc" }, { id: "asc" }],
    });
  const { rows, hasMore } = await loadServiceCollection(query, where, limit, queryIds);
  const users = await usersPromise;
  const fields = FIELDS.map(field => field.key === "assignee"
    ? { ...field, options: users.map(user => ({ value: user.id, label: user.name })) }
    : field);

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

  const toRowData = (r: (typeof rows)[number]): IssueListData => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    reportedAt: r.reportedAt,
    assigneeId: r.assigneeId,
    assigneeName: r.assignee?.name ?? null,
    company: r.company,
    location: r.location,
    order: r.order,
    lineItem: r.lineItem,
  });

  return <ServiceCollection issues={issueRows.map(toRowData)} users={users} fields={fields}
    canEdit={await canEditPromise} hasMore={hasMore} limit={limit}
    filtered={Object.values(filters).some(Boolean) || !!nestedWhere} />;
}
