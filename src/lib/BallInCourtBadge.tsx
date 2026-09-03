// Ball-in-court badge: "Ball: Office · Pricing" in the court's color. Server-
// renderable (no client JS) - drop it into list rows, kanban cards and headers.

import { COURTS, COURT_COLORS, FLOW_STEPS, type Ball } from "@/lib/ballInCourt";

export function BallInCourtBadge({ ball, className = "" }: { ball: Ball; className?: string }) {
  if (!ball.step || !ball.court) {
    // Nothing pending (complete / lost) - a neutral pill with the state.
    return <span className={`badge badge-gray ${className}`.trim()}>{ball.hint}</span>;
  }
  const label = FLOW_STEPS.find((s) => s.key === ball.step)?.label ?? ball.step;
  return (
    <span className={`badge ${COURT_COLORS[ball.court]} ${className}`.trim()} title={ball.hint}>
      Ball: {COURTS[ball.court]} · {label}
    </span>
  );
}
