import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { collectionLimit, MoreRecords } from "@/lib/CollectionWindow";
import { resolveLinkedLabels } from "./data";
import { QueryLink } from "@/lib/QueryLink";
import { currentUserId } from "@/lib/identityServer";
import { PageHeader } from "@/lib/PageLayout";
import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import QuickAddTask from "./QuickAddTask";
import TaskListClient from "./TaskListClient";
import { TASK_TYPE_LABELS } from "./lib";
import type { TaskRowData } from "./TaskRow";

export const dynamic = "force-dynamic";

const TASK_TYPE_OPTIONS = Object.entries(TASK_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// Reliability spec: "An unassigned task appears in the Admin-visible
// Unassigned queue." A magic filter value keeps this on the same Sort by /
// Filter by control every other list already uses, instead of a one-off UI.
const UNASSIGNED_FILTER_VALUE = "__unassigned__";

type TasksSearchParams = { status?: string } & Record<
  string,
  string | string[] | undefined
>;

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
  const limit = collectionLimit(sp);
  const signedInUserId = await currentUserId();
  const status =
    typeof sp.f_status === "string"
      ? sp.f_status
      : typeof sp.status === "string"
        ? sp.status
        : undefined;

  const users = await getActiveUsers();

  // Sort by / Filter by (Aug 31 feedback: "select by any field" on every list).
  // Status keeps its own chips + the client-side Completed split - not part of
  // this field set.
  const FIELDS: ListField[] = [
    { key: "status", label: "Status", type: "enum", options: TASK_STATUSES },
    { key: "title", label: "Title", type: "text" },
    {
      key: "assignee",
      label: "Assignee",
      type: "enum",
      options: [
        { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
        ...users.map((u) => ({ value: u.id, label: u.name })),
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "enum",
      options: TASK_PRIORITIES,
    },
    { key: "type", label: "Type", type: "enum", options: TASK_TYPE_OPTIONS },
    { key: "dueDate", label: "Due Date", type: "date" },
  ];
  const { sortKey, sortDir, filters } = parseListQuery(FIELDS, sp);

  const where: Prisma.TaskWhereInput = { parentTaskId: null };
  if (sp.mine === "1" && signedInUserId)
    where.AND = [{ assigneeId: signedInUserId }];
  if (status && TASK_STATUSES.some((s) => s.value === status))
    where.status = status;
  if (filters.title)
    where.title = { contains: filters.title, mode: "insensitive" };
  if (filters.assignee)
    where.assigneeId =
      filters.assignee === UNASSIGNED_FILTER_VALUE ? null : filters.assignee;
  if (filters.priority) where.priority = filters.priority;
  if (filters.type) where.type = filters.type;
  if (filters.dueDate) {
    const day = new Date(filters.dueDate);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.dueDate = { gte: day, lt: nextDay };
  }

  const ORDER_BY: Record<string, Prisma.TaskOrderByWithRelationInput> = {
    status: { status: sortDir },
    title: { title: sortDir },
    assignee: { assignee: { name: sortDir } },
    priority: { priority: sortDir },
    type: { type: sortDir },
    dueDate: { dueDate: sortDir },
  };
  const orderBy = sortKey ? ORDER_BY[sortKey] : undefined;

  const nestedWhere = compileFilterTree<Prisma.TaskWhereInput>(
    FIELDS,
    sp.filter_tree,
    {
      title: "title",
      status: "status",
      assignee: "assigneeId",
      priority: "priority",
      type: "type",
      dueDate: "dueDate",
    },
  );

  const tasks = await prisma.task.findMany({
    take: limit + 1,
    where: { AND: [where, nestedWhere ?? {}] },
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

  const hasMore = tasks.length > limit;
  if (hasMore) tasks.pop();

  const allTasksFlat = tasks.flatMap((t) => [
    t as TaskWithRelations,
    ...(t.subtasks as TaskWithRelations[]),
  ]);
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
      linkedLabel:
        t.linkedType && t.linkedId
          ? (labelMap.get(`${t.linkedType}:${t.linkedId}`) ?? null)
          : null,
      commentCount: t._count.comments,
      subtasks: [],
    };
  }

  const rows: TaskRowData[] = tasks.map((t) => ({
    ...toRowData(t as TaskWithRelations),
    subtasks: t.subtasks.map((s) => toRowData(s as TaskWithRelations)),
  }));

  const validStatus =
    status && TASK_STATUSES.some((s) => s.value === status) ? status : null;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Tasks"
        subtitle="Internal, customer-service, and external follow-ups."
        toolbar={
          <Suspense>
            <ListControls
              hasMore={hasMore}
              fields={FIELDS}
              count={
                rows.filter((t) => !validStatus || t.status === validStatus)
                  .length
              }
            >
              <QueryLink
                href="/tasks"
                clear={["mine"]}
                className={sp.mine === "1" ? "chip" : "chip chip-active"}
              >
                All tasks
              </QueryLink>
              <QueryLink
                href="/tasks?mine=1"
                className={sp.mine === "1" ? "chip chip-active" : "chip"}
              >
                My tasks
              </QueryLink>
            </ListControls>
          </Suspense>
        }
      >
        <Link href="/tasks/new" className="btn btn-primary">
          New task
        </Link>
      </PageHeader>

      <QuickAddTask />

      <TaskListClient
        tasks={rows}
        statusFilter={validStatus}
        users={users}
        currentUserId={signedInUserId}
      />

      <MoreRecords href="/tasks" limit={limit} hasMore={hasMore} />
    </div>
  );
}
