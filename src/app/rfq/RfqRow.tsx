"use client";

import { RFQ_STATUSES, RFQ_STATUS_COLORS } from "@/lib/constants";
import { PendingButton, ActionButton, BadgeSelect } from "@/lib/ui";
import { Avatar } from "@/lib/Avatar";
import { UserSelect } from "@/lib/UserSelect";
import { markLineItemRemoved, setLineItemAssignee, setLineItemRfqStatus, updateLineItemPricing } from "./actions";

/** Amber past this many days sitting in the RFQ queue without a status change. */
const RFQ_WAITING_THRESHOLD_DAYS = 7;

export default function RfqRow({
  item,
  users,
  parentHref,
  parentLabel,
  parentCompany,
  daysWaiting,
}: {
  item: {
    id: string;
    name: string;
    qty: number;
    brand: string | null;
    leadTimeDays: number | null;
    unitCost: number | null;
    unitPrice: number | null;
    rfqStatus: string;
    assigneeId: string | null;
    assignee: { name: string } | null;
  };
  users: { id: string; name: string }[];
  parentHref: string | null;
  parentLabel: string;
  parentCompany: string | null;
  daysWaiting: number;
}) {
  async function handleSavePricing(formData: FormData) {
    const price = String(formData.get("price") ?? "");
    // One money field per item (Moishy, Aug 31): price only. unitCost is passed
    // through unchanged so existing data is preserved without being shown.
    await updateLineItemPricing(item.id, item.unitCost, price === "" ? null : parseFloat(price));
  }

  return (
    <tr id={`li-${item.id}`} className="align-top scroll-mt-4 transition-colors hover:bg-hover">
      <td className="!py-1.5">
        <div className="text-[13.5px] font-semibold text-ink">{item.name}</div>
        {item.brand && <div className="text-xs text-gray">{item.brand}</div>}
      </td>
      <td className="!py-1.5 text-gray-dark">{item.qty}</td>
      <td className="!py-1.5">
        {parentHref ? (
          <a href={parentHref} className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-gray-dark transition-colors hover:text-ink">
            {parentCompany && <Avatar name={parentCompany} kind="business" size="sm" />}
            <span className="truncate">{parentLabel}</span>
          </a>
        ) : (
          <span className="empty-value">no parent</span>
        )}
      </td>
      <td className={`!py-1.5 ${daysWaiting > RFQ_WAITING_THRESHOLD_DAYS ? "font-medium text-orange" : "text-gray-dark"}`}>
        {daysWaiting}d
      </td>
      <td className="!py-1.5">
        <form action={handleSavePricing} className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            name="price"
            defaultValue={item.unitPrice ?? ""}
            className="input-klyne w-24 px-1.5 py-1 text-xs"
            placeholder="price"
            aria-label="Price"
          />
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]">Save</PendingButton>
        </form>
      </td>
      <td className="!py-1.5 text-gray-dark">
        {item.leadTimeDays != null ? item.leadTimeDays : <span className="text-gray/60">–</span>}
      </td>
      <td className="!py-1.5">
        <UserSelect
          value={item.assigneeId ?? ""}
          users={users}
          action={(next) => setLineItemAssignee(item.id, next)}
        />
      </td>
      <td className="!py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeSelect
            value={item.rfqStatus}
            options={RFQ_STATUSES}
            action={(next) => setLineItemRfqStatus(item.id, next)}
            colorMap={RFQ_STATUS_COLORS}
          />
          <span title="Remove item">
            <ActionButton
              action={() => markLineItemRemoved(item.id)}
              className="btn btn-sm btn-danger !px-2 active:scale-[0.99]"
            >
              <svg
                aria-label="Remove item"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </ActionButton>
          </span>
        </div>
      </td>
    </tr>
  );
}
