"use client";

import * as orderActions from "@/app/orders/actions";
import { setServiceIssueStatus as saveIssueStatus } from "@/app/service/actions";
const original = { ...orderActions, setServiceIssueStatus: saveIssueStatus };
import type { ActionResult } from "./actionResult";

const uncertainOrders = new Set<string>();

function workflowAction<K extends keyof typeof original>(name: K): typeof original[K] {
  return (async (...args: unknown[]) => {
    const activeRoot = document.activeElement?.closest<HTMLElement>("[data-workflow-order]");
    const root = activeRoot ?? Array.from(document.querySelectorAll<HTMLElement>("[data-workflow-order]")).reverse().find(node => !node.closest("[inert]") && node.querySelector(".pipeline-detail")?.getClientRects().length);
    const orderId = root?.dataset.workflowOrder;
    if (!orderId) return (original[name] as (...args: unknown[]) => Promise<ActionResult>)(...args);
    if (uncertainOrders.has(orderId)) return { ok: false, message: "Reload to check the saved state before making another change." };
    function uncertain() {
      uncertainOrders.add(orderId!);
      root!.dispatchEvent(new CustomEvent("workflow:uncertain", { bubbles: true }));
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/orders/${orderId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, args }), signal: controller.signal });
      const result = await response.json();
      if (result.ok) {
        root.dispatchEvent(new CustomEvent("workflow:saved", { bubbles: true, detail: { orderId, steps: result.steps, payments: result.payments, gate: result.gate } }));
        return { ok: true, skipRefresh: true };
      }
      if (response.status >= 500) uncertain();
      return { ok: false, message: result.message || "Could not save this change." };
    } catch {
      uncertain();
      return { ok: false, message: "Could not confirm the save. Reload to check the saved state before trying again." };
    } finally { window.clearTimeout(timeout); }
  }) as typeof original[K];
}

export const updateOrderTermsText = workflowAction("updateOrderTermsText");
export const addInvoice = workflowAction("addInvoice");
export const markPaymentInvoiced = workflowAction("markPaymentInvoiced");
export const markPaymentPaid = workflowAction("markPaymentPaid");
export const undoMarkPaymentPaid = workflowAction("undoMarkPaymentPaid");
export const setPaymentQuickbooksRef = workflowAction("setPaymentQuickbooksRef");
export const setPaymentDueDate = workflowAction("setPaymentDueDate");
export const createPurchaseOrder = workflowAction("createPurchaseOrder");
export const advancePoStatus = workflowAction("advancePoStatus");
export const acknowledgePo = workflowAction("acknowledgePo");
export const setPoAutoQuotesNumber = workflowAction("setPoAutoQuotesNumber");
export const createDelivery = workflowAction("createDelivery");
export const updateDelivery = workflowAction("updateDelivery");
export const setDeliveryStatus = workflowAction("setDeliveryStatus");
export const deleteEmptyDelivery = workflowAction("deleteEmptyDelivery");
export const splitDelivery = workflowAction("splitDelivery");
export const moveItemsToDelivery = workflowAction("moveItemsToDelivery");
export const addOrderLineItem = workflowAction("addOrderLineItem");
export const setLineItemAssignee = workflowAction("setLineItemAssignee");
export const setLineItemBackorderExpected = workflowAction("setLineItemBackorderExpected");
export const setLineItemDeliveryStatus = workflowAction("setLineItemDeliveryStatus");
export const markOrderComplete = workflowAction("markOrderComplete");

export const reopenOrder = workflowAction("reopenOrder");
export const unstickOrder = workflowAction("unstickOrder");
export const setOrderOwner = workflowAction("setOrderOwner");

export const setServiceIssueStatus = workflowAction("setServiceIssueStatus");
