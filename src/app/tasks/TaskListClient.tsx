"use client";

import { useState, useSyncExternalStore } from "react";
import { TASK_STATUSES, labelFor } from "@/lib/constants";
import TaskRow, { type TaskRowData } from "./TaskRow";

const IDENTITY_KEY = "hss.salespersonId";

function subscribeIdentity(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getIdentitySnapshot() {
  return window.localStorage.getItem(IDENTITY_KEY);
}
function getIdentityServerSnapshot() {
  return null;
}

export default function TaskListClient({
  tasks,
  statusFilter,
  users,
}: {
  tasks: TaskRowData[];
  /** A specific status chip selected up top (e.g. "in_progress"), or null for "All". */
  statusFilter: string | null;
  users: { id: string; name: string }[];
}) {
  const [mineOnly, setMineOnly] = useState(false);
  // Google Tasks-style: completed items collapse out of the way, expanded on click.
  // Filtering straight to "Done" up top is the one case where seeing them right
  // away makes more sense than making the user open the section themselves.
  const [showCompleted, setShowCompleted] = useState(statusFilter === "done");
  // Reads localStorage without the effect+setState anti-pattern; automatically
  // reconciles the SSR (null) snapshot with the real client value after hydration.
  const salespersonId = useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentityServerSnapshot);

  const hasIdentity = !!salespersonId;
  const applyMine = mineOnly && hasIdentity;

  const filtered = tasks
    .filter((t) => (applyMine ? t.assigneeId === salespersonId : true))
    .filter((t) => (statusFilter ? t.status === statusFilter : true));

  const activeTasks = filtered.filter((t) => t.status !== "done");
  const completedTasks = filtered.filter((t) => t.status === "done");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!hasIdentity && (
          <span id="mine-tasks-hint" className="text-xs text-gray">
            Pick yourself once in any assignee field
          </span>
        )}
        <button type="button" className={!mineOnly ? "chip chip-active" : "chip"} onClick={() => setMineOnly(false)}>
          All tasks
        </button>
        <button
          type="button"
          className={mineOnly ? "chip chip-active" : "chip"}
          title={!hasIdentity ? "Pick yourself once in any assignee field" : undefined}
          aria-describedby={!hasIdentity ? "mine-tasks-hint" : undefined}
          onClick={() => setMineOnly(true)}
        >
          My tasks
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          {applyMine
            ? "No tasks assigned to you right now."
            : "No tasks yet. Add one above — tasks also get added automatically as orders and customer requests move through fulfillment."}
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          {activeTasks.length === 0 ? (
            <div className="p-5">
              <div className="empty-state">
                {statusFilter
                  ? `Nothing ${labelFor(TASK_STATUSES, statusFilter).toLowerCase()} right now.`
                  : "Nothing active — everything's done."}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeTasks.map((task) => (
                <TaskRow key={task.id} task={task} users={users} />
              ))}
            </div>
          )}
        </div>
      )}

      {completedTasks.length > 0 && (
        <div className="card card-flush overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCompleted((s) => !s)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-hover"
            aria-expanded={showCompleted}
          >
            <span className="section-label !mb-0 flex items-center gap-2">
              Completed
              <span className="badge badge-gray">{completedTasks.length}</span>
            </span>
            <span className={`text-gray transition-transform ${showCompleted ? "rotate-180" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          {showCompleted && (
            <div className="divide-y divide-border border-t border-border">
              {completedTasks.map((task) => (
                <TaskRow key={task.id} task={task} users={users} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
