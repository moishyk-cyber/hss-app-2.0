import test from "node:test";
import assert from "node:assert/strict";
import { courtRecipients, planNotifications, taskDueCutoff, type NoticeSnapshot } from "../src/lib/notificationRules";
import { syncRecordNotifications, notifyDueTasks, markNotificationsRead, initializeNotifications, processNotificationActivity } from "../src/lib/notifications";
import { fixture, memoryDatabase } from "./memoryDatabase";

const now = new Date("2026-10-15T12:00:00Z");
const users = [ { id: "sales", role: "sales", active: true }, { id: "buyer", role: "purchasing", active: true }, { id: "billing", role: "billing", active: true }, { id: "inactive", role: "sales", active: false }, { id: "sales2", role: "sales", active: true } ];
const state: NoticeSnapshot = { step: "pricing", recipients: ["buyer"], pricingReady: false, salespersonIds: ["sales"], quoteReviewIds: ["buyer"], billingKind: "payment" };
const deal = { title: "Kitchen", href: "/pipeline/deal", isDeal: true };
function seed() {
  const data = fixture();
  return {...data, user: users, appSetting:[{id:"start",key:"notifications.startedAt",value:"2026-10-15T00:00:00Z"}], opportunity: data.opportunity.map(d=>({...d,title:"Kitchen",salespersonId:"sales",companyId:"company",neededByDate:now,createdAt:now})), order:data.order.map(o=>({...o,termsNotes:"Agreed",paymentTerms:null,quoteStatus:"not_needed",createdAt:now,ownerId:"sales"}))};
}

test("new deals notify quote reviewers once without duplicating their ball-in-court alert", () => {
  const events = planNotifications(null,state,deal);
  assert.deepEqual(events.map(e=>e.kind),["quote_review"]);
  assert.deepEqual(events[0].recipientIds,["buyer"]);
  assert.deepEqual(planNotifications(state,state,deal),[]);
});

test("supplier quotes complete hands off to salesperson and merges the closing alert", () => {
  const ready={...state,step:"close" as const,recipients:["sales"],pricingReady:true};
  const events=planNotifications(state,ready,deal);
  assert.deepEqual(events.map(e=>e.kind),["pricing_ready"]);
  assert.deepEqual(events[0].recipientIds,["sales"]);
  assert.equal(events[0].href,"/pipeline/deal#close");
  assert.deepEqual(planNotifications(ready,ready,deal),[]);
});

test("ball transfers and reentries notify current recipients; unchanged holders do not repeat", () => {
  const next={...state,step:"pos" as const,recipients:["buyer"]};
  assert.equal(planNotifications(state,next,{...deal,isDeal:false})[0].kind,"ball_in_court");
  const added={...state,recipients:["buyer","sales"]};
  assert.deepEqual(planNotifications(state,added,deal)[0].recipientIds,["sales"]);
  assert.deepEqual(planNotifications(state,{...state,step:null,recipients:[]},deal),[]);
});

test("deposit and full-payment reminders have distinct messages and links", () => {
  for (const billingKind of ["deposit","payment"] as const) {
    const events=planNotifications(state,{...state,step:"deposit",recipients:["billing"],billingKind},{...deal,href:"/orders/order",isDeal:false});
    assert.equal(events[0].kind,`awaiting_${billingKind}`);
    assert.equal(events[0].href,"/orders/order#payments");
    assert.match(events[0].message,new RegExp(billingKind));
  }
});

test("recipients follow active court pins and roles while closing ignores global overrides", () => {
  assert.deepEqual(courtRecipients("pricing",null,users,{"court.pricing.userIds":"buyer,buyer,inactive"}),["buyer"]);
  assert.deepEqual(courtRecipients("deposit",null,users,{}),["billing"]);
  assert.deepEqual(courtRecipients("close","sales",users,{"court.close.userIds":"buyer"}),["sales"]);
  assert.deepEqual(courtRecipients("close","inactive",users,{}),[]);
  assert.deepEqual(courtRecipients("pricing",null,users,{"court.pricing.role":"design"}),["buyer"]);
});

test("snapshot persistence deduplicates repeated processing and retries serialization conflicts", async () => {
  const m=memoryDatabase(seed());
  m.conflictOnce();
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  assert.equal(m.state().notification.filter(n=>n.kind==="quote_review").length,1);
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  assert.equal(m.state().notification.length,1);
  assert.equal(m.state().notificationState[0].version,1);
});

test("pricing transitions persist salesperson alerts and reentry can notify again", async () => {
  const m=memoryDatabase(seed());
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  await m.db.lineItem.update({where:{id:"item"},data:{rfqStatus:"quote_received"}});
  await syncRecordNotifications(m.db,"line_item","item",now);
  const ready=m.state().notification.filter(n=>n.kind==="pricing_ready");
  assert.equal(ready.length,1);
  assert.equal(ready[0].userId,"sales");
  await m.db.lineItem.update({where:{id:"item"},data:{rfqStatus:"needs_pricing"}});
  await syncRecordNotifications(m.db,"line_item","item",now);
  await m.db.lineItem.update({where:{id:"item"},data:{rfqStatus:"approved"}});
  await syncRecordNotifications(m.db,"line_item","item",now);
  assert.equal(m.state().notification.filter(n=>n.kind==="pricing_ready").length,2);
});

test("failed delivery rolls back the snapshot so retry does not lose the event", async () => {
  const m=memoryDatabase(seed());
  m.fail("notification.createMany");
  await assert.rejects(syncRecordNotifications(m.db,"opportunity","deal",now));
  assert.equal((m.state().notificationState ?? []).length,0);
  m.fail();
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  assert.equal(m.state().notification.length,1);
});

test("old records establish a baseline without flooding the inbox", async () => {
  const data=seed();
  const m=memoryDatabase({...data,opportunity:data.opportunity.map(d=>({...d,createdAt:new Date("2026-09-01")}))});
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  assert.equal(m.state().notification.length,0);
  await m.db.lineItem.update({where:{id:"item"},data:{rfqStatus:"approved"}});
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  assert.equal(m.state().notification[0].kind,"pricing_ready");
});

test("orders notify billing according to the agreed deposit or full-payment amount", async () => {
  for(const orderType of ["project","order"]) {
    const data=seed();
    const m=memoryDatabase({...data,payment:[],order:data.order.map(o=>({...o,orderType,depositRequired:orderType==="order"?Number(o.orderValue):null}))});
    await syncRecordNotifications(m.db,"order","order",now);
    assert.equal(m.state().notification[0].userId,"billing");
    assert.equal(m.state().notification[0].kind,orderType==="project"?"awaiting_deposit":"awaiting_payment");
  }
});

test("due reminders are private, include overdue tasks, and deduplicate across polling", async () => {
  const m=memoryDatabase({...seed(),task:[
    {id:"due",title:"Due today",status:"not_started",assigneeId:"sales",dueDate:new Date("2026-10-15")},
    {id:"overdue",title:"Overdue",status:"in_progress",assigneeId:"sales",dueDate:new Date("2026-10-14")},
    {id:"future",title:"Tomorrow",status:"not_started",assigneeId:"sales",dueDate:new Date("2026-10-16")},
    {id:"done",title:"Done",status:"done",assigneeId:"sales",dueDate:new Date("2026-10-15")},
    {id:"other",title:"Other user",status:"not_started",assigneeId:"buyer",dueDate:new Date("2026-10-15")},
    {id:"none",title:"No date",status:"not_started",assigneeId:"sales",dueDate:null},
  ]});
  await notifyDueTasks(m.db,"sales",now);
  await notifyDueTasks(m.db,"sales",now);
  assert.equal(m.state().notification.length,2);
  assert.ok(m.state().notification.every(n=>n.userId==="sales"));
  assert.equal(taskDueCutoff(now).toISOString(),"2026-10-16T00:00:00.000Z");
  await m.db.task.update({where:{id:"due"},data:{dueDate:new Date("2026-10-14")}});
  await notifyDueTasks(m.db,"sales",now);
  assert.equal(m.state().notification.length,3);
});

test("mark-read cannot modify another user's inbox, even with a known notification ID", async () => {
  const m=memoryDatabase({...seed(),notification:[{id:"mine",userId:"sales",readAt:null},{id:"theirs",userId:"buyer",readAt:null}]});
  await markNotificationsRead(m.db,"sales","theirs");
  assert.equal(m.state().notification[1].readAt,null);
  await markNotificationsRead(m.db,"sales");
  assert.ok(m.state().notification[0].readAt instanceof Date);
  assert.equal(m.state().notification[1].readAt,null);
});


test("activation baselines existing work once and preserves existing inbox/read state on reruns", async () => {
  const data=seed();
  const m=memoryDatabase({...data,appSetting:[],notification:[{id:"kept",userId:"sales",eventKey:"existing",readAt:now}]});
  await initializeNotifications(m.db,now);
  assert.equal(m.state().notificationState.length,2);
  assert.equal(m.state().notification.length,1);
  assert.deepEqual(m.state().notification[0].readAt,now);
  const started=m.state().appSetting.find(s=>s.key==="notifications.startedAt")?.value;
  await initializeNotifications(m.db,new Date("2026-10-16"));
  assert.equal(m.state().notificationState.length,2);
  assert.equal(m.state().appSetting.find(s=>s.key==="notifications.startedAt")?.value,started);
});


test("changing a court holder notifies its newly assigned user and acknowledges the retry entry", async () => {
  const data=seed();
  const m=memoryDatabase({...data,opportunity:data.opportunity.map(d=>({...d,createdAt:new Date("2000-01-01")})),order:[],activityLog:[{id:"holder-change",linkedType:"setting",linkedId:"pricing",action:"court_holder_changed",notificationProcessedAt:null}]});
  await syncRecordNotifications(m.db,"opportunity","deal",now);
  await m.db.appSetting.create({data:{key:"court.pricing.userIds",value:"sales2"}});
  await processNotificationActivity(m.db,{id:"holder-change",linkedType:"setting",linkedId:"pricing",action:"court_holder_changed"});
  assert.equal(m.state().notification.length,1);
  assert.equal(m.state().notification[0].userId,"sales2");
  assert.equal(m.state().notification[0].kind,"ball_in_court");
  assert.ok(m.state().activityLog[0].notificationProcessedAt instanceof Date);
});
