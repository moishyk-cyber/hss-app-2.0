import fs from 'node:fs/promises';
import {createSessionToken} from '../src/lib/session';
async function main(){
const manifest=JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json','utf8'));
if(process.env.NOTIFICATION_EMAIL_ENABLED!=='false')throw Error('Email must remain off');
const token=await createSessionToken(manifest.userId);
const routes=['/dashboard','/pipeline?view=list','/pipeline?view=kanban','/rfq','/orders?view=list','/orders?view=kanban','/deliveries','/service','/tasks','/invoices','/phonebook','/carriers-truckers','/notifications'];
const results=[];
for(const route of routes){const start=performance.now();try {const r=await fetch('http://127.0.0.1:3001'+route,{headers:{cookie:`hss_session=${token}`},signal:AbortSignal.timeout(60000)});const html=await r.text();const result={route,status:r.status,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(html),error:/Something went wrong|That record isn’t there|Application error/.test(html)};results.push(result);console.log(JSON.stringify(result));}catch(e){results.push({route,error:String(e)});console.log(route,String(e));}}
await fs.writeFile(`qa-reports/collections-${process.argv[2]??'current'}.json`,JSON.stringify({at:new Date(),results},null,2));

}
main().catch(e=>{console.error(e);process.exitCode=1});
