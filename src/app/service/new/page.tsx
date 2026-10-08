import { getActiveUsers } from "@/lib/users";
import { prisma } from "@/lib/prisma";
import { DetailHeader } from "@/lib/PageLayout";
import LogIssueForm from "../LogIssueForm";
import { resolveDefaultAssigneeId } from "../lib";
export default async function NewIssuePage({searchParams}: {searchParams:Promise<{companyId?:string;orderId?:string}>}) {
  const prefill = await searchParams;
  const [companies,users,defaultAssigneeId] = await Promise.all([
    prisma.company.findMany({select:{id:true,name:true,locations:{select:{id:true,name:true,isDefault:true},orderBy:{name:"asc"}},orders:{select:{id:true,title:true,locationId:true,lineItems:{select:{id:true,name:true}}},orderBy:{createdAt:"desc"}}},orderBy:{name:"asc"}}),
    getActiveUsers(),
    resolveDefaultAssigneeId(),
  ]);
  return <div className="mx-auto max-w-3xl"><DetailHeader backHref="/service" backLabel="Back to Customer Service" title="Log an issue" subtitle="Capture the customer call, then link the relevant records."/><LogIssueForm companies={companies} users={users} defaultAssigneeId={defaultAssigneeId} initialCompanyId={prefill.companyId} initialOrderId={prefill.orderId} startOpen fullPage/></div>;
}
