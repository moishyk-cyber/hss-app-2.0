"use client";

import { useState, useTransition } from "react";
import {
  advanceRfqStatus,
  markLineItemRemoved,
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
    assignee: { name: string } | null;
  };
  suppliers: SupplierOption[];
  parentHref: string | null;
  parentLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [cost, setCost] = useState(item.unitCost?.toString() ?? "");
  const [price, setPrice] = useState(item.unitPrice?.toString() ?? "");
  const dirty =
    cost !== (item.unitCost?.toString() ?? "") || price !== (item.unitPrice?.toString() ?? "");

  return (
    <tr className="border-b border-gray-100 last:border-0 align-top">
      <td className="py-2 pl-3 pr-3">
        <div className="font-medium text-gray-900">{item.name}</div>
        {item.brand && <div className="text-xs text-gray-500">{item.brand}</div>}
      </td>
      <td className="py-2 pr-3 text-gray-700">{item.qty}</td>
      <td className="py-2 pr-3">
        {parentHref ? (
          <a href={parentHref} className="text-blue-600 hover:underline">
            {parentLabel}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <select
          className="rounded border border-gray-300 px-1.5 py-1 text-xs"
          defaultValue={item.supplierId ?? ""}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => {
              setLineItemSupplier(item.id, e.target.value);
            })
          }
        >
          <option value="">— none —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs"
            placeholder="cost"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <span className="text-gray-300">/</span>
          <input
            type="number"
            step="0.01"
            className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs"
            placeholder="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {dirty && (
            <button
              disabled={pending}
              className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700"
              onClick={() =>
                startTransition(() => {
                  updateLineItemPricing(
                    item.id,
                    cost === "" ? null : parseFloat(cost),
                    price === "" ? null : parseFloat(price)
                  );
                })
              }
            >
              Save
            </button>
          )}
        </div>
      </td>
      <td className="py-2 pr-3 text-gray-700">{item.leadTimeDays ?? "—"}</td>
      <td className="py-2 pr-3 text-gray-700">{item.assignee?.name ?? "—"}</td>
      <td className="py-2 pr-3">
        <div className="flex gap-2">
          <button
            disabled={pending}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            onClick={() => startTransition(() => advanceRfqStatus(item.id))}
          >
            Advance
          </button>
          <button
            disabled={pending}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            onClick={() => startTransition(() => markLineItemRemoved(item.id))}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
