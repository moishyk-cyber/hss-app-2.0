"use client";

// Task detail popup (Aug 31 feedback #3: "instead of having an arrow, I should
// be able to click on it and a pop-up should open"). Replaces the old inline
// row expansion - everything that used to unfold under the row now lives here:
// title, notes, status/priority/assignee/type controls, the linked record,
// the comment thread, and subtasks.

import { useEffect, useRef } from "react";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect } from "@/lib/ui";
import { Avatar } from "@/lib/Avatar";
import { setTaskAssignee, setTaskStatus, setTaskPriority } from "./actions";
import TaskLinkCell from "./TaskLinkCell";
import CommentThread from "./CommentThread";
import { TaskCheckbox } from "./TaskCheckbox";
import { TASK_STATUS_COLORS, TASK_TYPE_LABELS } from "./lib";
import type { TaskRowData } from "./TaskRow";

function SubtaskRow({ task }: { task: TaskRowData }) {
  const done = task.status === "done";
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <TaskCheckbox taskId={task.id} done={done} />
      <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-gray line-through" : "text-ink"}`}>
        {task.title}
      </span>
      <BadgeSelect
        value={task.status}
        options={TASK_STATUSES}
        action={(next) => setTaskStatus(task.id, next)}
        colorMap={TASK_STATUS_COLORS}
      />
    </div>
  );
}

export default function TaskModal({
  task,
  users,
  onClose,
}: {
  task: TaskRowData;
  users: { id: string; name: string }[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const done = task.status === "done";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Lock background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        tabIndex={-1}
        className="card w-full max-w-lg space-y-4 shadow-[var(--shadow-card-hover)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <TaskCheckbox taskId={task.id} done={done} />
            <h2
              id="task-modal-title"
              className={`min-w-0 text-base font-semibold ${done ? "text-gray line-through" : "text-ink"}`}
            >
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray transition-colors hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        {task.notes && <p className="text-sm text-gray-dark">{task.notes}</p>}

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
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
              render={(optimisticValue) => {
                const name = users.find((u) => u.id === optimisticValue)?.name;
                return name ? <Avatar name={name} kind="person" size="sm" /> : null;
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Type
            </span>
            <span className="text-xs text-gray-dark">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
          </label>
        </div>

        <div>
          <span className="field-label">Linked record</span>
          <TaskLinkCell
            taskId={task.id}
            linkedType={task.linkedType}
            linkedId={task.linkedId}
            linkedLabel={task.linkedLabel}
          />
        </div>

        {task.subtasks.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <span className="field-label">Subtasks</span>
            <div className="divide-y divide-border rounded-lg border border-border">
              {task.subtasks.map((sub) => (
                <SubtaskRow key={sub.id} task={sub} />
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <CommentThread taskId={task.id} />
        </div>
      </div>
    </div>
  );
}
