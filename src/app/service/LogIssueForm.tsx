"use client";

// Log-an-issue form, built like intake: search the business FIRST, then narrow
// down to its location (only when the business has locations), one of its
// orders, and an item on that order. Every pick collapses into a one-line
// summary with a "change" link, so nothing is locked in - re-searching at any
// level clears the picks below it. Then the issue itself: title, description,
// priority, date, and who it's assigned to.
//
// Supports prefill from ?companyId / ?orderId (resolved server-side and passed
// in as initialCompanyId / initialOrderId).

import { useMemo, useState } from "react";
import { FormAlert, PendingButton } from "@/lib/ui";
import { SearchCombobox, type ComboboxOption } from "@/lib/Combobox";
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

const MAX_RESULTS = 8;

/** A confirmed pick: one line of text with a "change" link that reopens the search. */
function PickedRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: React.ReactNode;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] border border-border bg-panel px-3 py-2">
      <div className="min-w-0">
        <span className="field-label !mb-0.5 block">{label}</span>
        <span className="block truncate text-[13px] text-ink">{value}</span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-xs text-primary transition-colors hover:underline"
      >
        change
      </button>
    </div>
  );
}

/**
 * One level of the drill-down: a search box until something is picked, then a
 * PickedRow. `onPick(null)` means "re-searching" (the caller clears the levels
 * below it).
 */
function SearchLevel({
  label,
  placeholder,
  options,
  selectedId,
  onPick,
  emptyText,
}: {
  label: string;
  placeholder: string;
  options: ComboboxOption[];
  selectedId: string;
  onPick: (option: ComboboxOption | null) => void;
  emptyText: string;
}) {
  const picked = options.find((o) => o.id === selectedId) ?? null;
  const [query, setQuery] = useState(picked?.name ?? "");

  if (picked) {
    return (
      <PickedRow
        label={label}
        value={
          <>
            {picked.name}
            {picked.hint ? <span className="ml-2 text-xs text-gray">{picked.hint}</span> : null}
          </>
        }
        onChange={() => {
          setQuery("");
          onPick(null);
        }}
      />
    );
  }

  return (
    <div>
      <SearchCombobox
        label={label}
        placeholder={placeholder}
        options={options}
        query={query}
        setQuery={setQuery}
        selectedId=""
        onPick={(o) => {
          setQuery(o.name);
          onPick(o);
        }}
        onCreate={() => undefined}
        allowCreate={false}
        maxResults={MAX_RESULTS}
        emptyText={emptyText}
      />
    </div>
  );
}

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
  // Bumping this remounts every search level so their local query state resets.
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  const company = companies.find((c) => c.id === companyId) ?? null;
  const order = company?.orders.find((o) => o.id === orderId) ?? null;

  const companyOptions: ComboboxOption[] = useMemo(
    () =>
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        hint:
          c.orders.length > 0
            ? `${c.orders.length} order${c.orders.length === 1 ? "" : "s"}`
            : "no orders yet",
      })),
    [companies]
  );
  const locationOptions: ComboboxOption[] = useMemo(
    () =>
      (company?.locations ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        hint: l.isDefault ? "default" : null,
      })),
    [company]
  );
  const orderOptions: ComboboxOption[] = useMemo(
    () =>
      (company?.orders ?? []).map((o) => ({
        id: o.id,
        name: o.title,
        hint: `${o.lineItems.length} item${o.lineItems.length === 1 ? "" : "s"}`,
      })),
    [company]
  );
  const itemOptions: ComboboxOption[] = useMemo(
    () => (order?.lineItems ?? []).map((i) => ({ id: i.id, name: i.name })),
    [order]
  );

  function pickCompany(next: ComboboxOption | null) {
    setCompanyId(next?.id ?? "");
    const c = next ? companies.find((x) => x.id === next.id) : null;
    setLocationId(c?.locations.find((l) => l.isDefault)?.id ?? "");
    setOrderId("");
    setLineItemId("");
    setFormKey((k) => k + 1);
  }

  function pickLocation(next: ComboboxOption | null) {
    setLocationId(next?.id ?? "");
  }

  function pickOrder(next: ComboboxOption | null) {
    setOrderId(next?.id ?? "");
    const o = next ? company?.orders.find((x) => x.id === next.id) : null;
    if (o?.locationId) setLocationId(o.locationId);
    setLineItemId("");
    setFormKey((k) => k + 1);
  }

  function pickItem(next: ComboboxOption | null) {
    setLineItemId(next?.id ?? "");
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

  const hasLocations = (company?.locations.length ?? 0) > 0;
  const hasOrders = (company?.orders.length ?? 0) > 0;
  const hasItems = (order?.lineItems.length ?? 0) > 0;

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

      <form key={formKey} action={handleSubmit} className="space-y-4">
        {/* ---- 1. Who is this about: business -> location -> order -> item ---- */}
        <div className="space-y-2">
          <p className="text-[13px] text-gray-dark">Who is this about? Search the business first.</p>

          <SearchLevel
            label="Business"
            placeholder="Search businesses…"
            options={companyOptions}
            selectedId={companyId}
            onPick={pickCompany}
            emptyText="No business on file with that name."
          />
          <input type="hidden" name="companyId" value={companyId} />

          {company && hasLocations ? (
            <SearchLevel
              label="Location"
              placeholder={`Search ${company.name}'s locations…`}
              options={locationOptions}
              selectedId={locationId}
              onPick={pickLocation}
              emptyText="No location matches."
            />
          ) : null}
          <input type="hidden" name="locationId" value={locationId} />

          {company ? (
            hasOrders ? (
              <SearchLevel
                label="Order"
                placeholder={`Search ${company.name}'s orders…`}
                options={orderOptions}
                selectedId={orderId}
                onPick={pickOrder}
                emptyText="No order matches."
              />
            ) : (
              <p className="text-xs text-gray">
                {company.name} has no orders on file - the issue will be logged against the business only.
              </p>
            )
          ) : null}
          <input type="hidden" name="orderId" value={orderId} />

          {order ? (
            hasItems ? (
              <SearchLevel
                label="Item"
                placeholder="Search items on this order…"
                options={itemOptions}
                selectedId={lineItemId}
                onPick={pickItem}
                emptyText="No item matches."
              />
            ) : (
              <p className="text-xs text-gray">This order has no items to pick from.</p>
            )
          ) : null}
          <input type="hidden" name="lineItemId" value={lineItemId} />

          {!company ? (
            <p className="text-xs text-gray">
              Can&rsquo;t find the business? You can still log the issue without linking it.
            </p>
          ) : null}
        </div>

        {/* ---- 2. The issue itself ---- */}
        <div className="space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="field-label">Title *</span>
            <input name="title" required className="input-klyne w-full" placeholder="What went wrong?" />
          </label>

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
              <span className="field-label">Date</span>
              <input type="date" name="reportedAt" defaultValue={ymdToday()} className="input-klyne w-full" />
            </label>

            <label className="block">
              <span className="field-label">Assigned to</span>
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
