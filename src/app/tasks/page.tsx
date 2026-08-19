import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, TASK_PRIORITIES, labelFor } from "@/lib/constants";
import { createTask } from "./actions";
import TaskActions from "./TaskActions";

export const dynamic = "force-dynamic";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

const TYPE_LABELS: Record<string, string> = {
  internal: "Internal",
  customer_service: "Customer Service",
  external: "External",
};

function linkedHref(linkedType: string | null, linkedId: string | null): string | null {
  if (!linkedType || !linkedId) return null;
  if (linkedType === "order") return `/orders/${linkedId}`;
  if (linkedType === "opportunity") return `/pipeline/${linkedId}`;
  return null;
}

function isOverdue(dueDate: Date | null, status: string) {
  if (!dueDate || status === "done") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export default async function TasksPage() {
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { parentTaskId: null },
      include: {
        assignee: { select: { name: true } },
        subtasks: { include: { assignee: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const grouped = TASK_STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    tasks: tasks.filter((t) => t.status === s.value),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <p className="mt-1 text-sm text-gray-500">Internal, customer-service, and external follow-ups.</p>
      </div>

      <form
        action={createTask}
        className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Title
          <input name="title" required className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Assignee
          <select name="assigneeId" className="rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">— unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Due date
          <input type="date" name="dueDate" className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Priority
          <select name="priority" defaultValue="medium" className="rounded border border-gray-300 px-2 py-1.5 text-sm">
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Type
          <select name="type" defaultValue="internal" className="rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="internal">Internal</option>
            <option value="customer_service">Customer Service</option>
            <option value="external">External</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700">
          Create task
        </button>
      </form>

      {grouped.map((group) => (
        <section key={group.status}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {group.label}{" "}
            <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">{group.tasks.length}</span>
          </h2>
          {group.tasks.length === 0 ? (
            <div className="rounded border border-dashed border-gray-200 bg-white px-4 py-4 text-center text-sm text-gray-400">
              Nothing here.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pl-3 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Assignee</th>
                    <th className="py-2 pr-3 font-medium">Due</th>
                    <th className="py-2 pr-3 font-medium">Priority</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Linked</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => {
                    const href = linkedHref(task.linkedType, task.linkedId);
                    const overdue = isOverdue(task.dueDate, task.status);
                    return (
                      <Fragment key={task.id}>
                        <tr className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pl-3 pr-3 font-medium text-gray-900">{task.title}</td>
                          <td className="py-2 pr-3 text-gray-700">{task.assignee?.name ?? "—"}</td>
                          <td className={`py-2 pr-3 ${overdue ? "font-semibold text-red-600" : "text-gray-700"}`}>
                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                              {labelFor(TASK_PRIORITIES, task.priority)}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-gray-700">{TYPE_LABELS[task.type] ?? task.type}</td>
                          <td className="py-2 pr-3">
                            {href ? (
                              <a href={href} className="text-blue-600 hover:underline">
                                {task.linkedType} →
                              </a>
                            ) : task.linkedType ? (
                              <span className="text-gray-500">
                                {task.linkedType}: {task.linkedId}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <TaskActions taskId={task.id} status={task.status} />
                          </td>
                        </tr>
                        {task.subtasks.map((sub) => {
                          const subOverdue = isOverdue(sub.dueDate, sub.status);
                          return (
                            <tr key={sub.id} className="border-b border-gray-100 bg-gray-50/60 last:border-0">
                              <td className="py-1.5 pl-8 pr-3 text-gray-700">↳ {sub.title}</td>
                              <td className="py-1.5 pr-3 text-gray-600">{sub.assignee?.name ?? "—"}</td>
                              <td className={`py-1.5 pr-3 ${subOverdue ? "font-semibold text-red-600" : "text-gray-600"}`}>
                                {sub.dueDate ? new Date(sub.dueDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-1.5 pr-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[sub.priority] ?? ""}`}>
                                  {labelFor(TASK_PRIORITIES, sub.priority)}
                                </span>
                              </td>
                              <td className="py-1.5 pr-3 text-gray-600">{TYPE_LABELS[sub.type] ?? sub.type}</td>
                              <td className="py-1.5 pr-3 text-gray-400">—</td>
                              <td className="py-1.5 pr-3">
                                <TaskActions taskId={sub.id} status={sub.status} />
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
