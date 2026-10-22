import { requireTestDatabase } from "../src/lib/environmentMode";
/** Explicit, additive QA fixtures. Preserve every fixture until the user reviews it. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { createSessionToken } from "../src/lib/session";
import { createLineItemPricing } from "../src/lib/workflows/pricing";
import { logPurchaseOrder } from "../src/lib/workflows/purchaseOrders";
import { createFulfillment } from "../src/lib/workflows/fulfillment";
import { addServiceNote } from "../src/lib/workflows/serviceNotes";
import { notifyDueTasks } from "../src/lib/notifications";
import { notificationEmailConfig } from "../src/lib/resendEmail";

const db = new PrismaClient({ datasourceUrl: requireTestDatabase() });
const reportDir = "qa-reports";
type Manifest = { run: string; userId: string; startedAt: string };
const manifestFile = `${reportDir}/app-stress-manifest.json`;
const date = new Date();
const day = (n: number) => new Date(date.getTime()+n*86400000);
async function read(): Promise<Manifest> {return JSON.parse(await fs.readFile(manifestFile,"utf8"));}
async function write(name: string, result: unknown) {await fs.writeFile(`${reportDir}/${name}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
function noEmail() {assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED,"false");assert.equal(notificationEmailConfig(),null);}

async function setup() {
  noEmail();
  try {await fs.access(manifestFile);throw new Error("Fixture manifest exists; do not overwrite it.");}
  catch(e) {if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;}
  const user=await db.user.findFirstOrThrow({where:{active:true,name:{contains:"Joseph Castillo",mode:"insensitive"}},select:{id:true}});
  const m: Manifest={run:`qaapp_${Date.now().toString(36)}`,userId:user.id,startedAt:new Date().toISOString()};
  await fs.mkdir(reportDir,{recursive:true});await fs.writeFile(manifestFile,JSON.stringify(m,null,2));
  const id=(kind:string,i:number)=>`${m.run}_${kind}_${i}`;
  const label=(kind:string,i:number)=>`[LOAD TEST] ${kind} ${String(i+1).padStart(3,"0")}`;
  const notes=`[LOAD TEST] ${m.run} — synthetic review fixtures. Do not fulfill, invoice or contact.`;
  const started=performance.now();
  await db.company.createMany({data:Array.from({length:40},(_,i)=>({id:id("company",i),name:label(i<30?"Customer":"Supplier",i),type:i<30?"customer":"supplier",deliveryAddress:`${100+i} QA Test Street, Test City`,locationName:"QA test site",phone:"2025550100",email:`qa-${i}@example.invalid`,notes,requiresDeposit:true,depositPercent:30}))});
  await db.contact.createMany({data:Array.from({length:60},(_,i)=>({id:id("contact",i),firstName:"LOAD TEST",lastName:`Contact ${i+1}`,companyId:id("company",i%30),email:`contact-${i}@example.invalid`,phone:"2025550100",notes}))});
  await db.location.createMany({data:Array.from({length:30},(_,i)=>({id:id("location",i),companyId:id("company",i),name:label("Site",i),address:`${100+i} QA Test Street, Test City`,isDefault:true}))});
  await db.opportunity.createMany({data:Array.from({length:200},(_,i)=>({id:id("deal",i),title:label("Intake / quote",i),companyId:id("company",i%30),primaryContactId:id("contact",i%60),salespersonId:m.userId,stage:["new","estimating","proposal_sent","negotiation","lost"][i%5],orderType:i%3===0?"project":"order",needsPricing:i%5<2,neededByDate:day(30),locationId:id("location",i%30),locationName:label("Site",i%30),deliveryAddress:`${100+i%30} QA Test Street, Test City`,notes}))});
  await db.intakeSubmission.createMany({data:Array.from({length:200},(_,i)=>({id:id("intake",i),payload:JSON.stringify({qaRun:m.run,title:label("Intake / quote",i),testOnly:true}),processed:true,resultType:"opportunity",resultId:id("deal",i)}))});
  const statuses=["awaiting_payment","payment_received","pos_in_progress","pos_in_progress","in_transit","delivery_scheduled","delivered","complete","stuck","awaiting_payment"];
  await db.order.createMany({data:Array.from({length:100},(_,i)=>({id:id("order",i),title:label("Order",i),companyId:id("company",i%30),contactId:id("contact",i%60),ownerId:m.userId,orderType:"order",status:statuses[i%10],orderValue:1000,paymentTerms:"full_upfront",salesOrderSentAt:i%10>=2&&i%10<=7?date:null,locationId:id("location",i%30),deliveryAddress:`${100+i%30} QA Test Street, Test City`,neededByDate:day(i%20-5),notes}))});
  await db.payment.createMany({data:Array.from({length:100},(_,i)=>({id:id("payment",i),orderId:id("order",i),type:"full",amount:1000,status:i%10>=1&&i%10<=8?"paid":"invoiced",date:i%10>=1&&i%10<=8?date:null,dueDate:day(i%14-3),quickbooksRef:`QA-DO-NOT-INVOICE-${i+1}`,notes}))});
  const poIndices=Array.from({length:100},(_,i)=>i).filter(i=>i%10>=2&&i%10<=7);
  await db.purchaseOrder.createMany({data:poIndices.map(i=>({id:id("po",i),orderId:id("order",i),supplierId:id("company",30+i%10),poNumber:`QA-${m.run.slice(-8)}-${i+1}`,autoQuotesPoNumber:`QA-${m.run.slice(-8)}-${i+1}`,status:i%10===2?"draft":i%10===3?"acknowledged":i%10<=5?"shipped":"received",expectedDate:day(10),notes}))});
  const deliveryIndices=poIndices.filter(i=>i%10>=3);
  await db.delivery.createMany({data:deliveryIndices.map(i=>({id:id("delivery",i),orderId:id("order",i),purchaseOrderId:id("po",i),mode:"manufacturer_to_customer",status:i%10===3?"pending":i%10===4?"in_transit":i%10===5?"scheduled":"delivered_full",expectedDelivery:day(10),scheduledDeliveryDate:i%10>=5?day(10):null,trackingCarrier:"[LOAD TEST] QA Carrier",trucker:"[LOAD TEST] QA Trucker",deliveredAt:i%10>=6?date:null,notes}))});
  await db.lineItem.createMany({data:Array.from({length:1500},(_,i)=>{
    const orderItem=i>=1000;const parent=Math.floor((orderItem?i-1000:i)/5);const stage=parent%10;
    return {id:id("item",i),...(orderItem?{orderId:id("order",parent)}:{opportunityId:id("deal",parent)}),name:label("Equipment",i),qty:1,supplierId:id("company",30+parent%10),assigneeId:m.userId,rfqStatus:orderItem?"approved":["needs_pricing","rfq_sent","quote_received","approved","removed"][parent%5],unitPrice:orderItem?200:null,unitCost:orderItem?150:null,deliveryStatus:orderItem&&stage>=6&&stage<=7?"arrived_complete":orderItem&&stage>=4&&stage<=5?"in_transit_to_client":orderItem&&stage>=2&&stage<=3?"ordered":"pending",...(orderItem&&stage>=2&&stage<=7?{purchaseOrderId:id("po",parent)}:{}),...(orderItem&&stage>=3&&stage<=7?{deliveryId:id("delivery",parent)}:{}),notes};
  })});
  await db.serviceIssue.createMany({data:Array.from({length:60},(_,i)=>({id:id("service",i),title:label("Service issue",i),description:notes,companyId:id("company",i%30),orderId:id("order",i),assigneeId:m.userId,status:["open","in_progress","resolved"][i%3],priority:["low","medium","high"][i%3]}))});
  await db.task.createMany({data:Array.from({length:300},(_,i)=>({id:id("task",i),title:label("Task",i),notes,assigneeId:m.userId,dueDate:day(i%10-3),status:["not_started","in_progress","done","stuck"][i%4],priority:["low","medium","high","critical"][i%4],linkedType:i%2?"order":"opportunity",linkedId:i%2?id("order",i%100):id("deal",i%200)}))});
  await write("app-stress-setup",{...m,elapsedMs:Math.round(performance.now()-started),counts:{companies:40,contacts:60,locations:30,deals:200,intakes:200,orders:100,items:1500,invoices:100,purchaseOrders:poIndices.length,deliveries:deliveryIndices.length,serviceIssues:60,tasks:300},emailEnabled:false,deleted:false});
}

async function workflow() {
  noEmail();const m=await read();const started=performance.now();const checks:string[]=[];
  const mark=(name:string)=>{checks.push(name);console.log(`PASS ${name}`);};
  const ids=(kind:string,i:number)=>`${m.run}_${kind}_${i}`;
  const effects={audit:async(id:string,action:string,detail:string)=>{await db.activityLog.create({data:{userId:m.userId,userName:"Joseph Castillo",linkedType:"order",linkedId:id,action,detail:`[LOAD TEST] ${detail}`,notificationProcessedAt:new Date()}});},refresh:()=>{}};
  const pricing=createLineItemPricing(db,{...effects,audit:effects.audit});
  // Ten distinct live records concurrently exercise real pricing transactions and reconciliation.
  const pricingIds=Array.from({length:10},(_,i)=>ids("item",i*25));
  await Promise.all(pricingIds.map(id=>pricing.change(id,{kind:"status",rfqStatus:"quote_received"})));
  assert.equal(await db.lineItem.count({where:{id:{in:pricingIds},rfqStatus:"quote_received",unitPrice:null}}),10);mark("10 concurrent RFQ quote updates preserve blank quote prices");
  const orderId=ids("workflow",0);
  await db.order.create({data:{id:orderId,title:"[LOAD TEST] End-to-end payment → PO → delivery",companyId:ids("company",0),ownerId:m.userId,orderType:"order",orderValue:1000,status:"awaiting_payment",deliveryAddress:"100 QA Test Street, Test City",neededByDate:day(15),paymentTerms:"full_upfront",notes:`[LOAD TEST] ${m.run}`}});
  const item=await db.lineItem.create({data:{id:ids("workflowitem",0),orderId,name:"[LOAD TEST] Workflow oven",qty:1,unitPrice:1000,supplierId:ids("company",30),rfqStatus:"approved"}});
  const poInput={orderId,supplierId:ids("company",30),lineItemIds:[item.id],number:`QA-FLOW-${m.run.slice(-8)}`,expectedDate:day(10).toISOString().slice(0,10)};
  await assert.rejects(logPurchaseOrder(db,poInput));mark("Unpaid order cannot create PO");
  await db.payment.create({data:{id:ids("workflowpayment",0),orderId,type:"full",amount:1000,status:"paid",date,notes:`[LOAD TEST] ${m.run}`}});
  await assert.rejects(logPurchaseOrder(db,poInput),/sales order/i);mark("Payment alone cannot bypass sales-order confirmation");
  const po=await logPurchaseOrder(db,poInput);
  assert.equal(po.poNumber,poInput.number);assert.equal(po.expectedDate?.toISOString().slice(0,10),poInput.expectedDate);mark("Sales order confirmation enables AutoQuotes PO with expected date");
  const fulfillment=createFulfillment(db,effects);
  assert.equal((await fulfillment.advancePoStatus(po.id)).ok,true);
  assert.equal((await fulfillment.acknowledgePo(po.id,{mode:"manufacturer_to_customer",trackingCarrier:"[LOAD TEST] QA Carrier"})).ok,true);
  const delivery=await db.delivery.findFirstOrThrow({where:{purchaseOrderId:po.id}});
  await fulfillment.acknowledgePo(po.id,{mode:"manufacturer_to_customer",trackingCarrier:"[LOAD TEST] QA Carrier"});
  assert.equal(await db.delivery.count({where:{purchaseOrderId:po.id}}),1);mark("PO acknowledgment is idempotent and creates exactly one delivery");
  assert.equal((await fulfillment.advancePoStatus(po.id)).ok,true);
  assert.equal((await fulfillment.setDeliveryStatus(delivery.id,"delivered_full")).ok,true);
  const saved=await db.lineItem.findUniqueOrThrow({where:{id:item.id}});
  assert.equal(saved.deliveryStatus,"arrived_complete");mark("Shipment and full delivery update the item and order");
  const note=await addServiceNote(db,ids("service",0),`[LOAD TEST] ${m.run} — service note with author and date`,{id:m.userId,name:"Joseph Castillo"});
  assert.equal(note.note.userId,m.userId);assert.ok(note.note.at);mark("Customer-service updates persist note, user and date");
  await notifyDueTasks(db,m.userId);const before=await db.notification.count({where:{userId:m.userId,eventKey:{contains:m.run}}});
  await notifyDueTasks(db,m.userId);assert.equal(await db.notification.count({where:{userId:m.userId,eventKey:{contains:m.run}}}),before);mark("Real due tasks generate in-app alerts without duplicate reminders");
  assert.equal(await db.notificationEmail.count({where:{notification:{eventKey:{contains:m.run}}}}),0);mark("No email jobs were queued for the workflow test");
  await write("app-stress-workflow",{run:m.run,elapsedMs:Math.round(performance.now()-started),checks,orderUrl:`http://127.0.0.1:3001/orders/${orderId}`,serviceUrl:`http://127.0.0.1:3001/service/${ids("service",0)}`,emailJobs:0,deleted:false});
}

async function volume() {
  noEmail();const m=await read();const started=performance.now();
  const id=(kind:string,i:number)=>`${m.run}_${kind}_${i}`;
  const notes=`[LOAD TEST] ${m.run} — synthetic review fixtures. Do not fulfill, invoice or contact.`;
  for(let offset=200;offset<5000;offset+=200){
    const indices=Array.from({length:Math.min(200,5000-offset)},(_,i)=>offset+i);
    await db.opportunity.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("deal",i),title:`[LOAD TEST] Intake / quote ${String(i+1).padStart(4,"0")}`,companyId:id("company",i%30),primaryContactId:id("contact",i%60),salespersonId:m.userId,stage:["new","estimating","proposal_sent","negotiation","lost"][i%5],orderType:i%3===0?"project":"order",needsPricing:i%5<2,neededByDate:day(30),locationId:id("location",i%30),locationName:`[LOAD TEST] Site ${i%30+1}`,deliveryAddress:`${100+i%30} QA Test Street, Test City`,notes}))});
    await db.intakeSubmission.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("intake",i),payload:JSON.stringify({qaRun:m.run,title:`[LOAD TEST] Intake / quote ${i+1}`,testOnly:true}),processed:true,resultType:"opportunity",resultId:id("deal",i)}))});
    for(let itemOffset=0;itemOffset<indices.length*5;itemOffset+=250){
      await db.lineItem.createMany({skipDuplicates:true,data:Array.from({length:Math.min(250,indices.length*5-itemOffset)},(_,j)=>{
        const sequence=offset*5+itemOffset+j;const parent=Math.floor(sequence/5);
        return {id:id("volumeitem",sequence),opportunityId:id("deal",parent),name:`[LOAD TEST] Equipment ${String(sequence+1).padStart(5,"0")}`,qty:1,supplierId:id("company",30+parent%10),assigneeId:m.userId,rfqStatus:["needs_pricing","rfq_sent","quote_received","approved","removed"][parent%5],notes};
      })});
    }
    console.log(JSON.stringify({intakesPreparedThrough:Math.min(offset+200,5000),elapsedSeconds:Math.round((performance.now()-started)/1000)}));
  }
  const counts={intakes:await db.intakeSubmission.count({where:{id:{startsWith:`${m.run}_intake_`}}}),deals:await db.opportunity.count({where:{id:{startsWith:m.run}}}),items:await db.lineItem.count({where:{id:{startsWith:m.run}}})};
  assert.equal(counts.intakes,5000);assert.equal(counts.deals,5000);assert.equal(counts.items,25501);
  await write("app-stress-volume",{run:m.run,counts,elapsedMs:Math.round(performance.now()-started),emailEnabled:false,deleted:false});
}

async function http() {
  noEmail();const m=await read();const token=await createSessionToken(m.userId);const origin="http://127.0.0.1:3001";
  const summary:unknown[]=[];
  async function load(label:string,routes:string[],requests:number,concurrency:number) {
    let cursor=0;const samples:number[]=[];const failures:{route:string;status:number|string}[]=[];const started=performance.now();
    await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<requests){const route=routes[cursor++%routes.length];const at=performance.now();try{
      const response=await fetch(origin+route,{headers:{cookie:`hss_session=${token}`},redirect:"manual",signal:AbortSignal.timeout(60000)});const body=await response.text();samples.push(performance.now()-at);
      const markup=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
      if(response.status!==200||/<h2[^>]*>(?:This page hit an error|That record isn(?:’|&rsquo;|&#x27;|')t here)<\/h2>/.test(markup))failures.push({route,status:response.status});
      if(route==="/api/notifications"&&response.ok){const feed=JSON.parse(body);assert.equal(feed.latest.length,5);}
    }catch{failures.push({route,status:"timeout_or_invalid_response"});}}}));
    samples.sort((a,b)=>a-b);const percentile=(n:number)=>Math.round(samples[Math.min(samples.length-1,Math.floor(samples.length*n))]??0);
    const result={label,requests,concurrency,wallMs:Math.round(performance.now()-started),p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:percentile(1),failures};summary.push(result);console.log(JSON.stringify(result));
  }
  const lists=["/dashboard","/pipeline","/rfq","/orders","/deliveries","/carriers-truckers","/invoices","/service","/phonebook","/tasks","/notifications"];
  const details=[`/pipeline/${m.run}_deal_0`,`/orders/${m.run}_order_5`,`/purchase-orders/${m.run}_po_5`,`/deliveries/${m.run}_delivery_5`,`/service/${m.run}_service_0`,`/tasks/${m.run}_task_0`];
  await load("warmup",[...lists,...details],lists.length+details.length,2);
  await load("main pages — 5 concurrent",lists,44,5);
  await load("main pages — 20 concurrent",lists,44,20);
  await load("main pages — 50 concurrent",lists,110,50);
  await load("notification feed — 50 concurrent",["/api/notifications"],150,50);
  await load("details and filtered lists",[...details,"/notifications?records=240","/notifications?scope=unread&records=240","/notifications?q=LOAD%20TEST","/orders?f_title=LOAD%20TEST","/pipeline?f_title=LOAD%20TEST"],33,5);
  const searches=[
    {route:"/pipeline?f_title=Intake%20%2F%20quote%20196",expected:`${m.run}_deal_195`},
    {route:"/orders?f_title=Order%20099",expected:`${m.run}_order_98`},
    {route:"/tasks?f_title=Task%20298",expected:`${m.run}_task_297`},
    {route:"/service?f_title=Service%20issue%20059",expected:`${m.run}_service_58`},
    {route:"/rfq?f_name=Equipment%20126",expected:`${m.run}_item_125`},
    {route:"/pipeline?view=list&f_title=Intake%20%2F%20quote%204996",expected:`${m.run}_deal_4995`},
    {route:"/phonebook?q=Contact%2059",expected:`${m.run}_contact_58`},
    {route:"/notifications?q=%5BLOAD%20TEST%5D%200001",expected:"[LOAD TEST] 0001"},
  ];
  const searchResults=[];
  for(const search of searches){const response=await fetch(origin+search.route,{headers:{cookie:`hss_session=${token}`},signal:AbortSignal.timeout(60000)});const body=await response.text();searchResults.push({route:search.route,found:response.ok&&body.includes(search.expected)});}
  summary.push({label:"global search finds specific records outside the initial visible rows",searchResults});
  const sorting=[];
  for(const direction of ["asc","desc"] as const){
    const first=await db.opportunity.findFirstOrThrow({where:{stage:{notIn:["won","lost"]},title:{contains:"[LOAD TEST]",mode:"insensitive"}},orderBy:[{title:direction},{id:"asc"}],select:{id:true,title:true}});
    const route=`/pipeline?view=list&f_title=LOAD%20TEST&sort=title:${direction}`;
    const response=await fetch(origin+route,{headers:{cookie:`hss_session=${token}`},signal:AbortSignal.timeout(60000)});const html=await response.text();
    const firstRow=html.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??"";
    sorting.push({route,expectedFirstTitle:first.title,pass:response.ok&&firstRow.includes(first.id)});
  }
  summary.push({label:"global sorting across all 5,000 intakes",sorting});
  await write("app-stress-http",{run:m.run,baseUrl:origin,results:summary,notes:"Local production build with remote real PostgreSQL; includes database network latency. Email disabled. HTTP concurrency is not the same as a sustained active-user count."});
}

async function writes() {
  noEmail();const m=await read();const token=await createSessionToken(m.userId);const origin="http://127.0.0.1:3001";
  const started=performance.now();
  const results=await Promise.all(Array.from({length:10},async(_,i)=>{
    const id=`${m.run}_order_${i}`;const terms=`[LOAD TEST] ${m.run} — concurrent API save ${i+1}. Synthetic payment terms.`;
    const response=await fetch(`${origin}/api/orders/${id}/workflow`,{method:"POST",headers:{cookie:`hss_session=${token}`,origin,"Content-Type":"application/json"},body:JSON.stringify({action:"updateOrderTermsText",args:[id,terms]}),signal:AbortSignal.timeout(60000)});
    const result=await response.json();const saved=await db.order.findUniqueOrThrow({where:{id},select:{termsNotes:true}});
    return {record:i+1,status:response.status,pass:response.ok&&result.ok===true&&saved.termsNotes===terms};
  }));
  const unauthorized=await fetch(`${origin}/api/orders/${m.run}_order_0/workflow`,{method:"POST",headers:{cookie:`hss_session=${token}`,origin:"https://foreign.example","Content-Type":"application/json"},body:JSON.stringify({action:"updateOrderTermsText",args:[`${m.run}_order_0`,"Cross-site change must fail"]})});
  const emailJobs=await db.notificationEmail.count({where:{notification:{eventKey:{contains:m.run}}}});
  const result={run:m.run,concurrentWrites:10,elapsedMs:Math.round(performance.now()-started),results,crossOriginStatus:unauthorized.status,emailJobs,pass:results.every(row=>row.pass)&&unauthorized.status===403&&emailJobs===0};
  await write("app-stress-writes",result);assert.equal(result.pass,true);
}

async function main(){try{if(process.argv[2]==="setup")await setup();else if(process.argv[2]==="workflow")await workflow();else if(process.argv[2]==="volume")await volume();else if(process.argv[2]==="http")await http();else if(process.argv[2]==="writes")await writes();else throw new Error("Use setup, volume, workflow, http or writes. No automatic deletion.");}finally{await db.$disconnect();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
