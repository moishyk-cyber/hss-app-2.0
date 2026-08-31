"use client";

// Google-Tasks-style row (Aug 31 feedback): a circle checkbox completes the
// task, the title is bold with the notes preview underneath, and due-date /
// priority / assignee / link show as quiet chips rather than loud controls.
// Later feedback (Aug 31, round 3): "instead of having an arrow, I should be
// able to click on it and a pop-up should open" - clicking the row (anywhere
// but the checkbox or the linked-record link) opens TaskModal with everything
// the old inline expansion had, including subtasks.

import { useState } from "react";
import { TASK_PRIORITIES, labelFor } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import { TaskCheckbox } from "./TaskCheckbox";
import TaskModal from "./TaskModal";
import { TYPE_LABELS, linkedHref, isOverdue } from "./lib";

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
  users,
}: {
  task: TaskRowData;
  users: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const done = task.status === "done";
  const overdue = isOverdue(task.dueDate, task.status);
  const hasComments = task.commentCount > 0;
  const doneSubtasks = task.subtasks.filter((s) => s.status === "done").length;
  const linkHref = linkedHref(task.linkedType, task.linkedId);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
      >
        <TaskCheckbox taskId={task.id} done={done} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-semibold ${done ? "text-gray line-through" : "text-ink"}`}>
              {task.title}
            </span>
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
                <span className="badge badge-red">Overdue · {new Date(task.dueDate).toLocaleDateString()}</span>
              ) : (
                <span>{new Date(task.dueDate).toLocaleDateString()}</span>
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
                className="truncate text-blue transition-colors hover:underline"
              >
                {TYPE_LABELS[task.linkedType]}: {task.linkedLabel}
              </a>
            )}
          </div>
        </div>
      </div>

      {open && <TaskModal task={task} users={users} onClose={() => setOpen(false)} />}
    </>
  );
}
