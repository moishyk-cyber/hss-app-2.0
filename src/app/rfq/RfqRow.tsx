"use client";

import { RFQ_STATUSES, RFQ_STATUS_COLORS } from "@/lib/constants";
import { PendingButton, OptimisticSelect, ActionButton, BadgeSelect } from "@/lib/ui";
import {
  markLineItemRemoved,
  setLineItemRfqStatus,
  setLineItemSupplier,
  updateLineItemPricing,
} from "./actions";

type SupplierOption = { id: string; name: string };

export default function RfqRow({
  item,
  suppliers,
  parentHref,
  parentLabel,
}: {
  item: {
    id: string;
    name: string;
    qty: number;
    brand: string | null;
    leadTimeDays: number | null;
    unitCost: number | null;
    unitPrice: number | null;
    supplierId: string | null;
    rfqStatus: string;
    assignee: { name: string } | null;
  };
  suppliers: SupplierOption[];
  parentHref: string | null;
  parentLabel: string;
}) {
  async function handleSavePricing(formData: FormData) {
    const cost = String(formData.get("cost") ?? "");
    const price = String(formData.get("price") ?? "");
    await updateLineItemPricing(item.id, cost === "" ? null : parseFloat(cost), price === "" ? null : parseFloat(price));
  }

  return (
    <tr id={`li-${item.id}`} className="align-top scroll-mt-4 transition-colors">
      <td>
        <div className="font-medium text-ink">{item.name}</div>
        {item.brand && <div className="text-xs text-gray">{item.brand}</div>}
      </td>
      <td className="text-gray-dark">{item.qty}</td>
      <td>
        {parentHref ? (
          <a href={parentHref} className="text-blue transition-colors hover:underline">
            {parentLabel}
          </a>
        ) : (
          <span className="text-gray">—</span>
        )}
      </td>
      <td>
        <OptimisticSelect
          value={item.supplierId ?? ""}
          options={[{ value: "", label: "— none —" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          action={(next) => setLineItemSupplier(item.id, next)}
          className="input-klyne px-1.5 py-1 text-xs"
        />
      </td>
      <td>
        <form action={handleSavePricing} className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            name="cost"
            defaultValue={item.unitCost ?? ""}
            className="input-klyne w-20 px-1.5 py-1 text-xs"
            placeholder="cost"
          />
          <span className="text-gray">/</span>
          <input
            type="number"
            step="0.01"
            name="price"
            defaultValue={item.unitPrice ?? ""}
            className="input-klyne w-20 px-1.5 py-1 text-xs"
            placeholder="price"
          />
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]">Save</PendingButton>
        </form>
      </td>
      <td className="text-gray-dark">{item.leadTimeDays ?? "—"}</td>
      <td className="text-gray-dark">{item.assignee?.name ?? "—"}</td>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeSelect
            value={item.rfqStatus}
            options={RFQ_STATUSES}
            action={(next) => setLineItemRfqStatus(item.id, next)}
            colorMap={RFQ_STATUS_COLORS}
          />
          <ActionButton
            action={() => markLineItemRemoved(item.id)}
            className="btn btn-sm btn-danger active:scale-[0.99]"
          >
            Remove
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}
