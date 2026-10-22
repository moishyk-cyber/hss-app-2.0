import { requireTestDatabase } from "../src/lib/environmentMode";
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient({ datasourceUrl: requireTestDatabase() });
async function main(){
 const indexes=await db.$queryRaw<Array<{tablename:string;indexname:string;indexdef:string}>>`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('Order','LineItem','ServiceIssue','PurchaseOrder','Delivery','Payment','Opportunity','Task','Contact','Company') ORDER BY tablename,indexname`;
 console.log(JSON.stringify(indexes,null,2));
 const at=performance.now();await db.order.findMany({select:{id:true,status:true,_count:{select:{serviceIssues:{where:{status:{in:['open','in_progress']}}}}}}});console.log('Order index ms',Math.round(performance.now()-at));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
