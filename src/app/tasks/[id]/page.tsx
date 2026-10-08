import { getActiveUsers } from "@/lib/users";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailHeader } from "@/lib/PageLayout";
import { ActivityHistory } from "@/lib/ActivityHistory";
import { TASK_STATUSES, TASK_PRIORITIES, labelFor } from "@/lib/constants";
import TaskDetail from "../TaskDetail";
import { resolveLinkedLabels } from "../data";
import type { TaskRowData } from "../TaskRow";

export const dynamic = "force-dynamic";
export default async function TaskPage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const [task, users] = await Promise.all([
    prisma.task.findUnique({where:{id},include:{assignee:{select:{id:true,name:true}},_count:{select:{comments:true}},subtasks:{include:{assignee:{select:{id:true,name:true}},_count:{select:{comments:true}}},orderBy:{createdAt:"asc"}}}}),
    getActiveUsers(),
  ]);
  if (!task) notFound();
  const all = [task,...task.subtasks];
  const labels = await resolveLinkedLabels(all.flatMap(t=>t.linkedType && t.linkedId ? [{type:t.linkedType,id:t.linkedId}] : []));
  function row(t: typeof all[number]): TaskRowData { return {id:t.id,title:t.title,notes:t.notes,assigneeId:t.assigneeId,assigneeName:t.assignee?.name??null,dueDate:t.dueDate,status:t.status,priority:t.priority,type:t.type,linkedType:t.linkedType,linkedId:t.linkedId,linkedLabel:t.linkedType && t.linkedId ? labels.get(`${t.linkedType}:${t.linkedId}`)??null:null,commentCount:t._count.comments,subtasks:[]}; }
  const data = {...row(task),subtasks:task.subtasks.map(row)};
  return <div className="space-y-6"><DetailHeader backHref="/tasks" backLabel="Back to Tasks" title={task.title} subtitle={task.assignee ? `Assigned to ${task.assignee.name}` : "Unassigned task"} badges={<><span className="badge badge-gray">{labelFor(TASK_STATUSES,task.status)}</span><span className="badge badge-gray">{labelFor(TASK_PRIORITIES,task.priority)} priority</span></>}/><TaskDetail task={data} users={users}/><ActivityHistory linkedType="task" linkedId={id}/></div>;
}
