"use client";

import { useCollectionSnapshot } from "./CollectionScope";

/** Full filtered lane value, adjusted for locally moved cards before refresh. */
export function KanbanLaneAmount({ field, lane, amount, initialAmount = amount }: {
  field: string;
  lane: string;
  amount: number;
  initialAmount?: number;
}) {
  const snapshot = useCollectionSnapshot();
  const total = (snapshot?.laneAmounts?.[field]?.[lane] ?? initialAmount) + amount - initialAmount;
  return <span className="text-xs tabular-nums text-gray whitespace-nowrap" title="Total value in this column">
    {`$${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
  </span>;
}
