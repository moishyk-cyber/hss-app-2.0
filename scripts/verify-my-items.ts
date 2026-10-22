import { requireTestDatabase } from "../src/lib/environmentMode";
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {createSessionToken} from '../src/lib/session';
import {RFQ_QUEUE_STATUSES} from '../src/app/rfq/queue-statuses';
const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 const m=JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json','utf8'));const cookie=`hss_session=${await createSessionToken(m.userId)}`;
 const queues=[
  {kind:'deals',rows:await db.opportunity.findMany({where:{salespersonId:m.userId,stage:{notIn:['won','lost']}},orderBy:[{nextFollowUp:'asc'},{createdAt:'desc'},{id:'asc'}],take:48,select:{id:true}})},
  {kind:'orders',rows:await db.order.findMany({where:{ownerId:m.userId,status:{not:'complete'}},orderBy:[{neededByDate:'asc'},{createdAt:'desc'},{id:'asc'}],take:48,select:{id:true}})},
  {kind:'tasks',rows:await db.task.findMany({where:{assigneeId:m.userId,status:{not:'done'}},orderBy:[{dueDate:'asc'},{createdAt:'desc'},{id:'asc'}],take:48,select:{id:true}})},
  {kind:'pricing',rows:await db.lineItem.findMany({where:{assigneeId:m.userId,rfqStatus:{in:RFQ_QUEUE_STATUSES.map(s=>s.value)},OR:[{orderId:{not:null}},{opportunityId:null},{opportunity:{stage:{notIn:['won','lost']}}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:48,select:{id:true}})},
 ];
 const results=[];
 for(const q of queues){
  const first=await fetch(`http://127.0.0.1:3001/api/dashboard/my-items?kind=${q.kind}&cursor=${q.rows[7].id}`,{headers:{cookie}});assert.equal(first.status,200);const a=await first.json();
  assert.deepEqual(a.rows.map((r:{id:string})=>r.id),q.rows.slice(8,28).map(r=>r.id));assert.equal(a.hasMore,true);
  const second=await fetch(`http://127.0.0.1:3001/api/dashboard/my-items?kind=${q.kind}&cursor=${a.cursor}`,{headers:{cookie}});const b=await second.json();
  assert.deepEqual(b.rows.map((r:{id:string})=>r.id),q.rows.slice(28,48).map(r=>r.id));
  assert.equal(new Set([...a.rows,...b.rows].map((r:{id:string})=>r.id)).size,40);
  results.push({kind:q.kind,firstBatch:20,secondBatch:20,orderAndOwnership:true,duplicates:0,pass:true});console.log(JSON.stringify(results.at(-1)));
 }
 const signedOut=await fetch('http://127.0.0.1:3001/api/dashboard/my-items?kind=tasks',{redirect:'manual'});assert.equal(signedOut.status,307);assert.ok(signedOut.headers.get('location')?.endsWith('/login'));
 const invalid=await fetch('http://127.0.0.1:3001/api/dashboard/my-items?kind=other',{headers:{cookie}});assert.equal(invalid.status,400);
 await fs.writeFile('qa-reports/my-items-verification.json',JSON.stringify({results,signedOutStatus:signedOut.status,invalidStatus:invalid.status},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
