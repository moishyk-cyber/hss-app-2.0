"use client";

import { useState, type ReactNode, type ComponentProps } from "react";

/** Keeps server-rendered order cards while making the lane header interactive. */
export function CollapsibleKanbanLane({ label, count, summary, children, className = "", ...props }: {
  label: string;
  count: number;
  summary?: ReactNode;
  children: ReactNode;
} & ComponentProps<"div">) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div {...props} className={`kanban-lane ${collapsed ? "is-collapsed" : ""} ${className}`}>
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
