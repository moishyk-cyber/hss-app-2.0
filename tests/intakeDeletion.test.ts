import test from "node:test";
import assert from "node:assert/strict";
import { deleteIntakeRecord, deleteIntakeItem } from "../src/lib/workflows/intakeDeletion";
import { fixture, memoryDatabase } from "./memoryDatabase";

function seed() {
  const data = fixture();
  return {...data, intakeSubmission:[{id:"submission",resultType:"opportunity",resultId:"deal"}], document:[{id:"drawing",linkedType:"opportunity",linkedId:"deal"}], task:[{id:"task",linkedType:"opportunity",linkedId:"deal"}]};
}

test("deleting an unconverted intake removes its items and submission but keeps file history and tasks", async () => {
  const m = memoryDatabase(seed());
  await deleteIntakeRecord(m.db,"opportunity","deal");
  assert.equal(m.state().opportunity.length,0);
  assert.equal(m.state().lineItem.length,0);
  assert.equal(m.state().intakeSubmission.length,0);
  assert.equal(m.state().document[0].linkedType,"deleted_intake");
  assert.equal(m.state().task[0].linkedId,null);
  assert.equal(m.state().order.length,1);
});

test("individual intake item deletion preserves sibling items", async () => {
  const data=seed();
  const m=memoryDatabase({...data,lineItem:[...data.lineItem,{...data.lineItem[0],id:"sibling"}]});
  await deleteIntakeItem(m.db,"item");
  assert.deepEqual(m.state().lineItem.map(i=>i.id),["sibling"]);
  assert.equal(m.state().opportunity.length,1);
});

test("won or linked intakes cannot be deleted, including stale requests", async () => {
  for(const won of [true,false]) {
    const data=seed();
    const m=memoryDatabase({...data,opportunity:data.opportunity.map(d=>({...d,stage:won?"won":"estimating"})),order:data.order.map(o=>({...o,opportunityId:won?null:"deal"}))});
    await assert.rejects(deleteIntakeRecord(m.db,"opportunity","deal"),/become an order/);
    assert.equal(m.state().lineItem.length,1);
  }
});

test("item and intake deletion protect downstream references", async () => {
  for(const field of ["purchaseOrderId","deliveryId"]) {
    const data=seed();
    const m=memoryDatabase({...data,lineItem:data.lineItem.map(i=>({...i,[field]:"linked"}))});
    await assert.rejects(deleteIntakeRecord(m.db,"opportunity","deal"),/history/);
    assert.equal(m.state().opportunity.length,1);
    assert.equal(m.state().lineItem.length,1);
  }
  const data=seed();
  const m=memoryDatabase({...data,serviceIssue:[{id:"issue",lineItemId:"item"}]});
  await assert.rejects(deleteIntakeItem(m.db,"item"),/history/);
});

test("direct intakes can be deleted only before payments and fulfillment exist", async () => {
  const data=seed();
  const m=memoryDatabase({...data,payment:[],purchaseOrder:[],lineItem:data.lineItem.map(i=>({...i,orderId:"order",opportunityId:null}))});
  await deleteIntakeRecord(m.db,"order","order");
  assert.equal(m.state().order.length,0);
  assert.equal(m.state().opportunity.length,1);
  for(const model of ["payment","purchaseOrder","delivery","serviceIssue"]) {
    const blocked=memoryDatabase({...data,payment:[],purchaseOrder:[],[model]:[{id:"linked",orderId:"order"}]});
    await assert.rejects(deleteIntakeRecord(blocked.db,"order","order"),/cannot be deleted/);
  }
});

test("failed deletion rolls back all intake data and item removal", async () => {
  const m=memoryDatabase(seed());
  m.fail("opportunity.delete");
  await assert.rejects(deleteIntakeRecord(m.db,"opportunity","deal"));
  assert.equal(m.state().lineItem.length,1);
  assert.equal(m.state().document[0].linkedType,"opportunity");
  assert.equal(m.state().intakeSubmission.length,1);
});
