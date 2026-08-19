import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS, labelFor } from "@/lib/constants";
import { createTask } from "./actions";
import TaskActions from "./TaskActions";

export const dynamic = "force-dynamic";

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
        <h1 className="page-title">Tasks</h1>
        <p className="page-sub">Internal, customer-service, and external follow-ups.</p>
      </div>

      <form action={createTask} className="card flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="field-label">Title</span>
          <input name="title" required className="input-klyne w-56" />
        </label>
        <label>
          <span className="field-label">Assignee</span>
          <select name="assigneeId" className="input-klyne">
            <option value="">— unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Due date</span>
          <input type="date" name="dueDate" className="input-klyne" />
        </label>
        <label>
          <span className="field-label">Priority</span>
          <select name="priority" defaultValue="medium" className="input-klyne">
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Type</span>
          <select name="type" defaultValue="internal" className="input-klyne">
            <option value="internal">Internal</option>
            <option value="customer_service">Customer Service</option>
            <option value="external">External</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          Create task
        </button>
      </form>

      {grouped.map((group) => (
        <section key={group.status}>
          <h2 className="section-label mb-2 flex items-center gap-2">
            {group.label}
            <span className="badge badge-gray">{group.tasks.length}</span>
          </h2>
          {group.tasks.length === 0 ? (
            <div className="empty-state">Nothing here.</div>
          ) : (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="table-klyne min-w-[760px]">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Assignee</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Type</th>
                    <th>Linked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => {
                    const href = linkedHref(task.linkedType, task.linkedId);
                    const overdue = isOverdue(task.dueDate, task.status);
                    return (
                      <Fragment key={task.id}>
                        <tr>
                          <td className="font-medium text-ink">{task.title}</td>
                          <td className="text-gray-dark">{task.assignee?.name ?? "—"}</td>
                          <td className={overdue ? "font-semibold text-red" : "text-gray-dark"}>
                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                          </td>
                          <td>
                            <span className={`badge ${TASK_PRIORITY_COLORS[task.priority] ?? "badge-gray"}`}>
                              {labelFor(TASK_PRIORITIES, task.priority)}
                            </span>
                          </td>
                          <td className="text-gray-dark">{TYPE_LABELS[task.type] ?? task.type}</td>
                          <td>
                            {href ? (
                              <a href={href} className="text-blue hover:underline">
                                {task.linkedType} →
                              </a>
                            ) : task.linkedType ? (
                              <span className="text-gray-dark">
                                {task.linkedType}: {task.linkedId}
                              </span>
                            ) : (
                              <span className="text-gray">—</span>
                            )}
                          </td>
                          <td>
                            <TaskActions taskId={task.id} status={task.status} />
                          </td>
                        </tr>
                        {task.subtasks.map((sub) => {
                          const subOverdue = isOverdue(sub.dueDate, sub.status);
                          return (
                            <tr key={sub.id} className="bg-panel/60">
                              <td className="pl-8 text-gray-dark">↳ {sub.title}</td>
                              <td className="text-gray-dark">{sub.assignee?.name ?? "—"}</td>
                              <td className={subOverdue ? "font-semibold text-red" : "text-gray-dark"}>
                                {sub.dueDate ? new Date(sub.dueDate).toLocaleDateString() : "—"}
                              </td>
                              <td>
                                <span className={`badge ${TASK_PRIORITY_COLORS[sub.priority] ?? "badge-gray"}`}>
                                  {labelFor(TASK_PRIORITIES, sub.priority)}
                                </span>
                              </td>
                              <td className="text-gray-dark">{TYPE_LABELS[sub.type] ?? sub.type}</td>
                              <td className="text-gray">—</td>
                              <td>
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
