// Ball-in-court badge: "Ball: Office · Pricing" in the court's color. Server-
// renderable (no client JS) - drop it into list rows, kanban cards and headers.

import { COURTS, COURT_COLORS, FLOW_STEPS, type Ball } from "@/lib/ballInCourt";

export function BallInCourtBadge({ ball, className = "", compact = false }: { ball: Ball; className?: string; compact?: boolean }) {
  if (!ball.step || !ball.court) {
    // Nothing pending (complete / lost) - a neutral pill with the state.
    return <span className={`badge badge-gray ${compact ? "kanban-card-ball" : ""} ${className}`.trim()}>{ball.hint}</span>;
  }
  const label = FLOW_STEPS.find((s) => s.key === ball.step)?.label ?? ball.step;
  const holder = ball.holder ?? COURTS[ball.court];
  if (compact) {
    return (
      <span className={`badge ${COURT_COLORS[ball.court]} kanban-card-ball ${className}`.trim()}
        title={`Ball: ${holder} · ${label} — ${ball.hint}`}>
        <span className="kanban-ball-holder">Ball: {holder}</span>
        <span className="kanban-ball-step">· {label}</span>
      </span>
    );
  }
  return (
    <span className={`badge ${COURT_COLORS[ball.court]} ${className}`.trim()} title={ball.hint}>
      <span className="min-w-0 truncate">
        Ball: {holder} · {label}
      </span>
    </span>
  );
}
