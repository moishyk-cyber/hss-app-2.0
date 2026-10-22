import { notifyAllDueTasks } from "../src/lib/notifications";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { saveNotificationRows, EMAIL_START_KEY } from "../src/lib/notificationEmailQueue";
import { dispatchNotificationEmails, initializeNotificationEmails } from "../src/lib/notificationEmails";
import { notificationEmailConfig, notificationEmailPayload, sendResendEmail, ResendDeliveryError, type EmailPayload } from "../src/lib/resendEmail";
import { authorizedNotificationCron } from "../src/lib/notificationCron";
import { serialTransaction } from "../src/lib/workflows/transaction";
import { memoryDatabase } from "./memoryDatabase";

const config={apiKey:"re_test_placeholder",from:"HSS Kitchens <notifications.hss@apps.klyneandco.com>",appUrl:"https://hss-app-kappa.vercel.app"};
const now=new Date("2026-10-20T12:00:00Z");
const notice={id:"notice",userId:"user",eventKey:"deal:ready:1",kind:"pricing_ready",title:"Quotes ready",message:"Review the requested quote.",href:"/pipeline/deal#close",createdAt:now};
function seed() {
 return {user:[{id:"user",email:"team@example.com",active:true}],appSetting:[{id:"start",key:EMAIL_START_KEY,value:"2026-10-20T00:00:00Z"}],notification:[],notificationEmail:[]};
}
const noPause=async()=>{};
beforeEach(() => { process.env.NOTIFICATION_EMAIL_ENABLED = "true"; });
async function queued() {
 const m=memoryDatabase(seed());
 await serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice]));
 await m.db.notificationEmail.updateMany({where:{},data:{createdAt:now,availableAt:now}});
 return m;
}
test('volume fixtures stay in the inbox without creating email jobs after normal email is re-enabled',async()=>{
 const m=memoryDatabase(seed());
 await serialTransaction(m.db,tx=>saveNotificationRows(tx,[{...notice,id:'volume',kind:'qa_stress'},{...notice,id:'fixture',eventKey:'fixture',message:'[LOAD TEST] Scale order updated'}]));
 assert.equal(await m.db.notification.count(),2);
 assert.equal(await m.db.notificationEmail.count(),0);
});

test("email configuration is server-only, complete, and validates the application origin",()=>{
 assert.equal(notificationEmailConfig({}),null);
 assert.equal(notificationEmailConfig({RESEND_API_KEY:config.apiKey,NOTIFICATION_EMAIL_FROM:config.from,APP_URL:config.appUrl,NOTIFICATION_EMAIL_ENABLED:"false"}),null);
 assert.equal(notificationEmailConfig({RESEND_API_KEY:"x",NOTIFICATION_EMAIL_FROM:config.from,APP_URL:"http://localhost:3001"}),null);
 assert.equal(notificationEmailConfig({RESEND_API_KEY:"x",NOTIFICATION_EMAIL_FROM:config.from,APP_URL:"https://attacker@hss-app-kappa.vercel.app"}),null);
 assert.equal(notificationEmailConfig({RESEND_API_KEY:"x",NOTIFICATION_EMAIL_FROM:"bad\nvalue",APP_URL:config.appUrl}),null);
 assert.deepEqual(notificationEmailConfig({RESEND_API_KEY:config.apiKey,NOTIFICATION_EMAIL_FROM:config.from,APP_URL:config.appUrl}),config);
});

test("notification emails escape user text and only link to permitted app records",()=>{
 const body=notificationEmailPayload(config,{...notice,title:'<script>"Quote"</script>',message:"& client <notes>"},"team@example.com");
 assert.ok(body.html.includes("&lt;script&gt;"));
 assert.ok(!body.html.includes("<script>"));
 assert.ok(body.html.includes("https://hss-app-kappa.vercel.app/pipeline/deal#close"));
 assert.deepEqual(body.to,["team@example.com"]);
 assert.throws(()=>notificationEmailPayload(config,{...notice,href:"//evil.example/path"},"team@example.com"));
 assert.throws(()=>notificationEmailPayload(config,{...notice,href:"/login?redirect=evil"},"team@example.com"));
});

test("new notices queue once; already existing old notices never become an email blast",async()=>{
 const m=await queued();
 await serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice]));
 assert.equal(m.state().notification.length,1);
 assert.equal(m.state().notificationEmail.length,1);
 assert.equal(m.state().notificationEmail[0].recipient,"team@example.com");
 const old={...notice,id:"old",eventKey:"older",createdAt:new Date("2026-10-19")};
 await serialTransaction(m.db,tx=>saveNotificationRows(tx,[old]));
 assert.equal(m.state().notificationEmail.length,1);
});

test("inactive or invalid email recipients retain their inbox notice without an email job",async()=>{
 for(const user of [{id:"user",email:"team@example.com",active:false},{id:"user",email:"not-an-email",active:true}]) {
  const m=memoryDatabase({...seed(),user:[user]});
  await serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice]));
  assert.equal(m.state().notification.length,1);
  assert.equal(m.state().notificationEmail.length,0);
 }
});

test("email pause keeps in-app notifications without creating an email backlog",async()=>{
 process.env.NOTIFICATION_EMAIL_ENABLED="false";
 const m=memoryDatabase(seed());
 await serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice]));
 assert.equal(m.state().notification.length,1);
 assert.equal(m.state().notificationEmail.length,0);
});

test("outbox enqueue failure rolls back the inbox insert and can safely retry",async()=>{
 const m=memoryDatabase(seed());m.fail("notificationEmail.createMany");
 await assert.rejects(serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice])));
 assert.equal(m.state().notification.length,0);
 m.fail();await serialTransaction(m.db,tx=>saveNotificationRows(tx,[notice]));
 assert.equal(m.state().notificationEmail.length,1);
});

test("successful delivery persists the Resend ID and does not send on later polls",async()=>{
 const m=await queued();let calls=0;
 const send=async()=>{calls++;return "resend-id";};
 const result=await dispatchNotificationEmails(m.db,{config,now:()=>now,send,pause:noPause});
 assert.equal(result.sent,1);
 assert.equal(m.state().notificationEmail[0].resendId,"resend-id");
 await dispatchNotificationEmails(m.db,{config,now:()=>now,send,pause:noPause});
 assert.equal(calls,1);
});

test("disabled configuration performs no requests and preserves queued notices",async()=>{
 const m=await queued();let calls=0;
 const stats=await dispatchNotificationEmails(m.db,{config:null,send:async()=>{calls++;return "none";}});
 assert.equal(stats.configured,false);assert.equal(calls,0);
 assert.equal(m.state().notificationEmail[0].status,"pending");
});

test("temporary failures retry with the identical payload and idempotency key",async()=>{
 const m=await queued();let time=now;const bodies:EmailPayload[]=[];const keys:string[]=[];
 const send=async(_config:typeof config,payload:EmailPayload,key:string)=>{bodies.push(payload);keys.push(key);if(bodies.length===1)throw new ResendDeliveryError(true,"resend_connection_uncertain");return "accepted";};
 await dispatchNotificationEmails(m.db,{config,now:()=>time,send,pause:noPause});
 assert.equal(m.state().notificationEmail[0].status,"pending");
 await dispatchNotificationEmails(m.db,{config,now:()=>time,send,pause:noPause});
 assert.equal(bodies.length,1);
 time=new Date(now.getTime()+60000);
 await dispatchNotificationEmails(m.db,{config:{...config,from:"Changed <other@example.com>"},now:()=>time,send,pause:noPause});
 assert.equal(m.state().notificationEmail[0].status,"sent");assert.deepEqual(bodies[0],bodies[1]);assert.equal(keys[0],keys[1]);
});

test("uncertain delivery outside Resend's idempotency window is not sent again",async()=>{
 const m=await queued();
 await m.db.notificationEmail.updateMany({where:{},data:{firstAttemptAt:new Date(now.getTime()-24*3600000),status:"sending",leaseUntil:new Date(now.getTime()-1000)}});
 let calls=0;await dispatchNotificationEmails(m.db,{config,now:()=>now,send:async()=>{calls++;return "duplicate";},pause:noPause});
 assert.equal(calls,0);assert.equal(m.state().notificationEmail[0].status,"uncertain");
});

test("inactive or changed recipients are skipped before sending",async()=>{
 const m=await queued();await m.db.user.update({where:{id:"user"},data:{email:"new@example.com"}});
 let calls=0;await dispatchNotificationEmails(m.db,{config,now:()=>now,send:async()=>{calls++;return "bad";},pause:noPause});
 assert.equal(calls,0);assert.equal(m.state().notificationEmail[0].status,"skipped");
});

test("accepted email with a failed DB acknowledgment recovers using the same idempotency key",async()=>{
 const m=await queued();let time=now;const keys:string[]=[];
 const send=async(_config:typeof config,_payload:EmailPayload,key:string)=>{keys.push(key);if(keys.length===1)m.fail("notificationEmail.updateMany");return "same-resend-id";};
 await assert.rejects(dispatchNotificationEmails(m.db,{config,now:()=>time,send,pause:noPause}));
 assert.equal(m.state().notificationEmail[0].status,"sending");
 m.fail();time=new Date(now.getTime()+3*60000);
 await dispatchNotificationEmails(m.db,{config,now:()=>time,send,pause:noPause});
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(m.state().notificationEmail[0].status,"sent");
});

test("Resend transport includes idempotency and does not expose provider response bodies",async()=>{
 let captured:RequestInit|undefined;
 const id=await sendResendEmail(config,notificationEmailPayload(config,notice,"team@example.com"),"stable-key",async(_url,init)=>{captured=init;return Response.json({id:"sent"});});
 assert.equal(id,"sent");assert.equal((captured?.headers as Record<string,string>)["Idempotency-Key"],"stable-key");
 await assert.rejects(sendResendEmail(config,notificationEmailPayload(config,notice,"team@example.com"),"key",async()=>Response.json({message:"sensitive internal detail"},{status:401})),(error:unknown)=>error instanceof ResendDeliveryError && !error.retryable && error.message==="resend_http_401");
});

test("cron requires the exact bearer secret, including for logged-in browser requests",()=>{
 const secret="a".repeat(40);
 assert.equal(authorizedNotificationCron(new Request("https://app/api/cron/notifications"),secret),false);
 assert.equal(authorizedNotificationCron(new Request("https://app/api/cron/notifications",{headers:{authorization:`Bearer ${secret}`}}),secret),true);
 assert.equal(authorizedNotificationCron(new Request("https://app/api/cron/notifications",{headers:{authorization:"Bearer wrong"}}),secret),false);
 assert.equal(authorizedNotificationCron(new Request("https://app/api/cron/notifications"),undefined),false);
});

test("email activation is idempotent and never changes existing history",async()=>{
 const m=memoryDatabase({...seed(),appSetting:[]});
 await initializeNotificationEmails(m.db,config,now);
 await initializeNotificationEmails(m.db,config,new Date("2026-10-22"));
 assert.equal(m.state().appSetting.length,1);assert.equal(m.state().appSetting[0].value,now.toISOString());
 assert.equal(m.state().notificationEmail.length,0);
});


test("competing workers cannot claim and send the same pending notification twice",async()=>{
 const m=await queued();let calls=0;
 const send=async()=>{calls++;await new Promise<void>(resolve=>setTimeout(resolve,5));return "accepted-once";};
 await Promise.all([dispatchNotificationEmails(m.db,{config,now:()=>now,send,pause:noPause}),dispatchNotificationEmails(m.db,{config,now:()=>now,send,pause:noPause})]);
 assert.equal(calls,1);assert.equal(m.state().notificationEmail[0].status,"sent");
});


test("background task reminders queue for all active assignees without a browser session",async()=>{
 const m=memoryDatabase({...seed(),user:[...seed().user,{id:"second",email:"second@example.com",active:true},{id:"inactive",email:"inactive@example.com",active:false}],task:[
  {id:"mine",title:"My task",assigneeId:"user",dueDate:now,status:"not_started"},
  {id:"second-task",title:"Second task",assigneeId:"second",dueDate:now,status:"in_progress"},
  {id:"inactive-task",title:"Inactive task",assigneeId:"inactive",dueDate:now,status:"not_started"},
  {id:"done-task",title:"Done",assigneeId:"user",dueDate:now,status:"done"},
 ]});
 await notifyAllDueTasks(m.db,now);
 await notifyAllDueTasks(m.db,now);
 assert.equal(m.state().notification.length,2);assert.equal(m.state().notificationEmail.length,2);
 assert.deepEqual(m.state().notification.map(row=>row.userId).sort(),["second","user"]);
});
