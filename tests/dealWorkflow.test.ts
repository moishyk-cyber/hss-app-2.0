import test from "node:test";
import assert from "node:assert/strict";
import { closeIssues, dealJourney, stageIssues, orderCanClose, type DealFacts } from "../src/lib/dealWorkflow";
import { FLOW_STEPS, type OrderBallInput } from "../src/lib/ballInCourt";
const required={company:true,neededBy:true};
const deal:DealFacts={id:"deal",title:"Equipment",stage:"estimating",companyId:"company",neededByDate:"2026-10-22",clientQuoteCreated:true,clientQuoteSent:true,lineItems:[{id:"item",name:"Oven",rfqStatus:"quote_received",unitPrice:null}]};
const order:OrderBallInput&{id:string}={id:"order",status:"delivered",orderType:"project",orderValue:2000,quoteStatus:"needed",termsNotes:null,paymentTerms:null,company:{requiresDeposit:true,paymentTermsConfigured:true,depositPercent:30},payments:[{status:"paid",amount:600}],purchaseOrders:[{status:"shipped"}],deliveries:[{status:"delivered_full"}],lineItems:[{rfqStatus:"approved",deliveryStatus:"arrived_complete",purchaseOrderId:"po"}],openIssueCount:0};
const sequence=["Intake","Supplier Quotes","Client Quote","Confirm Deal","Payment","Purchase","Delivery","Close Out"];
test("both guides use exactly the approved eight steps for every deal type",()=>{
 assert.deepEqual(FLOW_STEPS.map(s=>s.label),sequence);
 for(const orderType of ["order","project"])for(const savedOrder of [undefined,order])assert.deepEqual(dealJourney({...deal,orderType},required,savedOrder).map(s=>s.label),sequence);
});
test("won requires a valid agreed price, delivery address and real calendar date",()=>{
 assert.deepEqual(closeIssues({value:0,address:"",neededBy:""},"won").map(i=>i.field),["value","deliveryAddress","neededByDate"]);
 assert.ok(closeIssues({value:100,address:"Address",neededBy:"2026-02-30"},"won").length);
 assert.deepEqual(closeIssues({value:100,address:"Address",neededBy:"2026-10-22"},"won"),[]);
 assert.equal(closeIssues({value:null,address:"",neededBy:"",lostReason:""},"lost").length,1);
});
test("confirming a deal cannot bypass creating and sending its client quote",()=>{
 assert.equal(stageIssues({...deal,clientQuoteCreated:false,clientQuoteSent:false},"won",required).at(-1)?.field,"clientQuote");
 assert.equal(stageIssues({...deal,clientQuoteSent:false},"won",required).at(-1)?.field,"clientQuote");
 assert.deepEqual(stageIssues(deal,"won",required),[]);
 assert.deepEqual(stageIssues({...deal,clientQuoteCreated:false},"lost",required),[]);
});
test("intake and supplier readiness still block later stages independently",()=>{
 assert.deepEqual(stageIssues({...deal,companyId:null,neededByDate:null},"won",required).map(i=>i.field),["companyId","neededByDate"]);
 assert.equal(stageIssues({...deal,lineItems:[]},"won",required)[0].field,"lineItems");
 assert.equal(dealJourney({...deal,lineItems:[{...deal.lineItems[0],rfqStatus:"rfq_sent"}]},required)[1].state,"waiting");
 assert.deepEqual(stageIssues({...deal,lineItems:[...deal.lineItems,{id:"removed",name:"Old",rfqStatus:"removed",unitPrice:null}]},"won",required),[]);
});
test("Client Quote follows Supplier Quotes and precedes Confirm Deal; preparation alone is incomplete",()=>{
 let steps=dealJourney({...deal,clientQuoteCreated:false,clientQuoteSent:false},required);
 assert.equal(steps[1].state,"complete");assert.equal(steps[2].key,"clientQuote");assert.equal(steps[2].state,"to_do");
 assert.equal(steps[2].action?.href,"#client-quote");
 steps=dealJourney({...deal,clientQuoteSent:false},required);assert.equal(steps[2].state,"in_progress");
 assert.equal(dealJourney(deal,required).find(s=>s.state==="to_do")?.key,"close");
});
test("removed order quote statuses and terms never block closeout",()=>{
 for(const quoteStatus of ["needed","sent","accepted","not_needed"])assert.equal(orderCanClose({...order,quoteStatus,salesOrderSentAt:null,termsNotes:null,paymentTerms:null}),true);
 assert.equal(orderCanClose({...order,openIssueCount:1}),false);
 assert.equal(orderCanClose({...order,payments:[]}),false);
 assert.equal(orderCanClose({...order,deliveries:[{status:"in_transit"}]}),false);
});
test("historical confirmed orders keep the new Client Quote step visible without inventing send evidence",()=>{
 const steps=dealJourney({...deal,stage:"won",clientQuoteCreated:false,clientQuoteSent:false},required,order);
 assert.equal(steps.length,8);assert.equal(steps[2].state,"not_required");assert.match(steps[2].checks[0].label,/already confirmed/);
 assert.equal(steps[3].state,"complete");assert.equal(steps[4].state,"complete");
});
test("exempt payment stays visible and delivered stock satisfies purchasing",()=>{
 assert.equal(dealJourney(deal,required,{...order,company:{requiresDeposit:false,paymentTermsConfigured:true,depositPercent:0},payments:[]})[4].state,"not_required");
 assert.equal(dealJourney(deal,required,{...order,purchaseOrders:[],lineItems:[{...order.lineItems[0],purchaseOrderId:null}]})[5].state,"complete");
});
test("lost deals stop unfinished downstream work",()=>{const steps=dealJourney({...deal,stage:"lost",clientQuoteSent:false},required);assert.ok(steps.slice(2).every(s=>s.state==="stopped"&&!s.action));});
test("all requirements have destinations after order creation",()=>{for(const step of dealJourney(deal,required,order))for(const check of step.checks)assert.ok(check.href,step.label);});
