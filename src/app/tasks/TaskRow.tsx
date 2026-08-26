"use client";

import { useState } from "react";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { setTaskStatus, setTaskPriority } from "./actions";
import TaskLinkCell from "./TaskLinkCell";
import CommentThread from "./CommentThread";
import { TASK_STATUS_COLORS, TASK_TYPE_LABELS, isOverdue } from "./lib";

export type TaskRowData = {
  id: string;
  title: string;
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

export default function TaskRow({ task, indent = false }: { task: TaskRowData; indent?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(task.dueDate, task.status);
  const hasComments = task.commentCount > 0;

  return (
    <>
      <tr className="transition-colors">
        <td>
          <div className={`flex items-center gap-1.5 ${indent ? "pl-6" : ""}`}>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray transition-colors hover:bg-hover hover:text-ink"
              aria-label={expanded ? "Collapse comments" : "Expand comments"}
              aria-expanded={expanded}
            >
              <span className={`inline-block text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
            </button>
            <span className={indent ? "text-gray-dark" : "font-medium text-ink"}>
              {indent ? "↳ " : ""}
              {task.title}
            </span>
            {hasComments && <span className="badge badge-gray text-[10px]">{task.commentCount}</span>}
          </div>
        </td>
        <td className="text-gray-dark">{task.assigneeName ?? "—"}</td>
        <td className={overdue ? "font-semibold text-red" : "text-gray-dark"}>
          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
        </td>
        <td>
          <BadgeSelect
            value={task.priority}
            options={TASK_PRIORITIES}
            action={(next) => setTaskPriority(task.id, next)}
            colorMap={TASK_PRIORITY_COLORS}
          />
        </td>
        <td className="text-gray-dark">{TASK_TYPE_LABELS[task.type] ?? task.type}</td>
        <td>
          <TaskLinkCell
            taskId={task.id}
            linkedType={task.linkedType}
            linkedId={task.linkedId}
            linkedLabel={task.linkedLabel}
          />
        </td>
        <td>
          <BadgeSelect
            value={task.status}
            options={TASK_STATUSES}
            action={(next) => setTaskStatus(task.id, next)}
            colorMap={TASK_STATUS_COLORS}
          />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-panel/40 p-3">
            <CommentThread taskId={task.id} />
          </td>
        </tr>
      )}
      {task.subtasks.map((sub) => (
        <TaskRow key={sub.id} task={sub} indent />
      ))}
    </>
  );
}
