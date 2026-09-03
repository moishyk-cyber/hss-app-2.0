"use client";

// Log-an-issue form: company -> location -> order -> line item cascading
// pickers (each list is that of the picked company/order, filtered
// client-side), plus title/description/priority/reported date/assignee.
// Supports prefill from ?companyId / ?orderId (resolved server-side and
// passed in as initialCompanyId / initialOrderId).

import { useMemo, useState } from "react";
import { FormAlert, PendingButton } from "@/lib/ui";
import { TASK_PRIORITIES } from "@/lib/constants";
import { ymdToday } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { createServiceIssue } from "./actions";

export type ServiceOrderOption = {
  id: string;
  title: string;
  locationId: string | null;
  lineItems: { id: string; name: string }[];
};

export type ServiceLocationOption = { id: string; name: string; isDefault: boolean };

export type ServiceCompanyOption = {
  id: string;
  name: string;
  locations: ServiceLocationOption[];
  orders: ServiceOrderOption[];
};

export default function LogIssueForm({
  companies,
  users,
  defaultAssigneeId,
  initialCompanyId,
  initialOrderId,
  startOpen = false,
}: {
  companies: ServiceCompanyOption[];
  users: { id: string; name: string }[];
  defaultAssigneeId: string | null;
  initialCompanyId?: string | null;
  initialOrderId?: string | null;
  /** Force the form open on mount even with no prefill (used inline, e.g. OrderIssuesPanel). */
  startOpen?: boolean;
}) {
  const initialCompany = useMemo(() => {
    if (initialCompanyId) return companies.find((c) => c.id === initialCompanyId) ?? null;
    if (initialOrderId) return companies.find((c) => c.orders.some((o) => o.id === initialOrderId)) ?? null;
    return null;
  }, [companies, initialCompanyId, initialOrderId]);

  const [open, setOpen] = useState(startOpen || Boolean(initialCompany));
  const [companyId, setCompanyId] = useState(initialCompany?.id ?? "");
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [lineItemId, setLineItemId] = useState("");
  const [locationId, setLocationId] = useState(() => {
    const order = initialCompany?.orders.find((o) => o.id === initialOrderId);
    if (order?.locationId) return order.locationId;
    return initialCompany?.locations.find((l) => l.isDefault)?.id ?? "";
  });
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  const company = companies.find((c) => c.id === companyId) ?? null;
  const order = company?.orders.find((o) => o.id === orderId) ?? null;

  function handleCompanyChange(next: string) {
    setCompanyId(next);
    const c = companies.find((x) => x.id === next);
    setLocationId(c?.locations.find((l) => l.isDefault)?.id ?? "");
    setOrderId("");
    setLineItemId("");
  }

  function handleOrderChange(next: string) {
    setOrderId(next);
    const o = company?.orders.find((x) => x.id === next);
    if (o?.locationId) setLocationId(o.locationId);
    setLineItemId("");
  }

  function resetPickers() {
    setCompanyId("");
    setLocationId("");
    setOrderId("");
    setLineItemId("");
    setFormKey((k) => k + 1);
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await createServiceIssue(formData);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Issue logged." });
    resetPickers();
    if (!startOpen) setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary active:scale-[0.99]">
        + Log an issue
      </button>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-label">Log an issue</h2>
        {!startOpen && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-gray transition-colors hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      <form key={formKey} action={handleSubmit} className="space-y-3">
        <div>
          <span className="field-label">Title *</span>
          <input name="title" required autoFocus className="input-klyne w-full" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Company</span>
            <select
              name="companyId"
              value={companyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="input-klyne w-full"
            >
              <option value="">Not linked to a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Location</span>
            <select
              name="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={!company || company.locations.length === 0}
              className="input-klyne w-full"
            >
              <option value="">No location</option>
              {(company?.locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Order</span>
            <select
              name="orderId"
              value={orderId}
              onChange={(e) => handleOrderChange(e.target.value)}
              disabled={!company || company.orders.length === 0}
              className="input-klyne w-full"
            >
              <option value="">No order</option>
              {(company?.orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Line item</span>
            <select
              name="lineItemId"
              value={lineItemId}
              onChange={(e) => setLineItemId(e.target.value)}
              disabled={!order || order.lineItems.length === 0}
              className="input-klyne w-full"
            >
              <option value="">No item</option>
              {(order?.lineItems ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="field-label">Description</span>
          <textarea name="description" rows={3} className="input-klyne w-full" />
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
            <select name="assigneeId" defaultValue={defaultAssigneeId ?? ""} className="input-klyne w-full">
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
          {!startOpen && (
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          )}
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Logging…">
            Log issue
          </PendingButton>
        </div>
      </form>
    </div>
  );
}
