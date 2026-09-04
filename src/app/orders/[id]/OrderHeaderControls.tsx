"use client";

import { ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { ActionButton } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import { reopenOrder, setOrderOwner, unstickOrder } from "../actions";

export function StatusOwnerControls({
  orderId,
  status,
  ownerId,
  users,
}: {
  orderId: string;
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
          Status
        </span>
        {/* Status is derived from payments/POs/items (see @/lib/flow) - no longer a
            manual dropdown. "Reopen"/"Resume" below are the only manual overrides. */}
        <span className={`badge ${ORDER_STATUS_COLORS[status] ?? "badge-gray"}`}>
          {labelFor(ORDER_STATUSES, status)}
        </span>
        {(isComplete || isStuck) && (
          <ActionButton
            action={() => (isComplete ? reopenOrder(orderId) : unstickOrder(orderId))}
            className="btn btn-sm active:scale-[0.99]"
          >
            {isComplete ? "Reopen" : "Resume"}
          </ActionButton>
        )}
      </label>
      <label className="flex items-center gap-2">
        <span className="field-label" style={{ marginBottom: 0 }}>
          Owner
        </span>
        <UserSelect
          value={ownerId ?? ""}
          users={users}
          action={(next) => setOrderOwner(orderId, next)}
        />
      </label>
    </div>
  );
}
