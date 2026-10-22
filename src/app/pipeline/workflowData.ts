import { evaluatePaymentGate } from "@/lib/flowRules";
import type { PrismaClient } from "@prisma/client";
import { plainMoney } from "@/lib/money";
import { pipelineWorkflowStep } from "@/lib/pipelineWorkflow";
import type { DealRequirements } from "@/lib/dealWorkflow";
import { PIPELINE_WORKFLOW_INDEX_SELECT } from "./data";

/** Index only the evidence needed for lane membership, never full record/document payloads. */
export async function readPipelineWorkflowIndex(db: PrismaClient, required: DealRequirements) {
  const [opportunities, direct] = await Promise.all([
    db.opportunity.findMany({ select: PIPELINE_WORKFLOW_INDEX_SELECT, relationLoadStrategy: "join" }),
    db.order.findMany({ where: { opportunityId: null, status: { in: ["new", "awaiting_payment", "stuck"] } }, select: { id: true, orderType: true, orderValue: true, depositRequired: true, paymentPlan: true, company: { select: { requiresDeposit: true, depositPercent: true, paymentTermsConfigured: true } }, payments: { select: { amount: true, status: true } } }, relationLoadStrategy: "join" }),
  ]);
  const rows = plainMoney(opportunities);
  return [...rows.map(deal => {
    const order = deal.orders[0];
    return { id: deal.id, source: "opportunity" as const, step: pipelineWorkflowStep(deal, required, order ? { ...order, openIssueCount: order._count.serviceIssues } : null) };
  }), ...plainMoney(direct).filter(order => !evaluatePaymentGate(order).open).map(order => ({ id: order.id, source: "order" as const, step: "deposit" as const }))];
}
