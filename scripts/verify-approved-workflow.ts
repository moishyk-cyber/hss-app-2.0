import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {dealJourney} from '../src/lib/dealWorkflow';
import {orderBallInput,ORDER_BALL_INCLUDE} from '../src/lib/flow';
import {plainMoney} from '../src/lib/money';
const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED,'false');
 const deal=plainMoney(await db.opportunity.findUniqueOrThrow({where:{id:'qa_approved_workflow_20261021'},include:{lineItems:true,orders:{include:ORDER_BALL_INCLUDE}}}));
 const order=deal.orders[0];assert.ok(order);assert.equal(deal.clientQuoteCreated,true);assert.equal(deal.clientQuoteSent,true);assert.equal(deal.stage,'won');
 const steps=dealJourney(deal,{company:true,neededBy:true},{...orderBallInput(order),id:order.id});
 assert.deepEqual(steps.map(s=>s.label),['Intake','Supplier Quotes','Client Quote','Confirm Deal','Payment','Purchase','Delivery','Close Out']);
 assert.equal(steps[2].state,'complete');assert.equal(steps[3].state,'complete');assert.equal(steps[4].state,'complete');
 assert.equal(order.salesOrderSentAt,null);assert.equal(order.termsNotes,null);
 const emailJobs=await db.notificationEmail.count({where:{notification:{href:{in:[`/pipeline/${deal.id}`,`/orders/${order.id}`]}}}});assert.equal(emailJobs,0);
 const result={at:new Date().toISOString(),dealId:deal.id,orderId:order.id,steps:steps.map(s=>({label:s.label,state:s.state})),quotePersisted:true,termsAndSalesOrderNotRequired:true,emailJobs,deleted:false};
 await fs.writeFile('qa-reports/approved-workflow-verification.json',JSON.stringify(result,null,2));
 await fs.writeFile('qa-reports/approved-workflow-fixture.json',JSON.stringify({id:deal.id,orderId:order.id,title:deal.title,emailEnabled:false,deleted:false},null,2));
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
