"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TASK_STATUSES, TASK_PRIORITIES, labelFor } from "@/lib/constants";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { BadgeSelect } from "@/lib/ui";
import { fmtDateUTC } from "@/lib/dates";
import { TaskCheckbox } from "./TaskCheckbox";
import { setTaskStatus } from "./actions";
import { linkedHref, TYPE_LABELS, isOverdue } from "./lib";
import type { TaskRowData } from "./TaskRow";
export default function TaskListClient({
  tasks,
  statusFilter,
  currentUserId,
}: {
  tasks: TaskRowData[];
  statusFilter: string | null;
  users: { id: string; name: string }[];
  currentUserId: string | null;
}) {
  const params = useSearchParams();
  const rows = tasks.filter(
    (t) =>
      (params.get("mine") !== "1" ||
        !currentUserId ||
        t.assigneeId === currentUserId) &&
      (!statusFilter || t.status === statusFilter),
  );
  if (!rows.length)
    return (
      <div className="empty-state">
        No tasks match this view. Adjust the filters or add a task above.
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="table-klyne min-w-[950px]">
        <thead>
          <tr>
            <SortHeader field="title">Task</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <SortHeader field="priority">Priority</SortHeader>
            <SortHeader field="assignee">Assignee</SortHeader>
            <SortHeader field="dueDate">Due date</SortHeader>
            <SortHeader field="type">Type / related record</SortHeader>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <TableRows columns={7}>
          {rows.map((task) => {
            const href = linkedHref(task.linkedType, task.linkedId);
            return (
              <tr key={task.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <TaskCheckbox
                      taskId={task.id}
                      done={task.status === "done"}
                      undoStatus={task.status}
                    />
                    <Link
                      className={`font-medium hover:underline ${task.status === "done" ? "line-through text-gray-dark" : ""}`}
                      href={`/tasks/${task.id}`}
                    >
                      {task.title}
                    </Link>
                    {task.subtasks.length > 0 && (
                      <span className="group-count">
                        {
                          task.subtasks.filter((t) => t.status === "done")
                            .length
                        }
                        /{task.subtasks.length}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <BadgeSelect
                    value={task.status}
                    colorMap={{
                      not_started: "badge-gray",
                      in_progress: "badge-blue",
                      done: "badge-green",
                      stuck: "badge-red",
                    }}
                    options={TASK_STATUSES}
                    action={(status) => setTaskStatus(task.id, status)}
                    ariaLabel={`Status for ${task.title}`}
                  />
                </td>
                <td>{labelFor(TASK_PRIORITIES, task.priority)}</td>
                <td>{task.assigneeName ?? "Unassigned"}</td>
                <td
                  className={`whitespace-nowrap ${isOverdue(task.dueDate, task.status) ? "text-red" : ""}`}
                >
                  {task.dueDate ? fmtDateUTC(task.dueDate) : "—"}
                </td>
                <td>
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {task.linkedLabel ?? TYPE_LABELS[task.linkedType ?? ""]}
                    </Link>
                  ) : (
                    task.type.replaceAll("_", " ")
                  )}
                </td>
                <td><Link href={`/tasks/${task.id}`} className="btn btn-sm whitespace-nowrap" aria-label={`View details for ${task.title}`}>View details</Link></td>
              </tr>
            );
          })}
        </TableRows>
      </table>
    </div>
  );
}
