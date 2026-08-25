"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { OPPORTUNITY_STAGES, STAGE_COLORS } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { changeOpportunityStage } from "./actions";

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

const CLOSED_STAGES = ["won", "lost"];
const DRAG_MIME = "text/plain";

function money(amount: number | null): string {
  if (amount == null) return "—";
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

  function move(id: string, stage: string) {
    const card = optimisticCards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    startTransition(async () => {
      applyMove({ id, stage });
      await changeOpportunityStage(id, stage);
    });
  }

  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s.value));

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
              if (id) move(id, stage.value);
            }}
            className={`card flex w-72 shrink-0 flex-col transition-colors ${
              isDropTarget ? "bg-accent-soft ring-2 ring-accent" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
              <h2 className="section-label">{stage.label}</h2>
              <div className="flex items-center gap-2">
                {total > 0 ? <span className="text-xs text-gray">{money(total)}</span> : null}
                <span className="badge badge-gray">{columnCards.length}</span>
              </div>
            </div>

            <div className="flex-1 space-y-2 p-3">
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
                  className={`cursor-grab rounded-[10px] border border-border bg-surface p-3 transition-shadow active:cursor-grabbing hover:shadow-[0_2px_8px_rgba(28,33,32,0.08)] ${
                    draggingId === card.id ? "opacity-50" : ""
                  }`}
                >
                  <Link
                    href={`/pipeline/${card.id}`}
                    draggable={false}
                    className="block text-[13px] font-medium text-ink transition-colors hover:text-accent"
                  >
                    {card.title}
                  </Link>
                  <div className="mt-1 truncate text-xs text-gray">
                    {card.companyName ?? "No company"}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{money(card.value)}</span>
                    <span className="text-gray">{card.daysInStage}d in stage</span>
                  </div>

                  {card.followUpLabel ? (
                    <div className="mt-2">
                      <span
                        className={`badge ${card.followUpOverdue ? "badge-orange" : "badge-gray"}`}
                      >
                        {card.followUpOverdue ? "Follow up overdue" : "Follow up"} ·{" "}
                        {card.followUpLabel}
                      </span>
                    </div>
                  ) : null}

                  {/* Keyboard/no-drag alternative — moves the card optimistically too. */}
                  <div className="mt-2.5">
                    <BadgeSelect
                      value={card.stage}
                      options={OPPORTUNITY_STAGES}
                      colorMap={STAGE_COLORS}
                      action={async (next) => {
                        move(card.id, next);
                      }}
                    />
                  </div>
                </article>
              ))}

              {columnCards.length === 0 ? (
                <p className="px-1 py-8 text-center text-xs leading-relaxed text-gray">
                  {isDropTarget ? (
                    <span className="font-medium text-accent">Drop to move here</span>
                  ) : stageIndex === 0 ? (
                    <>
                      Deals land here from{" "}
                      <Link href="/intake" className="text-accent transition-colors hover:underline">
                        Intake
                      </Link>
                      .
                    </>
                  ) : (
                    <>Nothing here — deals arrive from {openStages[stageIndex - 1].label}.</>
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
