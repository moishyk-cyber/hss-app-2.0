import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CollectionSnapshot, CollectionGroupScope, useTableRecordIds, useCollectionTotal} from '../src/lib/CollectionScope';
import {collectionSnapshot} from '../src/lib/collectionIndex';

// These providers require children in their TypeScript props, including with createElement.
/* eslint-disable react/no-children-prop */

test('a sparse group renders its loaded record beyond the first global batch',()=>{
 const index=Array.from({length:5000},(_,i)=>({id:String(i),groups:{status:i===4999?'pending':'paid'}}));
 const window=collectionSnapshot(index,120);
 assert.ok(window.ids.includes('4999'));
 function Probe(){
  const allowed=useTableRecordIds();
  return createElement('output',null,JSON.stringify({visible:!allowed||allowed.has('4999'),total:useCollectionTotal()}));
 }
 const grouped=renderToStaticMarkup(createElement(CollectionSnapshot,{data:window.snapshot,children:createElement(CollectionGroupScope,{total:1,children:createElement(Probe)})}));
 assert.match(grouped,/&quot;visible&quot;:true/);
 assert.match(grouped,/&quot;total&quot;:1/);
 const flat=renderToStaticMarkup(createElement(CollectionSnapshot,{data:window.snapshot,children:createElement(Probe)}));
 assert.match(flat,/&quot;visible&quot;:false/,'flat tables retain their globally sorted loading window');
});
