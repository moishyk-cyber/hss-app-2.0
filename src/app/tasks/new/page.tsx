import { getActiveUsers } from "@/lib/users";
import { DetailHeader } from "@/lib/PageLayout";
import TaskForm from "../TaskForm";
export default async function NewTaskPage() {
  const users = await getActiveUsers();
  return <div className="mx-auto max-w-3xl"><DetailHeader backHref="/tasks" backLabel="Back to Tasks" title="New task" subtitle="Set an owner, a due date, and any related record."/><TaskForm users={users}/></div>;
}
