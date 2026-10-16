import { IssueNotes } from "../IssueNotes";
import { SERVICE_NOTE_ACTION } from "@/lib/workflows/serviceNotes";
import { collectionLimit } from "@/lib/CollectionWindow";
import { getActiveUsers } from "@/lib/users";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailHeader } from "@/lib/PageLayout";
import { ActivityHistory } from "@/lib/ActivityHistory";
import { SERVICE_ISSUE_STATUSES, labelFor } from "@/lib/constants";
import IssueDetail from "../IssueDetail";

export const dynamic = "force-dynamic";
export default async function IssuePage({params, searchParams}: {params: Promise<{id:string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const {id} = await params;
  const limit = collectionLimit(await searchParams);
  const [issue,users] = await Promise.all([
    prisma.serviceIssue.findUnique({where:{id},include:{company:{select:{id:true,name:true}},location:{select:{id:true,name:true}},order:{select:{id:true,title:true}},lineItem:{select:{id:true,name:true}},assignee:{select:{name:true}}}}),
    getActiveUsers(),
  ]);
  if(!issue) notFound();
  const data = {...issue,assigneeName:issue.assignee?.name??null};
  return <div className="space-y-6"><DetailHeader backHref="/service" backLabel="Back to Customer Service" title={issue.title} subtitle={issue.company?.name??"Issue without a linked business"} badges={<span className="badge badge-gray">{labelFor(SERVICE_ISSUE_STATUSES,issue.status)}</span>}/><IssueDetail issue={data} users={users}/><IssueNotes issueId={id} limit={limit}/><ActivityHistory linkedType="service_issue" linkedId={id} entries={prisma.activityLog.findMany({ where: { linkedType: "service_issue", linkedId: id, action: { not: SERVICE_NOTE_ACTION } }, orderBy: { at: "desc" }, take: 20 })}/></div>;
}
