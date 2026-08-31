"use client";

import { ORDER_STATUSES, ORDER_URGENCIES, ORDER_STATUS_COLORS, URGENCY_COLORS, labelFor } from "@/lib/constants";
import { BadgeSelect, OptimisticSelect, ActionButton } from "@/lib/ui";
import {
  markOrderStuck,
  reopenOrder,
  setOrderOwner,
  setOrderUrgency,
  unstickOrder,
} from "../actions";

export function UrgencyStatusControls({
  orderId,
  urgency,
  status,
  ownerId,
  users,
}: {
  orderId: string;
  urgency: string;
  status: string;
  ownerId: string | null;
  users: { id: string; name: string }[];
}) {
  const isStuck = status === "stuck";
  const isComplete = status === "complete";
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Urgency
        </span>
        <BadgeSelect
          value={urgency}
          options={ORDER_URGENCIES}
          action={(next) => setOrderUrgency(orderId, next)}
          colorMap={URGENCY_COLORS}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Status
        </span>
        {/* Status is derived from payments/POs/items (see @/lib/flow) - no longer a
            manual dropdown. The only manual overrides are the stuck toggle below. */}
        <span className={`badge ${ORDER_STATUS_COLORS[status] ?? "badge-gray"}`}>
          {labelFor(ORDER_STATUSES, status)}
        </span>
        <ActionButton
          action={() => (isComplete ? reopenOrder(orderId) : isStuck ? unstickOrder(orderId) : markOrderStuck(orderId))}
          className="btn btn-sm active:scale-[0.99]"
        >
          {isComplete ? "Reopen" : isStuck ? "Unstick" : "Mark stuck"}
        </ActionButton>
      </label>
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Owner
        </span>
        <OptimisticSelect
          value={ownerId ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          action={(next) => setOrderOwner(orderId, next)}
        />
      </label>
    </div>
  );
}
