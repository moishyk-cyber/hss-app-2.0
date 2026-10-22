import { requireTestDatabase } from "../src/lib/environmentMode";
/** Add 5,000 fixtures per collection to the existing review run. Never deletes or emails. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { savedPartnerNames, partnerNames } from "../src/lib/workflows/deliveryPartners";

const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED,"false","Pause email before generating fixtures");
 const m=JSON.parse(await fs.readFile("qa-reports/app-stress-manifest.json","utf8")) as {run:string;userId:string};
 const prefix=`${m.run}_scale`;const id=(kind:string,i:number)=>`${prefix}_${kind}_${i}`;
 const label=(kind:string,i:number)=>`[LOAD TEST] ${kind} ${String(i+1).padStart(5,"0")}`;
 const notes=`[LOAD TEST] ${m.run} scale fixtures. Do not contact, bill or fulfill.`;
 const today=new Date();const future=new Date(today.getTime()+30*86400000);
 const start=performance.now();
 await fs.writeFile("qa-reports/app-stress-collections-manifest.json",JSON.stringify({run:m.run,prefix,countPerCollection:5000,carriers:5000,truckers:5000,notes,emailEnabled:false,deleted:false},null,2));
 for(let offset=0;offset<5000;offset+=200){
  const indices=Array.from({length:Math.min(200,5000-offset)},(_,j)=>offset+j);
  await db.company.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("company",i),name:label("Scale customer",i),type:i%10===0?"supplier":"customer",email:`${prefix}-${i}@example.invalid`,phone:"2025550100",deliveryAddress:`${100+i} Synthetic QA Road, Test City`,notes}))});
  await db.contact.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("contact",i),companyId:id("company",i),firstName:"LOAD TEST",lastName:`Scale contact ${String(i+1).padStart(5,"0")}`,email:`contact-${prefix}-${i}@example.invalid`,phone:"2025550100",notes}))});
  const phase=(i:number)=>i%6;
  const status=(i:number)=>["pos_in_progress","delivery_scheduled","in_transit","delivered","complete","stuck"][phase(i)];
  await db.order.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("order",i),companyId:id("company",i),contactId:id("contact",i),ownerId:m.userId,title:label("Scale order",i),orderType:"project",orderValue:2000,depositRequired:1000,paymentTerms:"deposit_balance",quoteStatus:"accepted",salesOrderSentAt:today,termsNotes:notes,status:status(i),neededByDate:future,deliveryAddress:`${100+i} Synthetic QA Road, Test City`,notes}))});
  await db.payment.createMany({skipDuplicates:true,data:indices.flatMap(i=>[
   {id:id("deposit",i),orderId:id("order",i),type:"deposit",amount:1000,status:"paid",date:today,dueDate:future,notes},
   {id:id("balance",i),orderId:id("order",i),type:"final",amount:1000,status:phase(i)===4?"paid":"invoiced",date:phase(i)===4?today:null,dueDate:future,notes},
  ])});
  await db.purchaseOrder.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("po",i),orderId:id("order",i),supplierId:`${m.run}_company_30`,poNumber:`QA-SCALE-${m.run.slice(-6)}-${i+1}`,autoQuotesPoNumber:`QA-SCALE-${m.run.slice(-6)}-${i+1}`,expectedDate:future,status:phase(i)===0?"acknowledged":phase(i)>=3&&phase(i)<=4?"received":"shipped",notes}))});
  await db.delivery.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("delivery",i),orderId:id("order",i),purchaseOrderId:id("po",i),mode:["manufacturer_to_customer","hss_to_customer","manufacturer_to_hss_to_customer"][i%3],status:["pending","scheduled","in_transit","delivered_full","delivered_full","pending"][phase(i)],trackingCarrier:label("Scale carrier",i),trucker:label("Scale trucker",i),expectedDelivery:future,scheduledDeliveryDate:phase(i)===1?future:null,deliveredAt:phase(i)>=3&&phase(i)<=4?today:null,notes}))});
  for(let part=0;part<5;part++)await db.lineItem.createMany({skipDuplicates:true,data:indices.map(i=>({id:id(`item${part}`,i),orderId:id("order",i),purchaseOrderId:id("po",i),deliveryId:id("delivery",i),name:label(`Scale equipment ${part+1}`,i),qty:1,unitPrice:400,unitCost:300,supplierId:`${m.run}_company_30`,rfqStatus:"approved",deliveryStatus:phase(i)>=3&&phase(i)<=4?"arrived_complete":phase(i)===2?"in_transit_to_client":"ordered",notes}))});
  await db.serviceIssue.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("service",i),orderId:id("order",i),companyId:id("company",i),title:label("Scale service",i),description:notes,assigneeId:m.userId,status:phase(i)===4?"resolved":["open","in_progress","resolved","closed"][i%4],priority:["low","medium","high","critical"][i%4]}))});
  await db.task.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("task",i),title:label("Scale task",i),notes,assigneeId:m.userId,dueDate:future,status:["not_started","in_progress","done","stuck"][i%4],priority:["low","medium","high","critical"][i%4],linkedType:"order",linkedId:id("order",i)}))});
  await db.notification.createMany({skipDuplicates:true,data:indices.map(i=>({id:id("notification",i),userId:m.userId,eventKey:id("notification",i),kind:"qa_stress",title:label("Scale notification",i),message:notes,href:`/orders/${id("order",i)}`,readAt:i%4===0?today:null}))});
  console.log(JSON.stringify({prepared:offset+indices.length,elapsedSeconds:Math.round((performance.now()-start)/1000)}));
 }
 for(const [kind,name]of [["carriers","Scale carrier"],["truckers","Scale trucker"]]){
  await db.$transaction(async tx=>{const key=`delivery.${kind}`;const existing=await tx.appSetting.findUnique({where:{key}});const value=JSON.stringify(partnerNames(savedPartnerNames(existing?.value),Array.from({length:5000},(_,i)=>label(name,i))));await tx.appSetting.upsert({where:{key},create:{key,value},update:{value}});},{timeout:30000});
 }
 const counts={companies:await db.company.count({where:{id:{startsWith:prefix}}}),contacts:await db.contact.count({where:{id:{startsWith:prefix}}}),orders:await db.order.count({where:{id:{startsWith:prefix}}}),invoices:await db.payment.count({where:{id:{startsWith:prefix}}}),purchaseOrders:await db.purchaseOrder.count({where:{id:{startsWith:prefix}}}),deliveries:await db.delivery.count({where:{id:{startsWith:prefix}}}),service:await db.serviceIssue.count({where:{id:{startsWith:prefix}}}),tasks:await db.task.count({where:{id:{startsWith:prefix}}}),notifications:await db.notification.count({where:{id:{startsWith:prefix}}})};
 for(const count of Object.values(counts))assert.ok(count>=5000);
 await fs.writeFile("qa-reports/app-stress-collections-counts.json",JSON.stringify({prefix,counts,carriers:5000,truckers:5000,emailEnabled:false,elapsedMs:Math.round(performance.now()-start),deleted:false},null,2));
 console.log(JSON.stringify({counts,emailEnabled:false,deleted:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
