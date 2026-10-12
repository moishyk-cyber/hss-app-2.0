import { PriceCell } from "../rfq/RfqRow";
import { fmtUSD } from "@/lib/money";
import { itemIsPriced } from "@/lib/dealWorkflow";
import { RFQ_STATUSES, labelFor } from "@/lib/constants";

type PricingItem = { id: string; name: string; qty: number; unitCost: number | null; unitPrice: number | null; rfqStatus: string };

export function PricingItems({ items, editable }: { items: PricingItem[]; editable: boolean }) {
  const active = items.filter(item => item.rfqStatus !== "removed");
  return <section id="line-items" aria-label="Pricing items" className="card card-flush overflow-hidden">
    <div className="border-b border-border px-5 py-4">
      <h2 className="text-sm font-semibold">Pricing items</h2>
      <p className="mt-1 text-xs text-gray-dark">{editable ? "Prices save when you leave the field or press Enter." : "Saved prices for the items on this order."}</p>
    </div>
    {!active.length ? <p className="p-5 text-sm text-gray-dark">No active items to price.</p> : <div className="overflow-x-auto"><table className="table-klyne">
      <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th><th>Pricing status</th></tr></thead>
      <tbody>{active.map(item => <tr id={`pricing-${item.id}`} key={item.id}>
        <td className="font-semibold">{item.name}</td><td>{item.qty}</td>
        <td>{editable ? <PriceCell item={{ ...item, brand: null, leadTimeDate: null, stockStatus: "", backorderExpected: null, assigneeId: null, assignee: null }} /> : item.unitPrice != null ? fmtUSD(item.unitPrice, { cents: true }) : "Not priced"}</td>
        <td>{itemIsPriced(item) ? fmtUSD(item.qty * item.unitPrice!, { cents: true }) : "Pending"}</td>
        <td>{labelFor(RFQ_STATUSES, item.rfqStatus)}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
