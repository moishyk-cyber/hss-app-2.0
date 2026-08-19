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
    <tr className="align-top">
      <td>
        <div className="font-medium text-ink">{item.name}</div>
        {item.brand && <div className="text-xs text-gray">{item.brand}</div>}
      </td>
      <td className="text-gray-dark">{item.qty}</td>
      <td>
        {parentHref ? (
          <a href={parentHref} className="text-blue hover:underline">
            {parentLabel}
          </a>
        ) : (
          <span className="text-gray">—</span>
        )}
      </td>
      <td>
        <select
          className="input-klyne px-1.5 py-1 text-xs"
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
      <td>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            className="input-klyne w-20 px-1.5 py-1 text-xs"
            placeholder="cost"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <span className="text-gray">/</span>
          <input
            type="number"
            step="0.01"
            className="input-klyne w-20 px-1.5 py-1 text-xs"
            placeholder="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {dirty && (
            <button
              disabled={pending}
              className="btn btn-primary btn-sm"
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
      <td className="text-gray-dark">{item.leadTimeDays ?? "—"}</td>
      <td className="text-gray-dark">{item.assignee?.name ?? "—"}</td>
      <td>
        <div className="flex gap-2">
          <button
            disabled={pending}
            className="btn btn-sm"
            onClick={() => startTransition(() => advanceRfqStatus(item.id))}
          >
            Advance
          </button>
          <button
            disabled={pending}
            className="btn btn-sm btn-danger"
            onClick={() => startTransition(() => markLineItemRemoved(item.id))}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
