"use client";

// Task record content: immediate field edits, related records, subtasks, and comments.

import Link from "next/link";
import { fmtDateUTC } from "@/lib/dates";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLORS } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
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
      <TaskCheckbox taskId={task.id} done={done} undoStatus={task.status} />
      <Link href={`/tasks/${task.id}`} className={`min-w-0 flex-1 truncate text-sm ${done ? "text-gray line-through" : "text-ink"}`}>
        {task.title}
      </Link>
      <BadgeSelect
        value={task.status}
        options={TASK_STATUSES}
        action={(next) => setTaskStatus(task.id, next)}
        colorMap={TASK_STATUS_COLORS}
      />
    </div>
  );
}

export default function TaskDetail({
  task,
  users,
}: {
  task: TaskRowData;
  users: { id: string; name: string }[];
}) {

  return (
    <div className="card space-y-6">


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
              ariaLabel="Change task status"
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
              ariaLabel="Change task priority"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Assignee
            </span>
            <UserSelect
              value={task.assigneeId ?? ""}
              users={users}
              action={(next) => setTaskAssignee(task.id, next)}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="field-label" style={{ marginBottom: 0 }}>
              Type
            </span>
            <span className="text-xs text-gray-dark">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
          </label>
        </div>

        <div><span className="field-label">Due date</span><span className="text-sm text-gray-dark">{task.dueDate ? fmtDateUTC(task.dueDate) : "Not set"}</span></div>

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
  );
}
