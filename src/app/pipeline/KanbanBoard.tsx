"use client";
import { LaneItems } from "@/lib/CollectionViews";

import Link from "@/lib/IntentLink";
import { useOptimistic, useState, useTransition } from "react";
import { STAGE_COLORS } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import type { ActionResult } from "@/lib/actionResult";
import { BadgeSelect } from "@/lib/ui";
import type { Ball } from "@/lib/ballInCourt";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { changeOpportunityStage } from "./actions";
import { CLOSED_STAGES, OPEN_STAGES, stageOptions } from "./_ui";

export type KanbanCard = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  companyName: string | null;
  daysInStage: number;
  /** Preformatted on the server so the client does no date maths. */
  followUpLabel: string | null;
  followUpOverdue: boolean;
  /** Computed server-side - who holds the ball and what's next. */
  ball: Ball;
};

const DRAG_MIME = "text/plain";

/** Mirrors the server-side rejection in changeOpportunityStage. */
const CLOSED_STAGE_MESSAGE =
  "Use Mark Won / Mark Lost on the deal page - they create the order and payment.";

function money(amount: number | null): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function KanbanBoard({ cards }: { cards: KanbanCard[] }) {
  // The card jumps columns the moment it is dropped; the server catches up after.
  const [optimisticCards, applyMove] = useOptimistic(
    cards,
    (state: KanbanCard[], move: { id: string; stage: string }) =>
      state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c))
  );
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  /**
   * Must be called from inside a transition (applyMove is an optimistic update).
   * Returns the action's result so the picker can surface a rejection inline.
   */
  async function move(id: string, stage: string): Promise<ActionResult | void> {
    const card = optimisticCards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    // Won/Lost have no column to drop into, but a picker could still offer them on
    // an already-closed card - never let either reach the plain stage write.
    if (CLOSED_STAGES.includes(stage)) return { ok: false, message: CLOSED_STAGE_MESSAGE };
    applyMove({ id, stage });
    return changeOpportunityStage(id, stage);
  }

  /** Drop handler - outside React's event transition, so it opens its own. */
  function moveByDrag(id: string, stage: string) {
    startTransition(async () => {
      await move(id, stage);
    });
  }

  // Only open stages get a column: there is no Won/Lost column to drag into, because
  // closing a deal has to run Mark Won / Mark Lost and their side effects.
  const openStages = OPEN_STAGES;

  return (
    <div className="kanban-board">
      {openStages.map((stage) => {
        const columnCards = optimisticCards.filter((c) => c.stage === stage.value);
        const total = columnCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const isDropTarget = dragOverStage === stage.value;
        const isCollapsed = collapsed.includes(stage.value);

        return (
          <div
            key={stage.value}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverStage !== stage.value) setDragOverStage(stage.value);
            }}
            onDragLeave={(e) => {
              // Ignore bubbling from children still inside the column.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragOverStage((s) => (s === stage.value ? null : s));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData(DRAG_MIME);
              setDragOverStage(null);
              setDraggingId(null);
              if (id) moveByDrag(id, stage.value);
            }}
            className={`kanban-lane transition-colors ${isCollapsed ? "is-collapsed" : ""} ${
              isDropTarget ? "bg-hover ring-2 ring-primary" : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="section-label !mb-0">{stage.label}</h2>
              <div className="lane-summary flex items-center gap-2">
                {!isCollapsed && total > 0 ? (
                  <span className="text-xs tabular-nums text-gray">{money(total)}</span>
                ) : null}
                <span className="badge badge-gray">{columnCards.length}</span>
                <button
                  type="button"
                  className="lane-collapse"
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${stage.label}`}
                  onClick={() => setCollapsed(current => isCollapsed
                    ? current.filter(value => value !== stage.value)
                    : [...current, stage.value])}
                >
                  {isCollapsed ? "›" : "‹"}
                </button>
              </div>
            </div>

            {!isCollapsed && <LaneItems laneKey={`pipeline:${stage.value}`}>
              {columnCards.map((card) => (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    // Let the stage picker keep its own mouse behaviour.
                    if ((e.target as HTMLElement).closest("input,select,button")) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(DRAG_MIME, card.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(card.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStage(null);
                  }}
                  className={`card-sunken card-interactive kanban-card relative cursor-grab active:cursor-grabbing ${
                    draggingId === card.id ? "opacity-50" : ""
                  }`}
                >
                  {/*
                    Stretched link (same pattern as PipelineList rows): the whole card
                    opens the deal, not just the title text. The stage pill below sits
                    above it (relative z-10) so clicking the pill still changes stage.
                    draggable={false} on the link means a mouse-down anywhere on it -
                    pseudo-element included - falls through to the draggable article.
                  */}
                  <Link
                    href={`/pipeline/${card.id}`}
                    title={card.title}
                    draggable={false}
                    className="kanban-card-title block text-ink hover:underline after:absolute after:inset-0 after:content-['']"
                  >
                    {card.title}
                  </Link>
                  {/* Square avatar for the business, matching the directory rows. */}
                  <div className="kanban-card-company flex items-center gap-2 text-xs text-gray">
                    {card.companyName ? (
                      <>
                        <Avatar name={card.companyName} kind="business" size="sm" />
                        <span className="min-w-0 truncate" title={card.companyName}>{card.companyName}</span>
                      </>
                    ) : (
                      <span className="empty-value">no company</span>
                    )}
                  </div>

                  <div className="kanban-card-facts flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium tabular-nums text-ink">
                      {money(card.value) ?? <span className="empty-value">no value</span>}
                    </span>
                    <span className="text-gray">{card.daysInStage}d in stage</span>
                  </div>

                  <div className="kanban-card-handoff">
                    <BallInCourtBadge ball={card.ball} compact />
                  </div>

                  {card.followUpLabel ? (
                    <div className="kanban-card-note">
                      <span
                        className={`badge ${card.followUpOverdue ? "badge-orange" : "badge-gray"}`}
                      >
                        {card.followUpOverdue ? "Follow up overdue" : "Follow up"} ·{" "}
                        {card.followUpLabel}
                      </span>
                    </div>
                  ) : null}

                  {/* Keyboard/no-drag alternative - moves the card optimistically too. */}
                  <div className="kanban-card-footer relative z-10 w-fit max-w-full">
                    <BadgeSelect
                      value={card.stage}
                      options={stageOptions(card.stage)}
                      colorMap={STAGE_COLORS}
                      ariaLabel={`Change stage for ${card.title}`}
                      action={(next) => move(card.id, next)}
                    />
                  </div>
                </article>
              ))}

            </LaneItems>}
          </div>
        );
      })}
    </div>
  );
}
