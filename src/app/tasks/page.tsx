import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES } from "@/lib/constants";
import CreateTaskPanel from "./CreateTaskPanel";
import QuickAddTask from "./QuickAddTask";
import TaskListClient from "./TaskListClient";
import type { TaskRowData } from "./TaskRow";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { parentTaskId: null },
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
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

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

      <QuickAddTask />

      <TaskListClient tasks={rows} statusFilter={validStatus} users={users} />

      <CreateTaskPanel users={users} />
    </div>
  );
}
