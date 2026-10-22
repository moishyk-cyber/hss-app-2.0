import type {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {plainMoney,type PlainMoney} from './money';
import {opportunityBall,orderBall,type OrderBallInput} from './ballInCourt';
import {getStageHolders,withHolder} from './courtHolders';
import {getFieldRequirements} from './fieldRequirements';
import {intakeIssues} from './dealWorkflow';
import {OPEN_SERVICE_ISSUE_STATUSES,OPPORTUNITY_STAGES,STAGE_COLORS,ORDER_STATUSES,ORDER_STATUS_COLORS,TASK_STATUSES,RFQ_STATUSES,RFQ_STATUS_COLORS,labelFor} from './constants';
import {RFQ_QUEUE_STATUSES} from '@/app/rfq/queue-statuses';
import type {MyItemRow,MyItemKind} from './myItemsTypes';
import {shareRead} from './shareRead';
const ORDER_BALL_SELECT = {
  status: true,
  orderType: true,
  orderValue: true,
  depositRequired: true, paymentPlan: true,
  termsNotes: true,
  paymentTerms: true,
  payments: { select: { status: true, amount: true } },
  company: { select: { requiresDeposit: true, depositPercent: true, paymentTermsConfigured: true } },
  lineItems: { select: { rfqStatus: true, deliveryStatus: true, purchaseOrderId: true } },
  purchaseOrders: { select: { status: true } },
  deliveries: { select: { status: true } },
  _count: {
    select: { serviceIssues: { where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } } } },
  },
} satisfies Prisma.OrderSelect;

type OrderBallRow = PlainMoney<Prisma.OrderGetPayload<{ select: typeof ORDER_BALL_SELECT }>>;

function toOrderBallInput(order: OrderBallRow): OrderBallInput {
  const { _count, ...rest } = order;
  return { ...rest, openIssueCount: _count.serviceIssues };
}

export async function myItemPage(kind:MyItemKind,userId:string,cursor?:string){
 return shareRead(JSON.stringify(['my-items-v1',kind,userId,cursor]),async()=>{
 const cutoff=new Date();cutoff.setHours(0,0,0,0);
 const paging={take:21,...(cursor?{cursor:{id:cursor},skip:1}:{})};
 let rows:MyItemRow[]=[];
 if(kind==='deals'){
  const [items,holders,requirements]=await Promise.all([
   prisma.opportunity.findMany({...paging,where:{salespersonId:userId,stage:{notIn:['won','lost']}},relationLoadStrategy:'join',orderBy:[{nextFollowUp:'asc'},{createdAt:'desc'},{id:'asc'}],select:{id:true,title:true,stage:true,clientQuoteCreated:true,clientQuoteSent:true,companyId:true,neededByDate:true,nextFollowUp:true,salesperson:{select:{name:true,active:true}},lineItems:{select:{id:true,name:true,rfqStatus:true,unitPrice:true}}}}).then(plainMoney),getStageHolders(),getFieldRequirements()]);
  rows=items.map(item=>({id:item.id,href:`/pipeline/${item.id}`,title:item.title,label:labelFor(OPPORTUNITY_STAGES,item.stage),color:STAGE_COLORS[item.stage]??'badge-gray',date:item.nextFollowUp?.toISOString()??null,dateLabel:'Follow up',overdue:!!item.nextFollowUp&&item.nextFollowUp<cutoff,ball:withHolder(opportunityBall({...item,intakeComplete:intakeIssues(item,{company:requirements['opportunity.companyId'],neededBy:requirements['opportunity.neededByDate']}).length===0,order:null}),holders)}));
 }else if(kind==='orders'){
  const [items,holders]=await Promise.all([prisma.order.findMany({...paging,where:{ownerId:userId,status:{not:'complete'}},relationLoadStrategy:'join',orderBy:[{neededByDate:'asc'},{createdAt:'desc'},{id:'asc'}],select:{id:true,title:true,neededByDate:true,...ORDER_BALL_SELECT}}).then(plainMoney),getStageHolders()]);
  rows=items.map(item=>({id:item.id,href:`/orders/${item.id}`,title:item.title,label:labelFor(ORDER_STATUSES,item.status),color:ORDER_STATUS_COLORS[item.status]??'badge-gray',date:item.neededByDate?.toISOString()??null,dateLabel:'Needed',overdue:!!item.neededByDate&&item.neededByDate<cutoff&&!['delivered','complete'].includes(item.status),ball:withHolder(orderBall(toOrderBallInput(item)),holders)}));
 }else if(kind==='tasks'){
  const items=await prisma.task.findMany({...paging,where:{assigneeId:userId,status:{not:'done'}},orderBy:[{dueDate:'asc'},{createdAt:'desc'},{id:'asc'}],select:{id:true,title:true,status:true,dueDate:true}});
  rows=items.map(item=>({id:item.id,href:`/tasks/${item.id}`,title:item.title,label:labelFor(TASK_STATUSES,item.status),color:'badge-gray',date:item.dueDate?.toISOString()??null,dateLabel:'Due',overdue:!!item.dueDate&&item.dueDate<cutoff}));
 }else{
  const items=await prisma.lineItem.findMany({...paging,where:{assigneeId:userId,rfqStatus:{in:RFQ_QUEUE_STATUSES.map(s=>s.value)},OR:[{orderId:{not:null}},{opportunityId:null},{opportunity:{stage:{notIn:['won','lost']}}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,name:true,rfqStatus:true,createdAt:true}});
  rows=items.map(item=>({id:item.id,href:`/rfq#li-${item.id}`,title:item.name,label:labelFor(RFQ_STATUSES,item.rfqStatus),color:RFQ_STATUS_COLORS[item.rfqStatus]??'badge-gray',date:null,dateLabel:`${Math.floor((Date.now()-item.createdAt.getTime())/86400000)}d waiting`}));
 }
 const hasMore=rows.length>20;const visible=rows.slice(0,20);
 return {rows:visible,cursor:visible.at(-1)?.id??null,hasMore};
 });
}
