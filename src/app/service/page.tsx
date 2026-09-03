import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SERVICE_ISSUE_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import IssueRow, { type IssueRowData } from "./IssueRow";
import LogIssueForm, { type ServiceCompanyOption } from "./LogIssueForm";
import { resolveDefaultAssigneeId } from "./lib";

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
  const { companyId: prefillCompanyId, orderId: prefillOrderId } = sp;

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "status", label: "Status", type: "enum", options: SERVICE_ISSUE_STATUSES },
    { key: "assignee", label: "Assignee", type: "enum", options: users.map((u) => ({ value: u.id, label: u.name })) },
    { key: "company", label: "Company", type: "text" },
    { key: "priority", label: "Priority", type: "enum", options: TASK_PRIORITIES },
    { key: "reportedAt", label: "Reported Date", type: "date" },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  // Filters other than status feed both the row list and the status count
  // chips, so a company/priority/assignee filter narrows the counts too - but
  // picking a status chip never hides the other chips' counts.
  const baseWhere: Prisma.ServiceIssueWhereInput = {};
  if (filters.title) baseWhere.title = { contains: filters.title, mode: "insensitive" };
  if (filters.assignee) baseWhere.assigneeId = filters.assignee;
  if (filters.company) baseWhere.company = { name: { contains: filters.company, mode: "insensitive" } };
  if (filters.priority) baseWhere.priority = filters.priority;
  if (filters.reportedAt) {
    const day = new Date(filters.reportedAt);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    baseWhere.reportedAt = { gte: day, lt: nextDay };
  }

  const where: Prisma.ServiceIssueWhereInput = filters.status ? { ...baseWhere, status: filters.status } : baseWhere;

  const ORDER_BY: Record<string, Prisma.ServiceIssueOrderByWithRelationInput> = {
    title: { title: sortDir },
    status: { status: sortDir },
    assignee: { assignee: { name: sortDir } },
    company: { company: { name: sortDir } },
    priority: { priority: sortDir },
    reportedAt: { reportedAt: sortDir },
  };

  const [rows, statusGroups, companiesRaw] = await Promise.all([
    prisma.serviceIssue.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        order: { select: { id: true, title: true } },
        lineItem: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: sortKey ? ORDER_BY[sortKey] : { reportedAt: "desc" },
    }),
    prisma.serviceIssue.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        locations: { select: { id: true, name: true, isDefault: true }, orderBy: { name: "asc" } },
        orders: {
          select: {
            id: true,
            title: true,
            locationId: true,
            lineItems: { where: { rfqStatus: { not: "removed" } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Default (no explicit Sort by): open issues first, then reported most-recently first
  // within each group - the query already sorted by reportedAt desc, and JS sort is
  // stable, so grouping by openness preserves that secondary order.
  const issueRows = sortKey
    ? rows
    : [...rows].sort((a, b) => Number(OPEN_STATUSES.has(a.status)) === Number(OPEN_STATUSES.has(b.status))
        ? 0
        : OPEN_STATUSES.has(a.status)
          ? -1
          : 1);

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

  const counts: Record<string, number> = {};
  for (const s of SERVICE_ISSUE_STATUSES) counts[s.value] = 0;
  for (const g of statusGroups) counts[g.status] = g._count._all;
  const openCount = (counts.open ?? 0) + (counts.in_progress ?? 0);

  const companies: ServiceCompanyOption[] = companiesRaw;
  const defaultAssigneeId = await resolveDefaultAssigneeId();

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="page-title">Customer Service</h1>
        <p className="page-sub">
          {openCount} open issue{openCount === 1 ? "" : "s"}. Everything a customer has called in about, from any
          order or line item.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SERVICE_ISSUE_STATUSES.map((s) => {
          const active = filters.status === s.value;
          return (
            <Link
              key={s.value}
              href={active ? "/service" : `/service?f_status=${s.value}`}
              className="stat-card block transition-colors hover:bg-hover"
              style={active ? { borderLeftWidth: 4, borderLeftColor: "var(--primary)" } : undefined}
            >
              <div className="section-label">{s.label}</div>
              <div className="stat-value mt-1">{counts[s.value] ?? 0}</div>
            </Link>
          );
        })}
      </div>

      <LogIssueForm
        companies={companies}
        users={users}
        defaultAssigneeId={defaultAssigneeId}
        initialCompanyId={prefillCompanyId ?? null}
        initialOrderId={prefillOrderId ?? null}
      />

      <Suspense>
        <ListControls fields={FIELDS} />
      </Suspense>

      {issueRows.length === 0 ? (
        <div className="empty-state">
          {Object.values(filters).some(Boolean)
            ? "No issues match these filters."
            : "No service issues yet. They land here once someone logs a customer call above, or from an order's Service tab."}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          <div className="divide-y divide-border">
            {issueRows.map((r) => (
              <IssueRow key={r.id} issue={toRowData(r)} users={users} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
