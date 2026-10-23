import assert from 'node:assert/strict';
import type { NotificationSnapshot, NotificationUpdate } from '../src/lib/notificationLiveTypes';
import {Resolver} from 'node:dns/promises';
import {PrismaClient} from '@prisma/client';
import {requireTestDatabase} from '../src/lib/environmentMode';
import {createSessionToken,SESSION_COOKIE_NAME} from '../src/lib/session';
async function main(){
 const resolver=new Resolver();resolver.setServers(['1.1.1.1','8.8.8.8']);const url=new URL(requireTestDatabase());url.hostname=(await resolver.resolve4(url.hostname))[0];const db=new PrismaClient({datasourceUrl:url.toString()});
 const abort=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const deadline=setTimeout(()=>abort.abort(),40000);
 try{
  const unauthorized=await fetch('http://127.0.0.1:3001/api/notifications/stream',{redirect:'manual'});assert.ok([401,307].includes(unauthorized.status));
  const users=await db.user.findMany({where:{name:{in:['Joseph Castillo','Herman Freund']}},select:{id:true,name:true}});const joseph=users.find(u=>u.name==='Joseph Castillo')!.id;const herman=users.find(u=>u.name==='Herman Freund')!.id;
  const token=await createSessionToken(joseph);const response=await fetch(`http://127.0.0.1:3001/api/notifications/stream?userId=${herman}`,{headers:{Cookie:`${SESSION_COOKIE_NAME}=${token}`},signal:abort.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type')!,/text\/event-stream/);reader=response.body!.getReader();
  const decoder=new TextDecoder();let buffer='';let all='';
  async function until(event:string){while(true){const boundary=buffer.indexOf('\n\n');if(boundary>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(frame.includes(`event: ${event}\n`)){const data=frame.split('\n').find(line=>line.startsWith('data: '))!;return JSON.parse(data.slice(6));}continue;}const chunk=await reader!.read();if(chunk.done)throw Error('Stream closed early');const text=decoder.decode(chunk.value);all+=text;buffer+=text;}}
  const baseline=await until('snapshot') as NotificationSnapshot;assert.equal(baseline.unread,await db.notification.count({where:{userId:joseph,readAt:null}}));
  const stamp=Date.now();const foreignTitle=`[LOAD TEST] Private to Herman ${stamp}`;
  await db.notification.create({data:{userId:herman,eventKey:`qa_live_private:${stamp}`,kind:'qa_stress',title:foreignTitle,message:'Must never appear in Joseph’s stream.',href:'/notifications'}});
  const before=performance.now();const mine=await db.notification.create({data:{userId:joseph,eventKey:`qa_live_popup:${stamp}`,kind:'qa_stress',title:'[LOAD TEST] Your turn — Confirm Deal',message:'This pop-up arrived live. Open the record to continue the deal.',href:'/notifications'}});
  const inserted=await until('notifications') as NotificationUpdate;assert.ok(inserted.changes.some((event)=>event.notification.id===mine.id));assert.equal(inserted.unread,baseline.unread+1);assert.ok(!all.includes(foreignTitle));
  console.log('SSE authenticated, query cannot change recipient, other-user event excluded, live popup pushed in',Math.round(performance.now()-before),'ms. ID:',mine.id);
  await reader.cancel();abort.abort();
  console.log('HTTP stream tests passed; test records retained; no emails sent.');
 }finally{clearTimeout(deadline);abort.abort();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
