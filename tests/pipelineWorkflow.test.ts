import test from "node:test";
import assert from "node:assert/strict";
import { FLOW_STEPS } from "../src/lib/ballInCourt";
import { isIntakeWorkflowStep, INTAKE_WORKFLOW_STEPS, pipelineCardProgress, canAdvancePipelineCard, pipelineWorkflowStep, pipelineWorkflowHref, validatePipelineWorkflowMove, type PipelineOrder } from "../src/lib/pipelineWorkflow";
import { dealJourney, type DealFacts } from "../src/lib/dealWorkflow";
import { collectionSnapshot } from "../src/lib/collectionIndex";
const required = { company: true, neededBy: true };
const deal: DealFacts = { id: "deal", title: "Oven", stage: "estimating", companyId: "company", neededByDate: "2026-11-01", clientQuoteCreated: true, clientQuoteSent: true, lineItems: [{ id: "item", name: "Oven", rfqStatus: "quote_received", unitPrice: null }] };
const order: PipelineOrder = { id: "order", status: "new", orderType: "project", orderValue: 100, depositRequired: null, company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 }, payments: [], purchaseOrders: [], deliveries: [], lineItems: [{ rfqStatus: "approved", deliveryStatus: "pending", purchaseOrderId: null }], openIssueCount: 0 };
const paid = { ...order, payments: [{ status: "paid", amount: 30 }] };
const shipped = { ...paid, purchaseOrders: [{ status: "shipped" }], deliveries: [{ status: "in_transit" }], lineItems: [{ ...order.lineItems[0], purchaseOrderId: "po" }] };
const arrived = { ...shipped, purchaseOrders: [{ status: "received" }], deliveries: [{ status: "delivered_full" }], lineItems: [{ ...shipped.lineItems[0], deliveryStatus: "arrived_complete" }] };

test("board lanes follow all eight detail steps using real saved evidence, irrespective of legacy stages", () => {
  const states: [DealFacts, PipelineOrder | null][] = [
    [{ ...deal, companyId: null }, null],
    [{ ...deal, lineItems: [{ ...deal.lineItems[0], rfqStatus: "rfq_sent" }] }, null],
    [{ ...deal, clientQuoteSent: false }, null], [deal, null],
    [{ ...deal, stage: "won" }, order], [{ ...deal, stage: "won" }, paid],
    [{ ...deal, stage: "won" }, shipped], [{ ...deal, stage: "won" }, arrived],
  ];
  assert.deepEqual(states.map(([d, o]) => pipelineWorkflowStep(d, required, o)), FLOW_STEPS.map(step => step.key));
  for (const legacyStage of ["proposal_sent", "revisions_needed", "negotiation"]) assert.equal(pipelineWorkflowStep({ ...deal, stage: legacyStage, clientQuoteSent: false }, required), "clientQuote");
});
test("board and detail agree on the first unfinished step", () => {
  for (const o of [order, paid, shipped, arrived]) {
    const next = dealJourney({ ...deal, stage: "won" }, required, o).slice(4).find(step => !["complete", "not_required"].includes(step.state));
    assert.equal(pipelineWorkflowStep({ ...deal, stage: "won" }, required, o), next?.key);
  }
});
test("incomplete intake, RFQs, client quote and confirmation each prevent skipping into Payment", () => {
  const incomplete = { ...deal, companyId: null, clientQuoteSent: false, lineItems: [{ ...deal.lineItems[0], rfqStatus: "rfq_sent" }] };
  const before = structuredClone(incomplete);
  const result = validatePipelineWorkflowMove(incomplete, required, null, "deposit");
  assert.equal(result.ok, false);
  if (!result.ok) { assert.deepEqual(result.issues.map(issue => issue.field), ["sales", "pricing", "clientQuote", "close"]); assert.equal(result.href, "/records/deal#deal-intake"); }
  assert.deepEqual(incomplete, before);
});
test("payment cannot be bypassed by dragging into Purchase; optional sales order never gates it", () => {
  const blocked = validatePipelineWorkflowMove({ ...deal, stage: "won" }, required, order, "pos");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) { assert.deepEqual(blocked.issues.map(issue => issue.field), ["deposit"]); assert.equal(blocked.href, "/records/deal#payments"); }
  assert.deepEqual(validatePipelineWorkflowMove({ ...deal, stage: "won" }, required, { ...paid, salesOrderSentAt: null }, "pos"), { ok: true, step: "pos" });
});
test("fulfillment and open service issues prevent skipping directly to Close Out", () => {
  const blocked = validatePipelineWorkflowMove(deal, required, paid, "service");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.deepEqual(blocked.issues.map(issue => issue.field), ["pos", "delivery"]);
  assert.equal(pipelineWorkflowStep(deal, required, { ...arrived, openIssueCount: 2 }), "service");
  assert.equal(pipelineWorkflowStep(deal, required, { ...arrived, status: "complete" }), "complete");
  assert.equal(pipelineWorkflowStep({ ...deal, stage: "lost" }, required), "lost");
});
test("historical sales gaps never reopen confirmed orders; backward board moves are rejected", () => {
  const historical = { ...deal, stage: "won", companyId: null, clientQuoteCreated: false, clientQuoteSent: false, lineItems: [] };
  assert.equal(pipelineWorkflowStep(historical, required, paid), "pos");
  const back = validatePipelineWorkflowMove(historical, required, paid, "clientQuote");
  assert.equal(back.ok, false);
  if (!back.ok) { assert.match(back.title, /cannot move backwards/); assert.equal(back.href, "/records/deal#purchase-orders"); }
  assert.equal(pipelineWorkflowHref("deal", "delivery"), "/records/deal#delivery");
});
test("full lane totals and initial cards cover all steps before lazy loading thousands of records", () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), groups: { workflowStep: FLOW_STEPS[i % 8].key } }));
  const first = collectionSnapshot(rows, 120), more = collectionSnapshot(rows, 360);
  assert.equal(first.snapshot.total, 5000);
  assert.deepEqual(first.snapshot.laneTotals, more.snapshot.laneTotals);
  for (const step of FLOW_STEPS) { assert.equal(first.snapshot.laneTotals.workflowStep[step.key], 625); assert.ok(first.ids.some(id => rows[Number(id)].groups.workflowStep === step.key)); }
});

test("focused forms accept only the eight workflow keys and preserve their field destinations", async () => {
  const { readWorkflowStep, pipelineWorkflowFormHref } = await import("../src/lib/pipelineWorkflow");
  for (const step of FLOW_STEPS) assert.equal(readWorkflowStep(step.key), step.key);
  for (const bad of [null, undefined, ["pos"], "proposal_sent", "unknown", "__proto__"]) assert.equal(readWorkflowStep(bad), null);
  assert.equal(pipelineWorkflowFormHref("/records/deal#purchase-orders", "pos"), "/records/deal?workflow=pos#purchase-orders");
  assert.equal(pipelineWorkflowFormHref("/records/deal#client-quote", "clientQuote"), "/records/deal?workflow=clientQuote#client-quote");
  assert.equal(pipelineWorkflowFormHref("/records/deal", "unknown"), "/records/deal");
});

test("kanban only permits forward targets, while unpaid invoices recalculate an earlier lane", () => {
  for (let i = 0; i < FLOW_STEPS.length; i++) for (let j = 0; j < FLOW_STEPS.length; j++) {
    assert.equal(canAdvancePipelineCard(FLOW_STEPS[i].key, FLOW_STEPS[j].key), j > i);
  }
  assert.equal(canAdvancePipelineCard("complete", "sales"), false);
  assert.equal(canAdvancePipelineCard("pos", "unknown"), false);
  assert.equal(pipelineWorkflowStep(deal, required, paid), "pos");
  assert.equal(pipelineWorkflowStep(deal, required, { ...paid, payments: [{ status: "unpaid", amount: 30 }] }), "deposit");
});

test("cards summarize all eight steps from saved evidence with no per-item requirement payload", () => {
  const progress = pipelineCardProgress(deal, required, paid);
  assert.deepEqual(progress.map(step => step.key), FLOW_STEPS.map(step => step.key));
  assert.equal(progress.find(step => step.key === "deposit")?.state, "complete");
  assert.equal(progress.find(step => step.key === "pos")?.state, "to_do");
  assert.ok(progress.every(step => Object.keys(step).sort().join(",") === "key,label,state"));
  const unpaid = pipelineCardProgress(deal, required, { ...paid, payments: [] });
  assert.equal(unpaid.find(step => step.key === "deposit")?.state, "to_do");
  assert.equal(pipelineCardProgress({ ...deal, stage: "lost" }, required).find(step => step.key === "close")?.state, "stopped");
});

test("intake board stops at Payment and paid work advances to fulfillment", () => {
  assert.deepEqual(INTAKE_WORKFLOW_STEPS.map(step => step.label), ["Intake", "Supplier Quotes", "Client Quote", "Confirm Deal", "Payment"]);
  assert.equal(isIntakeWorkflowStep(pipelineWorkflowStep(deal, required, order)), true);
  assert.equal(isIntakeWorkflowStep(pipelineWorkflowStep(deal, required, paid)), false);
  assert.equal(isIntakeWorkflowStep("complete"), false);
});
