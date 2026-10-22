import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionSnapshot} from '../src/lib/collectionIndex';
import {shareRead,invalidateSharedReads} from '../src/lib/shareRead';
test('lane counts cover all 5000 filtered records and never change with the loading window',()=>{
 const index=Array.from({length:5000},(_,i)=>({id:String(i),groups:{status:i<4000?'new':'received',priority:i%2?'high':'low'}}));
 const small=collectionSnapshot(index,120);const larger=collectionSnapshot(index,240);
 assert.deepEqual(small.snapshot.laneTotals,larger.snapshot.laneTotals);
 assert.deepEqual(small.snapshot.laneTotals.status,{new:4000,received:1000});
 assert.equal(small.snapshot.total,5000);
 assert.deepEqual(small.snapshot.listIds,index.slice(0,120).map(r=>r.id));
 assert.ok(small.ids.includes('4000'),'a busy first lane cannot starve another lane');
 assert.ok(small.ids.length<300,'only a bounded selection is hydrated');
});
test('overlapping reads share work; completed results and different scopes are never cached together',async()=>{
 let finish!:(value:number)=>void;let reads=0;
 const read=()=>{reads++;return new Promise<number>(resolve=>{finish=resolve})};
 const requests=Array.from({length:50},()=>shareRead('scope-a',read));
 await Promise.resolve();assert.equal(reads,1);finish(1);assert.deepEqual(await Promise.all(requests),Array(50).fill(1));
 assert.equal(await shareRead('scope-a',async()=>2),2);
 assert.equal(await shareRead('scope-b',async()=>3),3);
});
test('a committed write invalidates pending reads, and failures can be retried',async()=>{
 let finish!:(n:number)=>void;
 const old=shareRead('changed-record',()=>new Promise<number>(r=>{finish=r}));await Promise.resolve();
 invalidateSharedReads();assert.equal(await shareRead('changed-record',async()=>2),2);finish(1);await old;
 await assert.rejects(shareRead('retry',async()=>{throw Error('offline')}));
 assert.equal(await shareRead('retry',async()=>3),3);
});

test('lane dollar totals include unloaded records, nulls, cents and credits', () => {
 const index = Array.from({ length: 500 }, (_, i) => ({
  id: String(i), amount: i === 0 ? null : i === 1 ? -10.25 : 0.1,
  groups: { phase: i < 400 ? 'deposit' : 'delivery' },
 }));
 const small = collectionSnapshot(index, 30);
 const large = collectionSnapshot(index, 240);
 assert.deepEqual(small.snapshot.laneAmounts, large.snapshot.laneAmounts);
 assert.deepEqual(small.snapshot.laneAmounts.phase, { deposit: 29.55, delivery: 10 });
 assert.ok(small.ids.length < index.length);
 assert.deepEqual(collectionSnapshot([{ id: 'empty', amount: null, groups: { phase: 'deposit' } }], 30).snapshot.laneAmounts.phase, { deposit: 0 });
});
