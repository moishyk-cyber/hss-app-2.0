import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
const db=new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
async function main(){
 const sql=await readFile(new URL('../prisma/sql/20261021_approved_workflow.sql',import.meta.url),'utf8');
 await db.$executeRawUnsafe(sql);
 console.log('Approved workflow migration applied; historical order fields preserved.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;}).finally(()=>db.$disconnect());
