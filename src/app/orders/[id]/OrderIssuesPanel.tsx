"use client";

// Order detail Service tab: the order's own service issues, plus a quick-add
// form pre-linked to the order (company/location inherited, no picker needed -
// only which line item, if any). Agent D wires this into OrderTabs/page.tsx;
// this file only owns its own rendering.

import { useState } from "react";
import { FormAlert, PendingButton } from "@/lib/ui";
import { TASK_PRIORITIES } from "@/lib/constants";
import { ymdToday } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { createServiceIssue } from "../../service/actions";
import IssueRow, { type IssueRowData } from "../../service/IssueRow";

export type OrderIssuesPanelProps = {
  orderId: string;
  companyId: string | null;
  locationId: string | null;
  issues: IssueRowData[];
  users: { id: string; name: string }[];
  items: { id: string; name: string }[];
};

export default function OrderIssuesPanel({ orderId, companyId, locationId, issues, users, items }: OrderIssuesPanelProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await createServiceIssue(formData);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Issue logged." });
    setFormKey((k) => k + 1);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label">Service issues</h2>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn btn-sm">
            + Log an issue
          </button>
        )}
      </div>

      {open && (
        <div className="card space-y-3">
          {error && <FormAlert>{error}</FormAlert>}
          <form key={formKey} action={handleSubmit} className="space-y-3">
            <input type="hidden" name="companyId" value={companyId ?? ""} />
            <input type="hidden" name="locationId" value={locationId ?? ""} />
            <input type="hidden" name="orderId" value={orderId} />

            <label className="block">
              <span className="field-label">Title *</span>
              <input name="title" required autoFocus className="input-klyne w-full" />
            </label>

            <label className="block">
              <span className="field-label">Line item</span>
              <select name="lineItemId" defaultValue="" disabled={items.length === 0} className="input-klyne w-full">
                <option value="">No item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="field-label">Description</span>
              <textarea name="description" rows={2} className="input-klyne w-full" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                <span className="field-label">Reported date</span>
                <input type="date" name="reportedAt" defaultValue={ymdToday()} className="input-klyne w-full" />
              </label>
              <label className="block">
                <span className="field-label">Assignee</span>
                <select name="assigneeId" defaultValue="" className="input-klyne w-full">
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Logging…">
                Log issue
              </PendingButton>
            </div>
          </form>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="empty-state">
          No service issues logged for this order yet. Use &ldquo;Log an issue&rdquo; above once a customer calls in
          a problem.
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          <div className="divide-y divide-border">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} users={users} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
