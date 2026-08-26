"use client";

import { useState, useSyncExternalStore } from "react";
import { TASK_STATUSES } from "@/lib/constants";
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
  visibleStatuses,
  users,
}: {
  tasks: TaskRowData[];
  visibleStatuses: string[];
  users: { id: string; name: string }[];
}) {
  const [mineOnly, setMineOnly] = useState(false);
  // Reads localStorage without the effect+setState anti-pattern; automatically
  // reconciles the SSR (null) snapshot with the real client value after hydration.
  const salespersonId = useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentityServerSnapshot);

  const hasIdentity = !!salespersonId;
  const applyMine = mineOnly && hasIdentity;
  const visibleTasks = applyMine ? tasks.filter((t) => t.assigneeId === salespersonId) : tasks;

  const grouped = visibleStatuses.map((status) => ({
    status,
    label: TASK_STATUSES.find((s) => s.value === status)?.label ?? status,
    tasks: visibleTasks.filter((t) => t.status === status),
  }));

  return (
    <div className="space-y-8">
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

      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          {applyMine
            ? "No tasks assigned to you right now."
            : "No tasks yet. Use the + button to add one — tasks also get added automatically as orders and customer requests move through fulfillment."}
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.status}>
            <h2 className="section-label flex items-center gap-2">
              {group.label}
              <span className="badge badge-gray">{group.tasks.length}</span>
            </h2>
            {group.tasks.length === 0 ? (
              <div className="empty-state">Nothing here.</div>
            ) : (
              <div className="card card-flush overflow-hidden overflow-x-auto">
                <table className="table-klyne min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Assignee</th>
                      <th>Due</th>
                      <th>Priority</th>
                      <th>Type</th>
                      <th>Linked</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} users={users} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
