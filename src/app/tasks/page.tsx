import TaskCollection from "./TaskCollection";
import { loadTaskCollection } from "./collectionData";
import { can } from "@/lib/permissionsServer";
import { collectionLimit } from "@/lib/CollectionWindow";
import { getActiveUsers } from "@/lib/users";
import { compileFilterTree } from "@/lib/nestedFilters";
import { resolveLinkedLabels } from "./data";
import { currentUserId } from "@/lib/identityServer";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { TASK_TYPE_LABELS } from "./lib";
import type { TaskListData } from "./TaskRow";

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

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  const sp = await searchParams;
  const limit = collectionLimit(sp);
  const currentUserPromise = currentUserId();
  const canEditPromise = can("tasks.edit");
  const usersPromise = getActiveUsers();
  const signedInUserId = sp.mine === "1" ? await currentUserPromise : null;
  const status =
    typeof sp.f_status === "string"
      ? sp.f_status
      : typeof sp.status === "string"
        ? sp.status
        : undefined;

  const queryUsers = sp.f_assignee || sp.filter_tree ? await usersPromise : [];

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
        ...queryUsers.map((u) => ({ value: u.id, label: u.name })),
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

  const select = {
    id: true, title: true, assigneeId: true, dueDate: true, status: true, priority: true,
    type: true, linkedType: true, linkedId: true,
    assignee: { select: { id: true, name: true } },
    _count: { select: { comments: true } },
    subtasks: { select: { id: true, status: true } },
  } satisfies Prisma.TaskSelect;
  const ordering: Prisma.TaskOrderByWithRelationInput[] = [orderBy ?? { createdAt: "asc" }, { id: "asc" }];
  const query = (where: Prisma.TaskWhereInput, take = limit + 1) => prisma.task.findMany({
    take, where, select, relationLoadStrategy: "join", orderBy: ordering,
  });
  const queryIds = (where: Prisma.TaskWhereInput, take = limit + 1) => prisma.task.findMany({
    take, where, select: { id: true }, orderBy: ordering,
  });
  const { rows: tasks, hasMore } = await loadTaskCollection(query, { AND: [where, nestedWhere ?? {}] }, limit, queryIds);
  const labelPromise = resolveLinkedLabels(tasks.filter(task => task.linkedType && task.linkedId)
    .map(task => ({ type: task.linkedType!, id: task.linkedId! })));
  const [labelMap, users, resolvedUserId] = await Promise.all([labelPromise, usersPromise, currentUserPromise]);
  const fields = FIELDS.map(field => field.key === "assignee" ? { ...field, options: [
    { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
    ...users.map(user => ({ value: user.id, label: user.name })),
  ] } : field);

  function toRowData(t: (typeof tasks)[number]): TaskListData {
    return {
      id: t.id,
      title: t.title,
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
      subtasks: t.subtasks,
    };
  }

  const rows = tasks.map(toRowData);

  const validStatus =
    status && TASK_STATUSES.some((s) => s.value === status) ? status : null;

  return <TaskCollection rows={rows} users={users} fields={fields} currentUserId={resolvedUserId}
    canEdit={await canEditPromise} hasMore={hasMore} limit={limit} statusFilter={validStatus} />;
}
