import test from 'node:test';
import assert from 'node:assert/strict';
import {planTestTransfer,tableInsertOrder} from '../src/lib/testDataTransfer';
const relations=[{table:'Order',column:'companyId',parent:'Company',parentColumn:'id'},{table:'Payment',column:'orderId',parent:'Order',parentColumn:'id'},{table:'NotificationEmail',column:'notificationId',parent:'Notification',parentColumn:'id'}];
test('move includes fixture children, files and notifications, while real dependencies are copied only',()=>{
 const rows={Company:[{id:'real-company',name:'Customer'}],Order:[{id:'qa_order',title:'[LOAD TEST] Order',companyId:'real-company'},{id:'real-order',title:'Real work',companyId:'real-company'}],Payment:[{id:'random-payment',orderId:'qa_order'},{id:'real-payment',orderId:'real-order'}],Document:[{id:'file',linkedId:'qa_order'}],Notification:[{id:'alert',eventKey:'order:qa_order:1:payment'},{id:'real-alert',eventKey:'order:real-order:1:payment'}],NotificationEmail:[{id:'email',notificationId:'alert'}],User:[{id:'real-user'}],AppSetting:[],FieldRequirement:[],RolePermission:[]};
 const plan=planTestTransfer(rows,relations,[]);
 assert.deepEqual(plan.move.Order,['qa_order']);assert.deepEqual(plan.move.Payment,['random-payment']);
 assert.deepEqual(plan.move.Document,['file']);assert.deepEqual(plan.move.Notification,['alert']);assert.deepEqual(plan.move.NotificationEmail,['email']);
 assert.deepEqual(plan.move.Company,[]);assert.deepEqual(plan.copied.Company,rows.Company);assert.deepEqual(plan.move.User,[]);assert.deepEqual(plan.conflicts,[]);
});
test('real work linked to a synthetic customer blocks cleanup instead of silently moving it',()=>{
 const plan=planTestTransfer({Company:[{id:'qa_customer',name:'[LOAD TEST] Customer'}],Order:[{id:'real-order',title:'Customer order',companyId:'qa_customer'}]},relations.slice(0,1),[]);
 assert.deepEqual(plan.conflicts,['Order:real-order']);assert.deepEqual(plan.move.Order,[]);
});
test('generic names containing test are preserved and children are deleted before their parents',()=>{
 const plan=planTestTransfer({Company:[{id:'real',name:'123 Test'}],Order:[],Payment:[]},relations.slice(0,2),[]);
 assert.deepEqual(plan.move.Company,[]);assert.deepEqual(tableInsertOrder(['Payment','Order','Company'],relations.slice(0,2)),['Company','Order','Payment']);
});
