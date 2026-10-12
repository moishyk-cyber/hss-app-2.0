"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { BackLink } from "@/lib/BackLink";
import { FormFooter } from "@/lib/PageLayout";
import { FormAlert } from "@/lib/ui";
import { PendingButton } from "@/lib/ui";
import { TASK_PRIORITIES } from "@/lib/constants";
import { createTask } from "./actions";
import type { SearchResult } from "./actions";
import LinkedRecordPicker from "./LinkedRecordPicker";
import { TYPE_LABELS } from "./lib";

export default function TaskForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const {toast} = useToast();
  const [link, setLink] = useState<SearchResult | null>(null);
  const [error,setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await createTask(formData);
    if (result && result.ok === false) { setError(result.message); return; }
    toast({kind:"success", message:"Task created"});
    router.push("/tasks");
    router.refresh();
  }

  return <div className="card">{error && <FormAlert>{error}</FormAlert>}
          <form action={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="field-label">Title</span>
              <input name="title" required autoFocus className="input-klyne w-full" />
            </label>
            <label className="block">
              <span className="field-label">Assignee</span>
              <select name="assigneeId" className="input-klyne w-full">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Due date</span>
              <input type="date" name="dueDate" className="input-klyne w-full" />
            </label>
            <label className="block">
              <span className="field-label">Priority</span>
              <select name="priority" defaultValue="medium" className="input-klyne w-full">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Type</span>
              <select name="type" defaultValue="internal" className="input-klyne w-full">
                <option value="internal">Internal</option>
                <option value="customer_service">Customer Service</option>
                <option value="external">External</option>
              </select>
            </label>
            <div>
              <span className="field-label">Link to record</span>
              {link ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5 text-sm">
                  <span className="truncate">
                    <span className="badge badge-gray mr-1 text-[10px]">{TYPE_LABELS[link.type]}</span>
                    {link.label}
                  </span>
                  <button type="button" className="shrink-0 text-gray transition-colors hover:text-ink" aria-label="Remove linked record" onClick={() => setLink(null)}>
                    ×
                  </button>
                </div>
              ) : (
                <LinkedRecordPicker onSelect={setLink} />
              )}
              <input type="hidden" name="linkedType" value={link?.type ?? ""} />
              <input type="hidden" name="linkedId" value={link?.id ?? ""} />
            </div>
            <FormFooter>
              <BackLink href="/tasks" label="Cancel" className="btn"/>
              <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Adding…">
                Create task
              </PendingButton>
            </FormFooter>
          </form>
</div>;
}
