export function ToolbarIcon({ name }: { name: "table" | "kanban" | "filter" | "search" | "plus" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === "table" && <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>}
      {name === "kanban" && <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7v7M12 7v10M16 7v5" /></>}
      {name === "filter" && <><path d="M4 7h16M7 12h10M10 17h4" /></>}
      {name === "search" && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
    </svg>
  );
}
