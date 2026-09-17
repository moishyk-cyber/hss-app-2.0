import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import CreateTaskPanel from "./CreateTaskPanel";
import QuickAddTask from "./QuickAddTask";
import TaskListClient from "./TaskListClient";
import { TASK_TYPE_LABELS } from "./lib";
import type { TaskRowData } from "./TaskRow";

export const dynamic = "force-dynamic";

const TASK_TYPE_OPTIONS = Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// Reliability spec: "An unassigned task appears in the Admin-visible
// Unassigned queue." A magic filter value keeps this on the same Sort by /
// Filter by control every other list already uses, instead of a one-off UI.
const UNASSIGNED_FILTER_VALUE = "__unassigned__";

type TasksSearchParams = { status?: string } & Record<string, string | string[] | undefined>;

async function resolveLinkedLabels(pairs: { type: string; id: string }[]): Promise<Map<string, string>> {
  const byType: Record<string, string[]> = {};
  for (const p of pairs) {
    (byType[p.type] ??= []).push(p.id);
  }
  const map = new Map<string, string>();
  const [opps, orders, items, companies, contacts] = await Promise.all([
    byType.opportunity?.length
      ? prisma.opportunity.findMany({ where: { id: { in: byType.opportunity } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    byType.order?.length
      ? prisma.order.findMany({ where: { id: { in: byType.order } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    byType.line_item?.length
      ? prisma.lineItem.findMany({ where: { id: { in: byType.line_item } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    byType.company?.length
      ? prisma.company.findMany({ where: { id: { in: byType.company } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    byType.contact?.length
      ? prisma.contact.findMany({
          where: { id: { in: byType.contact } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);
  opps.forEach((o) => map.set(`opportunity:${o.id}`, o.title));
  orders.forEach((o) => map.set(`order:${o.id}`, o.title));
  items.forEach((i) => map.set(`line_item:${i.id}`, i.name));
  companies.forEach((c) => map.set(`company:${c.id}`, c.name));
  contacts.forEach((c) => map.set(`contact:${c.id}`, `${c.firstName} ${c.lastName ?? ""}`.trim()));
  return map;
}

type TaskWithRelations = {
  id: string;
  title: string;
  notes: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  dueDate: Date | null;
  status: string;
  priority: string;
  type: string;
  linkedType: string | null;
  linkedId: string | null;
  _count: { comments: number };
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  const sp = await searchParams;
  const { status } = sp;

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Status keeps its own chips + the client-side Completed split - not part of
  // this field set.
  const FIELDS: ListField[] = [
    { key: "title", label: "Title", type: "text" },
    {
      key: "assignee",
      label: "Assignee",
      type: "enum",
      options: [{ value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))],
    },
    { key: "priority", label: "Priority", type: "enum", options: TASK_PRIORITIES },
    { key: "type", label: "Type", type: "enum", options: TASK_TYPE_OPTIONS },
    { key: "dueDate", label: "Due Date", type: "date" },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const where: Prisma.TaskWhereInput = { parentTaskId: null };
  if (filters.title) where.title = { contains: filters.title, mode: "insensitive" };
  if (filters.assignee) where.assigneeId = filters.assignee === UNASSIGNED_FILTER_VALUE ? null : filters.assignee;
  if (filters.priority) where.priority = filters.priority;
  if (filters.type) where.type = filters.type;
  if (filters.dueDate) {
    const day = new Date(filters.dueDate);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.dueDate = { gte: day, lt: nextDay };
  }

  const ORDER_BY: Record<string, Prisma.TaskOrderByWithRelationInput> = {
    title: { title: sortDir },
    assignee: { assignee: { name: sortDir } },
    priority: { priority: sortDir },
    type: { type: sortDir },
    dueDate: { dueDate: sortDir },
  };
  const orderBy = sortKey ? ORDER_BY[sortKey] : undefined;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
      subtasks: {
        include: {
          assignee: { select: { id: true, name: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: orderBy ?? { createdAt: "asc" },
  });

  const allTasksFlat = tasks.flatMap((t) => [t as TaskWithRelations, ...(t.subtasks as TaskWithRelations[])]);
  const linkPairs = allTasksFlat
    .filter((t) => t.linkedType && t.linkedId)
    .map((t) => ({ type: t.linkedType as string, id: t.linkedId as string }));
  const labelMap = await resolveLinkedLabels(linkPairs);

  function toRowData(t: TaskWithRelations): TaskRowData {
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      dueDate: t.dueDate,
      status: t.status,
      priority: t.priority,
      type: t.type,
      linkedType: t.linkedType,
      linkedId: t.linkedId,
      linkedLabel: t.linkedType && t.linkedId ? labelMap.get(`${t.linkedType}:${t.linkedId}`) ?? null : null,
      commentCount: t._count.comments,
      subtasks: [],
    };
  }

  const rows: TaskRowData[] = tasks.map((t) => ({
    ...toRowData(t as TaskWithRelations),
    subtasks: t.subtasks.map((s) => toRowData(s as TaskWithRelations)),
  }));

  const counts: Record<string, number> = {};
  for (const s of TASK_STATUSES) counts[s.value] = 0;
  for (const t of allTasksFlat) counts[t.status] = (counts[t.status] ?? 0) + 1;

  const validStatus = status && TASK_STATUSES.some((s) => s.value === status) ? status : null;
  const unassignedOpenCount = allTasksFlat.filter((t) => !t.assigneeId && t.status !== "done").length;

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="page-title">Tasks</h1>
        <p className="page-sub">Internal, customer-service, and external follow-ups.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TASK_STATUSES.map((s) => {
          const active = validStatus === s.value;
          return (
            <Link
              key={s.value}
              href={active ? "/tasks" : `/tasks?status=${s.value}`}
              className="stat-card block transition-colors hover:bg-hover"
              style={active ? { borderLeftWidth: 4, borderLeftColor: "var(--primary)" } : undefined}
            >
              <div className="section-label">{s.label}</div>
              <div className="stat-value mt-1">{counts[s.value] ?? 0}</div>
            </Link>
          );
        })}
      </div>

      {unassignedOpenCount > 0 ? (
        <Link href={`/tasks?f_assignee=${UNASSIGNED_FILTER_VALUE}`} className="empty-state block transition-colors hover:bg-hover">
          {unassignedOpenCount} open task{unassignedOpenCount === 1 ? "" : "s"} with no owner. Assign one or they stay
          invisible to everyone&rsquo;s My Items.
        </Link>
      ) : null}

      <QuickAddTask />

      <Suspense>
        <ListControls fields={FIELDS} />
      </Suspense>

      <TaskListClient tasks={rows} statusFilter={validStatus} users={users} />

      <CreateTaskPanel users={users} />
    </div>
  );
}
