import { RecordCardBody } from "@/lib/RecordCardBody";
import { KanbanLaneAmount } from "@/lib/KanbanLaneAmount";
import { LaneItems } from "@/lib/CollectionViews";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { ORDER_PHASES } from "@/lib/constants";
import type { Ball } from "@/lib/ballInCourt";

/**
 * One order on the board. Everything is resolved server-side - the board is
 * deliberately read-only, so unlike the pipeline's KanbanBoard there is no
 * drag handlers or optimistic order state here. Only lane collapse is interactive.
 *
 * Why read-only: an order's status is computed by deriveOrderStatus() from its
 * payments, POs and deliveries every time one of them changes. A dragged card
 * would be silently recomputed back on the next payment or delivery, so the
 * board reports the flow rather than driving it. Orders move columns when you
 * record a payment, send a PO or schedule a delivery.
 */
export type OrderCard = {
  documents: import("@/lib/recordCardDocuments").RecordCardDocument[];
  id: string;
  href: string;
  title: string;
  /** ORDER_PHASES value - which column. Derived by orderPhase() (@/lib/flowRules). */
  phase: string;
  /** The precise order status, used for lane summaries. */
  status: string;
  companyId: string | null;
  companyName: string | null;
  ownerName: string | null;
  daysOpen: number;
  value: number | null;
  neededByDate: Date | null;
  paymentStatus: "none" | "pending" | "paid";
  /** "3/5 delivered · 1 pricing" - the same phrase the list rows carry. */
  itemSummary: string | null;
  ball: Ball;
};

/** Why a column is empty, in the language of what feeds it. */
const EMPTY_HINT: Record<string, string> = {
  pos: "Nothing here - orders arrive once the deposit is paid.",
  delivery: "Nothing here - orders arrive once a PO ships or a delivery is scheduled.",
  service: "Delivered orders appear here until close out is complete.",
};

export function OrdersKanbanBoard({ cards }: { cards: OrderCard[] }) {
  return (
    <div className="kanban-board">
      {ORDER_PHASES.map((phase) => {
        const columnCards = cards.filter((c) => c.phase === phase.value);
        const total = columnCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const stuckCount = columnCards.filter((c) => c.status === "stuck").length;

        // Three columns, so they share the width (flex-1) rather than taking the
        // pipeline's fixed w-72 and running off the right edge. The min-width
        // keeps them readable and hands the row back to overflow-x-auto once
        // the screen is too narrow to share.
        return (
          <CollapsibleKanbanLane key={phase.value} label={phase.label} count={columnCards.length} totalField="phase" totalValue={phase.value}
            summary={<>
                {stuckCount > 0 ? (
                  <span className="badge badge-red" title={`${stuckCount} stuck`}>
                    {stuckCount} stuck
                  </span>
                ) : null}
                <KanbanLaneAmount field="phase" lane={phase.value} amount={total} />
            </>}>

            <LaneItems laneKey={`orders:${phase.value}`}>
              {columnCards.map((card) => {
                return (
                  <article
                    key={card.id}
                    className="card-sunken card-interactive kanban-card relative"
                  >
                    <RecordCardBody documents={card.documents} id={card.id} type="order" href={card.href} title={card.title} companyId={card.companyId} companyName={card.companyName} assigneeName={card.ownerName} value={card.value} daysOpen={card.daysOpen} ball={card.ball} />

                  </article>
                );
              })}

              {columnCards.length === 0 ? (
                <p className="px-1 py-10 text-center text-xs leading-relaxed text-gray">
                  {EMPTY_HINT[phase.value]}
                </p>
              ) : null}
            </LaneItems>
          </CollapsibleKanbanLane>
        );
      })}
    </div>
  );
}
