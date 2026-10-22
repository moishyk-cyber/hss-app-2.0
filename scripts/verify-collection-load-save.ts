import fs from 'node:fs/promises';
import {createSessionToken} from '../src/lib/session';
async function main(){
 if(process.env.NOTIFICATION_EMAIL_ENABLED!=='false')throw Error('Email must remain off');
 const m=JSON.parse(await fs.readFile('qa-reports/app-stress-manifest.json','utf8'));const token=await createSessionToken(m.userId);
 const routes=['/pipeline','/orders','/deliveries','/service','/tasks','/invoices','/phonebook','/carriers-truckers','/dashboard','/rfq'];
 console.log('50 read requests started; ready to test the browser save.');
 const results=await Promise.all(Array.from({length:50},async(_,i)=>{const at=performance.now();try{const r=await fetch('http://127.0.0.1:3001'+routes[i%routes.length],{headers:{cookie:`hss_session=${token}`},signal:AbortSignal.timeout(60000)});const html=await r.text();const renderError=/\$RX\(|:E\{\\?"digest\\?":|This page hit an error|Something went wrong/.test(html);return{status:r.status,renderError,ms:Math.round(performance.now()-at)}}catch{return{status:0,ms:Math.round(performance.now()-at)}}}));
 await fs.writeFile('qa-reports/collections-save-load.json',JSON.stringify({at:new Date(),requests:50,results},null,2));console.log(JSON.stringify({requests:50,failures:results.filter(r=>r.status!==200 || ("renderError" in r && r.renderError)).length,maxMs:Math.max(...results.map(r=>r.ms))}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
