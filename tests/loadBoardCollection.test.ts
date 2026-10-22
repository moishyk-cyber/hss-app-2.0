import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBoardCollection} from '../src/lib/loadBoardCollection';
test('explicit global sorting takes the first full window, even if all top results belong to one lane',async()=>{
 const rows=Array.from({length:5000},(_,i)=>({id:String(i),lane:i<4000?'busy':'quiet'}));
 let calls=0;
 const result=await loadBoardCollection(async(where:{filtered:boolean},take)=>{assert.equal(where.filtered,true);calls++;return rows.slice(0,take);},{filtered:true},120,[],()=>({filtered:true}),()=>({filtered:true}));
 assert.equal(calls,1);
 assert.deepEqual(result.rows.map(r=>r.id),rows.slice(0,120).map(r=>r.id));
 assert.equal(result.hasMore,true);
});
