import { requireTestDatabase } from "../src/lib/environmentMode";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED,'false','Email must remain disabled during this test');
 const manifest=JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json','utf8'));
 const company=await db.company.findFirstOrThrow({where:{id:{startsWith:manifest.run}},select:{id:true}});
 const id='qa_approved_workflow_20261021';
 const deal=await db.opportunity.upsert({where:{id},update:{},create:{id,title:'[LOAD TEST] Approved eight-step workflow',companyId:company.id,salespersonId:manifest.userId,stage:'estimating',orderType:'project',needsPricing:true,neededByDate:new Date('2026-11-10'),deliveryAddress:'[LOAD TEST] 100 QA Test Street',lineItems:{create:{id:id+'_item',name:'[LOAD TEST] Workflow oven',qty:1,rfqStatus:'quote_received'}}}});
 await fs.writeFile('qa-reports/approved-workflow-fixture.json',JSON.stringify({id:deal.id,title:deal.title,emailEnabled:false,deleted:false},null,2));
 console.log(JSON.stringify({id:deal.id,title:deal.title,emailEnabled:false}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixture failed');process.exitCode=1;}).finally(()=>db.$disconnect());
