import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissionsServer";
import { ORDER_BALL_INCLUDE, orderBallInput, evaluatePaymentGate } from "@/lib/flow";
import { plainMoney } from "@/lib/money";
import { dealJourney } from "@/lib/dealWorkflow";
import * as orderActions from "@/app/orders/actions";
import { setServiceIssueStatus } from "@/app/service/actions";
const actions = { ...orderActions, setServiceIssueStatus };
import { createOrderWorkflowEndpoint } from "@/lib/orderWorkflowEndpoint";
import type { ActionResult } from "@/lib/actionResult";

// Only explicitly listed workflow mutations are callable. The existing actions
// retain their own permissions, validation, audit trail and transaction guards.
const targets = {
  reopenOrder: "order", unstickOrder: "order", setOrderOwner: "order", updateOrderTermsText: "order", addInvoice: "order", createPurchaseOrder: "order",
  createDelivery: "order", addOrderLineItem: "order", markOrderComplete: "order",
  markPaymentInvoiced: "payment", markPaymentPaid: "payment", undoMarkPaymentPaid: "payment", setPaymentQuickbooksRef: "payment", setPaymentDueDate: "payment",
  acknowledgePo: "po", advancePoStatus: "po", setPoAutoQuotesNumber: "po",
  setServiceIssueStatus: "service",
  updateDelivery: "delivery", setDeliveryStatus: "delivery", deleteEmptyDelivery: "delivery", splitDelivery: "delivery", moveItemsToDelivery: "delivery",
  setLineItemDeliveryStatus: "item", setLineItemBackorderExpected: "item", setLineItemAssignee: "item",
} as const;

export const POST = createOrderWorkflowEndpoint({
  actionNames: Object.keys(targets),
  authorize: action => {
    const name = action as keyof typeof targets;
    const permission = targets[name] === "service" ? "service.edit" : name === "updateOrderTermsText" ? "terms.edit" : targets[name] === "payment" || name === "addInvoice" ? "payments.edit" : targets[name] === "po" || name === "createPurchaseOrder" ? "pos.edit" : targets[name] === "delivery" || name === "createDelivery" || name === "setLineItemDeliveryStatus" || name === "setLineItemBackorderExpected" ? "deliveries.edit" : "orders.edit";
    return requirePermission(permission);
  },
  ownsTarget: async (id, action, args) => {
    const name = action as keyof typeof targets;
    const targetId = args[0] as string;
    const kind = targets[name];
    const target = kind === "order" ? { orderId: targetId }
      : kind === "payment" ? await prisma.payment.findUnique({ where: { id: targetId }, select: { orderId: true } })
      : kind === "po" ? await prisma.purchaseOrder.findUnique({ where: { id: targetId }, select: { orderId: true } })
      : kind === "delivery" ? await prisma.delivery.findUnique({ where: { id: targetId }, select: { orderId: true } })
      : kind === "service" ? await prisma.serviceIssue.findUnique({ where: { id: targetId }, select: { orderId: true } })
      : await prisma.lineItem.findUnique({ where: { id: targetId }, select: { orderId: true } });
    if (target?.orderId !== id) return false;
    if (name === "moveItemsToDelivery" || name === "splitDelivery") {
      if (!Array.isArray(args[1]) || !args[1].every(item => typeof item === "string")) return false;
      const itemIds = [...new Set(args[1] as string[])];
      const count = await prisma.lineItem.count({ where: { id: { in: itemIds }, orderId: id } });
      if (count !== itemIds.length) return false;
    }
    return true;
  },
  save: (action, args) => (actions[action as keyof typeof targets] as (...args: unknown[]) => Promise<ActionResult>)(...args),
  snapshot: async id => {
    const order = plainMoney(await prisma.order.findUnique({ where: { id }, include: ORDER_BALL_INCLUDE }));
    if (!order) throw new Error("Order not found after save");
    const steps = dealJourney({ id, title: order.title, stage: "won", companyId: order.companyId, neededByDate: order.neededByDate, lineItems: order.lineItems }, { company: false, neededBy: false }, { ...orderBallInput(order), id });
    return { steps, payments: order.payments, gate: evaluatePaymentGate(order) };
  },
});
