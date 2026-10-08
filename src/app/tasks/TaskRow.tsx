"use client";

import Link from "@/lib/IntentLink";

// Compact task row with a full-page record link and independent completion control.

import { TASK_PRIORITIES, labelFor } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { TaskCheckbox } from "./TaskCheckbox";
import { TYPE_LABELS, linkedHref, isOverdue } from "./lib";
import { fmtDateUTC } from "@/lib/dates";

export type TaskRowData = {
  id: string;
  title: string;
  notes: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  status: string;
  priority: string;
  type: string;
  linkedType: string | null;
  linkedId: string | null;
  linkedLabel: string | null;
  commentCount: number;
  subtasks: TaskRowData[];
};

export default function TaskRow({
  task,
}: {
  task: TaskRowData;
  users: { id: string; name: string }[];
}) {
  const done = task.status === "done";
  const overdue = isOverdue(task.dueDate, task.status);
  const hasComments = task.commentCount > 0;
  const doneSubtasks = task.subtasks.filter((s) => s.status === "done").length;
  const linkHref = linkedHref(task.linkedType, task.linkedId);

  return (
    <>
      <div
        className="relative flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
      >
        <span className="relative z-10"><TaskCheckbox taskId={task.id} done={done} undoStatus={task.status} /></span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/tasks/${task.id}`} className={`truncate text-sm font-semibold after:absolute after:inset-0 ${done ? "text-gray line-through" : "text-ink"}`}>
              {task.title}
            </Link>
            {hasComments && <span className="badge badge-gray shrink-0 text-[10px]">{task.commentCount}</span>}
            {task.subtasks.length > 0 && (
              <span className="badge badge-gray shrink-0 text-[10px]">
                {doneSubtasks}/{task.subtasks.length}
              </span>
            )}
          </div>
          {task.notes && <div className="mt-0.5 truncate text-xs text-gray">{task.notes}</div>}

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray">
            {task.dueDate &&
              (overdue ? (
                <span className="badge badge-red">Overdue · {fmtDateUTC(task.dueDate)}</span>
              ) : (
                <span>{fmtDateUTC(task.dueDate)}</span>
              ))}
            <span className="capitalize">{labelFor(TASK_PRIORITIES, task.priority)}</span>
            {task.assigneeName ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={task.assigneeName} kind="person" size="sm" />
                {task.assigneeName}
              </span>
            ) : (
              <span>Unassigned</span>
            )}
            {linkHref && task.linkedType && (
              <a
                href={linkHref}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 truncate text-blue transition-colors hover:underline"
              >
                {TYPE_LABELS[task.linkedType]}: {task.linkedLabel}
              </a>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
