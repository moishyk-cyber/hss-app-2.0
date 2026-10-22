import test from "node:test";
import assert from "node:assert/strict";
import { logPurchaseOrder } from "../src/lib/workflows/purchaseOrders";
import { fixture, memoryDatabase } from "./memoryDatabase";
import { orderBall, type OrderBallInput } from "../src/lib/ballInCourt";
import { isRole, roleCan, defaultPermissionMatrix } from "../src/lib/permissions";
const input={orderId:"order",supplierId:"company",lineItemIds:["item"],number:"AQ-APPROVED"};
test("paid orders can log a PO without a sales-order confirmation",async()=>{const seed=fixture();const m=memoryDatabase({...seed,lineItem:seed.lineItem.map(i=>({...i,orderId:"order"}))});const po=await logPurchaseOrder(m.db,input);assert.equal(po.poNumber,"AQ-APPROVED");assert.equal(m.state().lineItem[0].purchaseOrderId,po.id);});
test("removing the sales-order gate never bypasses payment",async()=>{const seed=fixture();const m=memoryDatabase({...seed,payment:[],lineItem:seed.lineItem.map(i=>({...i,orderId:"order"}))});await assert.rejects(logPurchaseOrder(m.db,input),/payment|deposit|invoic/i);assert.equal(m.state().purchaseOrder.length,1);});
test("after payment the ball moves directly to purchasing, ignoring historical quote and terms fields",()=>{const order:OrderBallInput={status:"payment_received",orderType:"order",orderValue:100,company:{requiresDeposit:true,paymentTermsConfigured:true,depositPercent:30},payments:[{status:"paid",amount:100}],quoteStatus:"needed",termsNotes:null,paymentTerms:null,salesOrderSentAt:null,purchaseOrders:[],deliveries:[],openIssueCount:0,lineItems:[{rfqStatus:"approved",deliveryStatus:"pending",purchaseOrderId:null}]};assert.equal(orderBall(order).step,"pos");assert.equal(orderBall({...order,payments:[]}).step,"deposit");});
test("Design remains unavailable as an assignable or privileged role",()=>{assert.equal(isRole("design"),false);assert.equal(roleCan(defaultPermissionMatrix(),"design","deals.edit"),false);});

test("optional sales-order tracking saves even before payment, preserves its first date and can be cleared",async()=>{
 const {confirmSalesOrder}=await import('../src/lib/workflows/salesOrder');
 const seed=fixture();const m=memoryDatabase({...seed,payment:[]});
 await confirmSalesOrder(m.db,'order',true);const date=m.state().order[0].salesOrderSentAt;
 assert.ok(date instanceof Date);await confirmSalesOrder(m.db,'order',true);assert.deepEqual(m.state().order[0].salesOrderSentAt,date);
 await confirmSalesOrder(m.db,'order',false);assert.equal(m.state().order[0].salesOrderSentAt,null);
});
test("optional sales-order tracking rejects closed orders and rolls back failed writes",async()=>{
 const {confirmSalesOrder}=await import('../src/lib/workflows/salesOrder');
 const seed=fixture();seed.order[0].status='complete';await assert.rejects(confirmSalesOrder(memoryDatabase(seed).db,'order',true),/closed/);
 const m=memoryDatabase(fixture());m.fail('order.update');await assert.rejects(confirmSalesOrder(m.db,'order',true));assert.equal(m.state().order[0].salesOrderSentAt,undefined);
});
