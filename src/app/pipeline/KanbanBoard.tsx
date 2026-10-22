"use client";
import { RecordCardBody } from "@/lib/RecordCardBody";
import { KanbanLaneAmount } from "@/lib/KanbanLaneAmount";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { BackgroundStatus } from "@/lib/BackgroundStatus";
import { useLaneTotal } from "@/lib/CollectionScope";
import { LaneItems } from "@/lib/CollectionViews";

import { useOptimistic, useState, useTransition } from "react";
import { INTAKE_WORKFLOW_STEPS, type PipelineCardStep, canAdvancePipelineCard } from "@/lib/pipelineWorkflow";
import { usePipelineWorkflowMove } from "./WorkflowMove";
import type { ActionResult } from "@/lib/actionResult";
import type { Ball } from "@/lib/ballInCourt";

export type KanbanCard = {
  documents: import("@/lib/recordCardDocuments").RecordCardDocument[];
  id: string;
  title: string;
  stage: string;
  workflowStep: string;
  workflow: PipelineCardStep[];
  termsSet: boolean;
  salesOrderSent: boolean;
  href: string;
  value: number | null;
  companyId: string | null;
  companyName: string | null;
  assigneeName: string | null;
  fileType: "opportunity" | "order";
  daysInStage: number;
  /** Preformatted on the server so the client does no date maths. */
  followUpLabel: string | null;
  followUpOverdue: boolean;
  /** Computed server-side - who holds the ball and what's next. */
  ball: Ball;
};

const DRAG_MIME = "text/plain";

export function KanbanBoard({ cards }: { cards: KanbanCard[] }) {
  const fullCount=useLaneTotal("workflowStep");
  const { move: checkMove, dialog } = usePipelineWorkflowMove();
  // A move is shown only after the server confirms the saved prerequisites.
  const [optimisticCards, applyMove] = useOptimistic(
    cards,
    (state: KanbanCard[], move: { id: string; stage: string }) =>
      state.map((c) => (c.id === move.id ? { ...c, workflowStep: move.stage } : c))
  );
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  /**
   * Must be called from inside a transition (applyMove is an optimistic update).
   * Returns the action's result so the picker can surface a rejection inline.
   */
  async function move(id: string, stage: string): Promise<ActionResult | void> {
    const card = optimisticCards.find((c) => c.id === id);
    if (!card || !canAdvancePipelineCard(card.workflowStep, stage)) return;
    const result = await checkMove(id, stage);
    if (result.ok) applyMove({ id, stage });
    return result;
  }

  /** Drop handler - outside React's event transition, so it opens its own. */
  function moveByDrag(id: string, stage: string) {
    startTransition(async () => {
      await move(id, stage);
    });
  }

  const openStages = INTAKE_WORKFLOW_STEPS.map(step => ({ value: step.key, label: step.label }));

  return (
    <div className="space-y-3"><BackgroundStatus active={pending} label="Checking requirements…"/>
    <div className="kanban-board">
      {openStages.map((stage) => {
        const columnCards = optimisticCards.filter((c) => c.workflowStep === stage.value);
        const total = columnCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const isDropTarget = dragOverStage === stage.value;

        return (
          <CollapsibleKanbanLane
            key={stage.value}
            label={stage.label}
            count={fullCount(stage.value, columnCards.length, cards.filter(card => card.workflowStep === stage.value).length)}
            summary={<KanbanLaneAmount field="workflowStep" lane={stage.value} amount={total}
              initialAmount={cards.filter(card => card.workflowStep === stage.value).reduce((sum, card) => sum + (card.value ?? 0), 0)} />}
            onDragOver={(e) => {
              if (!draggingId || !canAdvancePipelineCard(optimisticCards.find(card => card.id === draggingId)?.workflowStep ?? "", stage.value)) {
                e.dataTransfer.dropEffect = "none";
                return;
              }
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
            className={`transition-colors ${isDropTarget ? "is-drop-target" : ""}`}
          >
            <LaneItems laneKey={`pipeline:${stage.value}`}>
              {columnCards.map((card) => (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    // Let file buttons keep their own mouse behaviour.
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
                  <RecordCardBody documents={card.documents} id={card.id} type={card.fileType} href={card.href} title={card.title} companyId={card.companyId} companyName={card.companyName} assigneeName={card.assigneeName} value={card.value} daysOpen={card.daysInStage} ball={card.ball} />

                </article>
              ))}

            </LaneItems>
          </CollapsibleKanbanLane>
        );
      })}
    </div>{dialog}</div>
  );
}
