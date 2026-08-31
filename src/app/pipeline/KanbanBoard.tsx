"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { STAGE_COLORS } from "@/lib/constants";
import type { ActionResult } from "@/lib/actionResult";
import { BadgeSelect } from "@/lib/ui";
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
    <div className="flex gap-3 overflow-x-auto pb-4">
      {openStages.map((stage, stageIndex) => {
        const columnCards = optimisticCards.filter((c) => c.stage === stage.value);
        const total = columnCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const isDropTarget = dragOverStage === stage.value;

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
            className={`card flex w-72 shrink-0 flex-col transition-colors ${
              isDropTarget ? "bg-hover ring-2 ring-primary" : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="section-label !mb-0">{stage.label}</h2>
              <div className="flex items-center gap-2">
                {total > 0 ? (
                  <span className="text-xs tabular-nums text-gray">{money(total)}</span>
                ) : null}
                <span className="badge badge-gray">{columnCards.length}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {columnCards.map((card) => (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    // Let the stage picker keep its own mouse behaviour.
                    if ((e.target as HTMLElement).closest("select")) {
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
                  className={`card-sunken card-interactive cursor-grab active:cursor-grabbing ${
                    draggingId === card.id ? "opacity-50" : ""
                  }`}
                >
                  <Link
                    href={`/pipeline/${card.id}`}
                    draggable={false}
                    className="block text-[13px] font-medium leading-snug text-ink hover:underline"
                  >
                    {card.title}
                  </Link>
                  <div className="mt-1.5 truncate text-xs text-gray">
                    {card.companyName ?? <span className="empty-value">no company</span>}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-medium tabular-nums text-ink">
                      {money(card.value) ?? <span className="empty-value">no value</span>}
                    </span>
                    <span className="text-gray">{card.daysInStage}d in stage</span>
                  </div>

                  {card.followUpLabel ? (
                    <div className="mt-3">
                      <span
                        className={`badge ${card.followUpOverdue ? "badge-orange" : "badge-gray"}`}
                      >
                        {card.followUpOverdue ? "Follow up overdue" : "Follow up"} ·{" "}
                        {card.followUpLabel}
                      </span>
                    </div>
                  ) : null}

                  {/* Keyboard/no-drag alternative - moves the card optimistically too. */}
                  <div className="mt-3">
                    <BadgeSelect
                      value={card.stage}
                      options={stageOptions(card.stage)}
                      colorMap={STAGE_COLORS}
                      action={(next) => move(card.id, next)}
                    />
                  </div>
                </article>
              ))}

              {columnCards.length === 0 ? (
                <p className="px-1 py-10 text-center text-xs leading-relaxed text-gray">
                  {isDropTarget ? (
                    <span className="font-medium text-ink">Drop to move here</span>
                  ) : stageIndex === 0 ? (
                    <>
                      Deals land here from{" "}
                      <Link href="/intake" className="text-primary transition-colors hover:underline">
                        Intake
                      </Link>
                      .
                    </>
                  ) : (
                    <>Nothing here - deals arrive from {openStages[stageIndex - 1].label}.</>
                  )}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
