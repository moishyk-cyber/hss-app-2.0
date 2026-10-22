import { requireTestDatabase } from "../src/lib/environmentMode";
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {createSessionToken} from '../src/lib/session';
const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 assert.equal(process.env.NOTIFICATION_EMAIL_ENABLED,'false');
 const m=JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json','utf8'));const p=m.run+'_scale';
 const token=await createSessionToken(m.userId);const results:unknown[]=[];
 async function page(route:string){const r=await fetch('http://127.0.0.1:3001'+route,{headers:{cookie:`hss_session=${token}`},signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return (await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');}
 const checks=[
 ['/pipeline?view=list&f_title=4996',`${m.run}_deal_4995`],
 ['/rfq?f_name=Equipment%2024976',`${m.run}_volumeitem_24975`],
 ['/orders?view=list&f_title=Scale%20order%2005000',`${p}_order_4999`],
 ['/deliveries?f_trucker=Scale%20trucker%2004999',`${p}_delivery_4998`],
 ['/service?f_title=Scale%20service%2005000',`${p}_service_4999`],
 ['/tasks?f_title=Scale%20task%2005000',`${p}_task_4999`],
 ['/invoices?f_order=Scale%20order%2005000',`${p}_order_4999`],
 ['/phonebook?f_name=Scale%20contact%2005000&f_kind=person',`${p}_contact_4999`],
 ['/phonebook?q=Scale%20contact%2005000',`${p}_contact_4999`],
 ['/carriers-truckers?q=Scale%20carrier%2005000&f_kind=carriers','Scale carrier 05000'],
 ['/carriers-truckers?q=Scale%20trucker%2005000&f_kind=truckers','Scale trucker 05000'],
 ['/notifications?q=Scale%20notification%2005000','Scale notification 05000'],
 ];
 for(const [route,expected]of checks){const html=await page(route);const pass=html.includes(expected);results.push({test:'search/filter beyond initial window',route,expected,pass});console.log(JSON.stringify(results.at(-1)));}
 for(const route of ['/orders','/service','/tasks']){
 const name=route.slice(1)==='orders'?'order':route.slice(1)==='tasks'?'task':'service';
 const tree={id:'root',logic:'AND',children:[{id:'a',field:'title',operator:'contains',value:`Scale ${name}`},{id:'b',logic:'OR',children:[{id:'c',field:'title',operator:'contains',value:'05000'},{id:'d',field:'title',operator:'contains',value:'04999'}]}]};
 const html=await page(route+'?view=list&filter_tree='+encodeURIComponent(JSON.stringify(tree)));
 const pass=html.includes(`${p}_${name}_4999`)&&html.includes(`${p}_${name}_4998`)&&!html.includes(`${p}_${name}_4997`);
 results.push({test:'nested AND/OR filters across full dataset',route,pass});console.log(JSON.stringify(results.at(-1)));
 }
 for(const dir of ['asc','desc']as const){
 const specs=[
 {route:'/pipeline',field:'title',filter:'f_title=LOAD%20TEST',expected:(await db.opportunity.findFirstOrThrow({where:{stage:{notIn:['won','lost']},title:{contains:'[LOAD TEST]'}},orderBy:[{title:dir},{id:'asc'}]})).id},
 {route:'/orders',field:'title',filter:'f_title=Scale%20order',expected:(await db.order.findFirstOrThrow({where:{id:{startsWith:p}},orderBy:[{title:dir},{id:'asc'}]})).id},
 {route:'/service',field:'title',filter:'f_title=Scale%20service',expected:(await db.serviceIssue.findFirstOrThrow({where:{id:{startsWith:p}},orderBy:[{title:dir},{id:'asc'}]})).id},
 {route:'/tasks',field:'title',filter:'f_title=Scale%20task',expected:(await db.task.findFirstOrThrow({where:{id:{startsWith:p}},orderBy:[{title:dir},{id:'asc'}]})).id},
 ];
 for(const s of specs){const html=await page(`${s.route}?view=list&group=none&${s.filter}&sort=${s.field}:${dir}`);const first=html.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'';const pass=first.includes(s.expected);results.push({test:'global sort',route:s.route,dir,expected:s.expected,pass});console.log(JSON.stringify(results.at(-1)));}
 const html=await page('/carriers-truckers?q=Scale%20carrier&sort=name:'+dir);const first=html.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'';const pass=first.includes(dir==='asc'?'Scale carrier 00001':'Scale carrier 05000');results.push({test:'global carrier sort',dir,pass});console.log(JSON.stringify(results.at(-1)));
 }
 for(const dir of ['asc','desc'] as const){
  const invoices=await db.payment.findFirstOrThrow({where:{orderId:{startsWith:p}},orderBy:[{order:{title:dir}},{id:'asc'}]});
  const invoiceHtml=await page('/invoices?view=list&group=none&f_order=Scale%20order&sort=order:'+dir);
  results.push({test:'global invoice sort',dir,pass:(invoiceHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'').includes(invoices.id)});
  const expectedDelivery=await db.delivery.findFirstOrThrow({where:{trucker:{contains:'Scale trucker'}},orderBy:[{trucker:dir},{id:'asc'}]});
  const deliveryHtml=await page('/deliveries?group=none&f_trucker=Scale%20trucker&sort=trucker:'+dir);
  results.push({test:'global delivery sort',dir,pass:(deliveryHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'').includes(expectedDelivery.id)});
  const phoneHtml=await page('/phonebook?f_kind=person&q=Scale%20contact&sort=name:'+dir);
  results.push({test:'global phonebook sort',dir,pass:(phoneHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'').includes(dir==='asc'?'Scale contact 00001':'Scale contact 05000')});
  const rfqHtml=await page('/rfq?group=none&f_name=Equipment&sort=name:'+dir);
  const rfqExpected=await db.lineItem.findFirstOrThrow({where:{name:{contains:'Equipment'},rfqStatus:{in:['needs_pricing','rfq_sent','quote_received','priced_in_autoquotes']},OR:[{orderId:{not:null}},{opportunity:null},{opportunity:{stage:{notIn:['won','lost']}}}]},orderBy:[{name:dir},{id:'asc'}]});
  results.push({test:'global RFQ sort',dir,pass:(rfqHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tr>/)?.[1]??'').includes(rfqExpected.id)});
 }
 const emailJobs=await db.notificationEmail.count({where:{notification:{id:{startsWith:p}}}});
 results.push({test:'no email jobs for volume fixtures',pass:emailJobs===0,emailJobs});
 await fs.writeFile('qa-reports/collections-verification.json',JSON.stringify({at:new Date(),results},null,2));
 assert.ok(results.every(r=>(r as {pass:boolean}).pass),'One or more collection checks failed');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
