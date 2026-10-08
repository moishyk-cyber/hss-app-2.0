"use client";
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { LaneItems } from "@/lib/CollectionViews";
import { BadgeSelect } from "@/lib/ui";
import { RFQ_STATUS_COLORS } from "@/lib/constants";
import { RFQ_QUEUE_STATUSES } from "./queue-statuses";
import { PriceCell } from "./RfqRow";
import { setLineItemRfqStatus } from "./actions";
import { useToast } from "@/lib/toast";

type Item = Parameters<typeof PriceCell>[0]["item"] & {
  order: { id: string; title: string } | null;
  opportunity: { id: string; title: string } | null;
};
export function RfqBoard({
  items,
}: {
  items: Item[];
  users: { id: string; name: string }[];
}) {
  const [cards, move] = useOptimistic(
    items,
    (rows, next: { id: string; status: string }) =>
      rows.map((row) =>
        row.id === next.id ? { ...row, rfqStatus: next.status } : row,
      ),
  );
  const [, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  async function change(id: string, status: string) {
    move({ id, status });
    const result = await setLineItemRfqStatus(id, status);
    if (!result.ok) toast({ kind: "error", message: result.message });
    return result;
  }
  return (
    <div className="kanban-board" onDragEnd={() => setTarget(null)}>
      {RFQ_QUEUE_STATUSES.map((stage) => {
        const rows = cards.filter((item) => item.rfqStatus === stage.value);
        return (
          <section
            key={stage.value}
            className={`kanban-lane ${collapsed.includes(stage.value) ? "is-collapsed" : ""} ${target === stage.value ? "ring-2 ring-primary" : ""}`}
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
            <div className="flex items-center justify-between">
              <h2 className="section-label !mb-0">{stage.label}</h2>
              <span className="group-count">{rows.length}</span>
              <button
                type="button"
                className="lane-collapse"
                aria-expanded={!collapsed.includes(stage.value)}
                aria-label={`${collapsed.includes(stage.value) ? "Expand" : "Collapse"} ${stage.label}`}
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(stage.value)
                      ? current.filter((value) => value !== stage.value)
                      : [...current, stage.value],
                  )
                }
              >
                {collapsed.includes(stage.value) ? "›" : "‹"}
              </button>
            </div>
            {!collapsed.includes(stage.value) && (
              <LaneItems laneKey={`rfq:${stage.value}`}>
                {rows.map((item) => (
                  <article
                    key={item.id}
                    className="kanban-card relative cursor-grab active:cursor-grabbing"
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
                    <div className="kanban-card-title" title={item.name}>{item.name}</div>
                    <div className="kanban-card-company text-xs text-gray-dark">
                      {item.brand ?? "No brand"} · Qty {item.qty}
                    </div>
                    {(item.order || item.opportunity) && (
                      <Link
                        className="kanban-card-note block truncate text-xs text-gray-dark hover:underline"
                        title={item.order?.title ?? item.opportunity?.title}
                        href={
                          item.order
                            ? `/orders/${item.order.id}`
                            : `/pipeline/${item.opportunity!.id}`
                        }
                      >
                        {item.order?.title ?? item.opportunity?.title}
                      </Link>
                    )}
                    <div className="kanban-card-facts flex items-center justify-between gap-2">
                      <PriceCell item={item} />
                      <span className="kanban-card-assignee text-xs text-gray-dark" title={item.assignee?.name ?? "Unassigned"}>
                        {item.assignee?.name ?? "Unassigned"}
                      </span>
                    </div>
                    <div className="kanban-card-footer">
                      <BadgeSelect
                        value={item.rfqStatus}
                        options={RFQ_QUEUE_STATUSES}
                        colorMap={RFQ_STATUS_COLORS}
                        ariaLabel={`Change status for ${item.name}`}
                        action={(status) => change(item.id, status)}
                      />
                    </div>
                  </article>
                ))}
                {!rows.length && (
                  <p className="py-8 text-center text-xs text-gray-dark">
                    No items in this stage.
                  </p>
                )}
              </LaneItems>
            )}
          </section>
        );
      })}
    </div>
  );
}
