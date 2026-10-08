"use client";

import { useState, type ReactNode } from "react";

/** Keeps server-rendered order cards while making the lane header interactive. */
export function CollapsibleKanbanLane({ label, count, summary, children }: {
  label: string;
  count: number;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`kanban-lane ${collapsed ? "is-collapsed" : ""}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="section-label !mb-0">{label}</h2>
        <div className="lane-summary flex items-center gap-2">
          {!collapsed && summary}
          <span className="badge badge-gray">{count}</span>
          <button type="button" className="lane-collapse" aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
            onClick={() => setCollapsed(value => !value)}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>
      </div>
      {!collapsed && children}
    </div>
  );
}
