import test from "node:test";
import assert from "node:assert/strict";
import { FLOW_STEPS, opportunityBall, type OpportunityBallInput } from "../src/lib/ballInCourt";
import { withHolder, type StageHolders } from "../src/lib/courtHolders";
import { dealJourney } from "../src/lib/dealWorkflow";

const ready: OpportunityBallInput = {
  stage: "estimating", intakeComplete: true, clientQuoteCreated: true, clientQuoteSent: true, salesperson: { name: "Salesperson A", active: true },
  lineItems: [{ rfqStatus: "quote_received", unitPrice: 100 }],
};
const holders = Object.fromEntries(FLOW_STEPS.map(step => [step.key, { userId: "office", userName: "Office teammate" }])) as StageHolders;

test("completed pricing hands closing to the deal salesperson even while its stage is Estimating or New", () => {
  for (const stage of ["new", "info_missing", "estimating", "proposal_sent", "revisions_needed", "negotiation"]) {
    const ball = withHolder(opportunityBall({ ...ready, stage }), holders);
    assert.deepEqual(ball, { step: "close", court: "sales", hint: "Close the deal", holder: "Salesperson A" });
  }
  assert.equal(withHolder(opportunityBall({ ...ready, salesperson: { name: "Salesperson B" } }), holders).holder, "Salesperson B");
});

test("pending supplier requests keep the ball in pricing; received quotes need no amount", () => {
  for (const item of [
    { rfqStatus: "rfq_sent", unitPrice: 100 }, { rfqStatus: "needs_pricing", unitPrice: 100 },
  ]) {
    const ball = withHolder(opportunityBall({ ...ready, lineItems: [item] }), holders);
    assert.equal(ball.step, "pricing");
    assert.equal(ball.holder, "Office teammate");
  }
  for (const rfqStatus of ["quote_received", "priced_in_autoquotes", "approved"]) {
    assert.equal(opportunityBall({ ...ready, lineItems: [{ rfqStatus, unitPrice: null }] }).step, "close");
  }
  assert.equal(opportunityBall({ ...ready, lineItems: [...ready.lineItems, { rfqStatus: "removed", unitPrice: null }] }).step, "close");
});

test("missing intake or requested items cannot advance to closing", () => {
  assert.equal(opportunityBall({ ...ready, intakeComplete: false }).step, "sales");
  assert.equal(opportunityBall({ ...ready, lineItems: [] }).step, "sales");
});

test("an unassigned or inactive salesperson cannot be replaced by a globally pinned closer", () => {
  for (const salesperson of [null, { name: "Former salesperson", active: false }, { name: " " }]) {
    assert.equal(withHolder(opportunityBall({ ...ready, salesperson }), holders).holder, "Sales (unassigned)");
  }
  assert.equal(opportunityBall({ ...ready, stage: "lost" }).step, null);
  assert.equal(withHolder(opportunityBall({ ...ready, stage: "won", order: null }), holders).holder, "Salesperson A");
});

test("the deal workflow closing step names the same salesperson as its ball-in-court badge", () => {
  const deal = { id: "deal", title: "Equipment", stage: "estimating", companyId: "company", neededByDate: "2026-10-20", salesperson: ready.salesperson,
    lineItems: [{ id: "item", name: "Oven", rfqStatus: "quote_received", unitPrice: 100 }] };
  const steps = dealJourney(deal, { company: true, neededBy: true });
  assert.equal(steps.find(step => step.key === "close")?.owner, "Salesperson A");
  assert.equal(steps.find(step => step.key === "pricing")?.state, "complete");
});

test("won orders keep their original salesperson in the historical closing step and hand the ball onward", () => {
  const order = { id: "order", status: "new", orderType: "project", orderValue: 100,
    quoteStatus: "needed", termsNotes: null, paymentTerms: null, company: { requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 },
    payments: [], purchaseOrders: [], deliveries: [], lineItems: [], openIssueCount: 0 };
  const deal = { id: "deal", title: "Equipment", stage: "won", companyId: "company", neededByDate: "2026-10-20", salesperson: ready.salesperson,
    lineItems: [{ id: "item", name: "Oven", rfqStatus: "quote_received", unitPrice: 100 }] };
  const closing = dealJourney(deal, { company: true, neededBy: true }, order).find(step => step.key === "close");
  assert.equal(closing?.owner, "Salesperson A");
  assert.equal(closing?.state, "complete");
  const ball = withHolder(opportunityBall({ ...ready, stage: "won", order }), holders);
  assert.equal(ball.step, "deposit");
  assert.equal(ball.holder, "Office teammate");
});

test("supplier readiness hands the ball to Client Quote before Confirm Deal", () => {
 const draft=opportunityBall({...ready,clientQuoteCreated:false,clientQuoteSent:false});
 assert.equal(draft.step,"clientQuote");assert.equal(withHolder(draft, holders).holder,"Office teammate");
 assert.equal(opportunityBall({...ready,clientQuoteSent:false}).step,"clientQuote");
 assert.equal(opportunityBall(ready).step,"close");
});
