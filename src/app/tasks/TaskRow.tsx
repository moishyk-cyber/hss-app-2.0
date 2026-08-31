"use client";

// Google-Tasks-style row (Aug 31 feedback): a circle checkbox completes the
// task, the title is bold with the notes preview underneath, and due-date /
// priority / assignee / link show as quiet chips rather than loud controls.
// The row expands (same pattern as before) to reveal the full editable
// options and the comment thread.

import { useOptimistic, useState, useTransition } from "react";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS, labelFor } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect } from "@/lib/ui";
import { setTaskAssignee, setTaskStatus, setTaskPriority } from "./actions";
import TaskLinkCell from "./TaskLinkCell";
import CommentThread from "./CommentThread";
import { TASK_STATUS_COLORS, TASK_TYPE_LABELS, TYPE_LABELS, linkedHref, isOverdue } from "./lib";

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

/** The checkbox IS the done/not-done toggle - unchecking sends it back to Not Started. */
function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimisticDone}
      aria-label={optimisticDone ? "Mark task not done" : "Mark task done"}
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        const next = !optimisticDone;
        startTransition(async () => {
          setOptimisticDone(next);
          await setTaskStatus(taskId, next ? "done" : "not_started");
        });
      }}
      className={
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] leading-none transition-colors " +
        (optimisticDone
          ? "border-green bg-green text-white"
          : "border-border text-transparent hover:border-primary")
      }
    >
      ✓
    </button>
  );
}

export default function TaskRow({
  task,
  users,
  indent = false,
}: {
  task: TaskRowData;
  users: { id: string; name: string }[];
  indent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = task.status === "done";
  const overdue = isOverdue(task.dueDate, task.status);
  const hasComments = task.commentCount > 0;
  const linkHref = linkedHref(task.linkedType, task.linkedId);

  return (
    <>
      <div className={`flex items-start gap-3 px-4 py-2.5 ${indent ? "pl-10" : ""}`}>
        <TaskCheckbox taskId={task.id} done={done} />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-semibold ${done ? "text-gray line-through" : "text-ink"}`}>
              {task.title}
            </span>
            {hasComments && <span className="badge badge-gray shrink-0 text-[10px]">{task.commentCount}</span>}
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
            <span>{task.assigneeName ?? "Unassigned"}</span>
            {linkHref && task.linkedType && (
              <span className="truncate">
                {TYPE_LABELS[task.linkedType]}: {task.linkedLabel}
              </span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray transition-colors hover:bg-hover hover:text-ink"
          aria-label={expanded ? "Collapse task" : "Expand task"}
          aria-expanded={expanded}
        >
          <span className={`inline-block text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        </button>
      </div>

      {expanded && (
        <div className={`space-y-3 border-t border-border bg-panel/40 px-4 py-3 ${indent ? "pl-10" : ""}`}>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Status
              </span>
              <BadgeSelect
                value={task.status}
                options={TASK_STATUSES}
                action={(next) => setTaskStatus(task.id, next)}
                colorMap={TASK_STATUS_COLORS}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Priority
              </span>
              <BadgeSelect
                value={task.priority}
                options={TASK_PRIORITIES}
                action={(next) => setTaskPriority(task.id, next)}
                colorMap={TASK_PRIORITY_COLORS}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Assignee
              </span>
              <OptimisticSelect
                value={task.assigneeId ?? ""}
                options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                action={(next) => setTaskAssignee(task.id, next)}
                className="input-klyne px-1.5 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Type
              </span>
              <span className="text-xs text-gray-dark">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Linked
              </span>
              <TaskLinkCell
                taskId={task.id}
                linkedType={task.linkedType}
                linkedId={task.linkedId}
                linkedLabel={task.linkedLabel}
              />
            </label>
          </div>

          <CommentThread taskId={task.id} />
        </div>
      )}

      {task.subtasks.map((sub) => (
        <TaskRow key={sub.id} task={sub} users={users} indent />
      ))}
    </>
  );
}
