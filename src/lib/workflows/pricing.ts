import type { Prisma, PrismaClient } from "@prisma/client";
import { RFQ_STATUSES, isValidValue } from "../constants";
import { roundCents, toMoney } from "../money";
import { reconcileOrderStatus, reconcileOrderValue } from "./orderState";
import { serialTransaction } from "./transaction";

type PricingChange =
  | { kind: "price"; unitCost: number | null; unitPrice: number }
  | { kind: "clear" }
  | { kind: "quantity"; qty: number }
  | { kind: "status"; rfqStatus: string };

type PricingEffects = {
  audit: (type: string, id: string, action: string, detail: string) => Promise<void>;
  refresh: (path: string) => void;
};

export function createLineItemPricing(db: PrismaClient, effects: PricingEffects) {
  async function reconcile(db: Prisma.TransactionClient, item: { opportunityId: string | null; orderId: string | null }) {
    const events: Parameters<PricingEffects["audit"]>[] = [];
    if (item.opportunityId) {
      const deal = await db.opportunity.findUnique({
        where: { id: item.opportunityId },
        select: {
          stage: true, value: true, needsPricing: true,
          lineItems: { select: { qty: true, unitPrice: true, rfqStatus: true } }
        },
      });
      if (deal && deal.stage !== "won" && deal.stage !== "lost") {
        const live = deal.lineItems.filter(i => i.rfqStatus !== "removed");
        const needsPricing = live.some(i => i.rfqStatus === "needs_pricing" || i.rfqStatus === "rfq_sent");
        const data: { needsPricing?: boolean; value?: number } = {};
        if (deal.needsPricing !== needsPricing) data.needsPricing = needsPricing;
        // Deal value is editable/agreed: only initialize it, never overwrite it.
        if (deal.value == null && live.length && live.every(i => i.unitPrice != null && Number(i.unitPrice) > 0)) {
          data.value = roundCents(live.reduce((sum, i) => sum + Number(i.unitPrice) * i.qty, 0));
        }
        if (Object.keys(data).length) {
          await db.opportunity.update({ where: { id: item.opportunityId }, data });
          events.push(["opportunity", item.opportunityId, "pricing_synced",
            [data.needsPricing == null ? null : data.needsPricing ? "Items need pricing" : "No active items awaiting pricing",
            data.value == null ? null : `Deal value set to $${data.value} from priced items`].filter(Boolean).join("; ")]);
        }
      }
    }
    if (item.orderId) {
      const change = await reconcileOrderValue(db, item.orderId);
      // RFQ removal/status can move the order even when its total is unchanged.
      await reconcileOrderStatus(db, item.orderId);
      if (change) events.push(["order", item.orderId, "order_value_synced",
        `Order value updated from $${change.previous ?? 0} to $${change.total} to match priced line items`]);
    }
    return events;
  }

  async function finish(result: { item: { opportunityId: string | null; orderId: string | null }; events: Parameters<PricingEffects["audit"]>[] }) {
    for (const event of result.events) await effects.audit(...event);
    for (const path of ["/rfq", "/pipeline", "/orders", "/dashboard",
      ...(result.item.opportunityId ? [`/pipeline/${result.item.opportunityId}`] : []),
      ...(result.item.orderId ? [`/orders/${result.item.orderId}`] : [])]) effects.refresh(path);
  }

  return {
    async change(id: string, change: PricingChange) {
      const result = await serialTransaction(db, async tx => {
        const before = await tx.lineItem.findUnique({ where: { id } });
        if (!before) throw new Error("Line item not found");
        let data: Prisma.LineItemUpdateInput;
        switch (change.kind) {
          case "price":
            if (!Number.isFinite(change.unitPrice) || change.unitPrice <= 0 ||
              (change.unitCost != null && !Number.isFinite(change.unitCost))) throw new Error("Invalid price");
            data = {
              unitCost: change.unitCost == null ? null : roundCents(change.unitCost),
              unitPrice: roundCents(change.unitPrice),
              ...(before.rfqStatus === "needs_pricing" ? { rfqStatus: "quote_received" } : {})
            };
            break;
          case "clear": data = { unitPrice: null }; break;
          case "quantity": data = { qty: Number.isFinite(change.qty) && change.qty > 0 ? Math.floor(change.qty) : 1 }; break;
          case "status":
            if (!isValidValue(RFQ_STATUSES, change.rfqStatus)) throw new Error("Invalid RFQ status");
            data = { rfqStatus: change.rfqStatus }; break;
        }
        const item = await tx.lineItem.update({ where: { id }, data });
        return { item, before: { ...before, unitPrice: toMoney(before.unitPrice) }, events: await reconcile(tx, item) };
      });
      await finish(result);
      return result;
    },
    async add(data: Prisma.LineItemUncheckedCreateInput) {
      const result = await serialTransaction(db, async tx => {
        const item = await tx.lineItem.create({ data });
        return { item, events: await reconcile(tx, item) };
      });
      await finish(result);
      return result.item;
    },
  };
}
