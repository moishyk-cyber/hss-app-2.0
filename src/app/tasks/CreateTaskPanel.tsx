"use client";

import { useState } from "react";
import { PendingButton } from "@/lib/ui";
import { TASK_PRIORITIES } from "@/lib/constants";
import { createTask } from "./actions";
import type { SearchResult } from "./actions";
import LinkedRecordPicker from "./LinkedRecordPicker";
import { TYPE_LABELS } from "./lib";

export default function CreateTaskPanel({ users }: { users: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<SearchResult | null>(null);

  async function handleSubmit(formData: FormData) {
    await createTask(formData);
    setOpen(false);
    setLink(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-primary fixed bottom-8 right-8 z-40 flex h-12 w-12 items-center justify-center text-2xl leading-none shadow-lg active:scale-[0.97]"
        style={{ padding: 0, borderRadius: "9999px" }}
        aria-label={open ? "Close new task form" : "Add task"}
      >
        {open ? "×" : "+"}
      </button>

      {open && (
        <div className="card fixed bottom-24 right-8 z-40 w-80 space-y-3 p-4 shadow-lg">
          <div className="section-label">New Task</div>
          <form action={handleSubmit} className="space-y-3">
            <div>
              <span className="field-label">Title</span>
              <input name="title" required autoFocus className="input-klyne w-full" />
            </div>
            <div>
              <span className="field-label">Assignee</span>
              <select name="assigneeId" className="input-klyne w-full">
                <option value="">— unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label">Due date</span>
              <input type="date" name="dueDate" className="input-klyne w-full" />
            </div>
            <div>
              <span className="field-label">Priority</span>
              <select name="priority" defaultValue="medium" className="input-klyne w-full">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label">Type</span>
              <select name="type" defaultValue="internal" className="input-klyne w-full">
                <option value="internal">Internal</option>
                <option value="customer_service">Customer Service</option>
                <option value="external">External</option>
              </select>
            </div>
            <div>
              <span className="field-label">Link to record</span>
              {link ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5 text-sm">
                  <span className="truncate">
                    <span className="badge badge-gray mr-1 text-[10px]">{TYPE_LABELS[link.type]}</span>
                    {link.label}
                  </span>
                  <button type="button" className="shrink-0 text-gray transition-colors hover:text-ink" onClick={() => setLink(null)}>
                    ×
                  </button>
                </div>
              ) : (
                <LinkedRecordPicker onSelect={setLink} />
              )}
              <input type="hidden" name="linkedType" value={link?.type ?? ""} />
              <input type="hidden" name="linkedId" value={link?.id ?? ""} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Adding…">
                Add task
              </PendingButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
