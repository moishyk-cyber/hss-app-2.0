"use client";
import { BackgroundStatus } from "@/lib/BackgroundStatus";
import { KanbanLaneAmount } from "@/lib/KanbanLaneAmount";
import { CollapsibleKanbanLane } from "@/lib/CollapsibleKanbanLane";
import { useLaneTotal } from "@/lib/CollectionScope";
import { RecordCardBody } from "@/lib/RecordCardBody";
import type { RecordCardDocument } from "@/lib/recordCardDocuments";
import { useOptimistic, useTransition, useState } from "react";
import { LaneItems } from "@/lib/CollectionViews";
import { RFQ_QUEUE_STATUSES } from "./queue-statuses";
import type { PriceCell } from "./RfqRow";
import { useRfqStatusAction } from "@/lib/useRfqStatusAction";
import { useToast } from "@/lib/toast";

type Item = Parameters<typeof PriceCell>[0]["item"] & {
  order: { id: string; title: string } | null;
  opportunity: { id: string; title: string } | null;
};
export function RfqBoard({
  items, cardDetails,
}: {
  items: Item[];
  users: { id: string; name: string }[];
  cardDetails: Record<string, { href: string; companyId: string | null; companyName: string | null; daysOpen: number; documents: RecordCardDocument[] }>;
}) {
  const fullCount=useLaneTotal("rfqStatus");
  const saveStatus = useRfqStatusAction();
  const [savedMoves, setSavedMoves] = useState<Record<string, { base: string; status: string }>>({});
  const savedItems = items.map(item => savedMoves[item.id]?.base === item.rfqStatus ? { ...item, rfqStatus: savedMoves[item.id].status } : item);
  const [cards, move] = useOptimistic(
    savedItems,
    (rows, next: { id: string; status: string }) =>
      rows.map((row) =>
        row.id === next.id ? { ...row, rfqStatus: next.status } : row,
      ),
  );
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const { toast } = useToast();
  async function change(id: string, status: string) {
    move({ id, status });
    const result = await saveStatus(id, status);
    if (result.ok) setSavedMoves(current => ({ ...current, [id]: { base: items.find(item => item.id === id)?.rfqStatus ?? status, status } }));
    if (!result.ok) toast({ kind: "error", message: result.message });
    return result;
  }
  return (
    <div className="space-y-3"><BackgroundStatus active={pending}/>
    <div className="kanban-board" aria-label="RFQ items by status" aria-busy={pending} onDragEnd={() => setTarget(null)}>
      {RFQ_QUEUE_STATUSES.map((stage) => {
        const rows = cards.filter((item) => item.rfqStatus === stage.value);
        return (
          <CollapsibleKanbanLane label={stage.label} count={fullCount(stage.value,rows.length,items.filter(item=>item.rfqStatus===stage.value).length)}
            key={stage.value}
            summary={<KanbanLaneAmount field="rfqStatus" lane={stage.value}
              amount={rows.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0)}
              initialAmount={items.filter(item => item.rfqStatus === stage.value).reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0)} />}
            className={target===stage.value?"is-drop-target":""}
            onDragOver={(e) => {
              e.preventDefault();
              setTarget(stage.value);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setTarget(null);
              const id = e.dataTransfer.getData("text/plain");
              if (rows.some((row) => row.id === id)) return;
              if (cards.some((row) => row.id === id))
                start(async () => {
                  await change(id, stage.value);
                });
            }}
          >
              <LaneItems laneKey={`rfq:${stage.value}`}>
                {rows.map((item) => (
                  <article
                    key={item.id}
                    className="card-sunken card-interactive kanban-card relative cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      if (
                        (e.target as HTMLElement).closest("input,select,button")
                      ) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/plain", item.id);
                    }}
                  >
                    <RecordCardBody id={item.id} type={item.order ? "order" : "opportunity"} {...cardDetails[item.id]} title={item.name} assigneeName={item.assignee?.name ?? null} value={item.order && item.unitPrice != null ? item.unitPrice * item.qty : null} context={{ label: `Qty ${item.qty}${item.order || item.opportunity ? ` · ${item.order?.title ?? item.opportunity?.title}` : ''}`, href: cardDetails[item.id].href }} ballHref={cardDetails[item.id].href} ball={{ step: "pricing", court: "office", holder: item.assignee?.name ?? "Unassigned", hint: `Review supplier quotes for ${item.name}` }} />
                  </article>
                ))}
                {!rows.length && (
                  <p className="py-8 text-center text-xs text-gray-dark">
                    No items in this stage.
                  </p>
                )}
              </LaneItems>
          </CollapsibleKanbanLane>
        );
      })}
    </div></div>
  );
}
