import { getActiveUsers } from "@/lib/users";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailHeader } from "@/lib/PageLayout";
import { ActivityHistory } from "@/lib/ActivityHistory";
import { SERVICE_ISSUE_STATUSES, labelFor } from "@/lib/constants";
import IssueDetail from "../IssueDetail";

export const dynamic = "force-dynamic";
export default async function IssuePage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const [issue,users] = await Promise.all([
    prisma.serviceIssue.findUnique({where:{id},include:{company:{select:{id:true,name:true}},location:{select:{id:true,name:true}},order:{select:{id:true,title:true}},lineItem:{select:{id:true,name:true}},assignee:{select:{name:true}}}}),
    getActiveUsers(),
  ]);
  if(!issue) notFound();
  const data = {...issue,assigneeName:issue.assignee?.name??null};
  return <div className="space-y-6"><DetailHeader backHref="/service" backLabel="Back to Customer Service" title={issue.title} subtitle={issue.company?.name??"Issue without a linked business"} badges={<span className="badge badge-gray">{labelFor(SERVICE_ISSUE_STATUSES,issue.status)}</span>}/><IssueDetail issue={data} users={users}/><ActivityHistory linkedType="service_issue" linkedId={id}/></div>;
}
