"use client";

// Log-an-issue form, built like intake: search the business FIRST, then narrow
// down to its required location, one of its
// orders, and an item on that order. Every pick collapses into a one-line
// summary with a "change" link, so nothing is locked in - re-searching at any
// level clears the picks below it. Then the issue itself: title, description,
// priority, date, and who it's assigned to.
//
// Supports prefill from ?companyId / ?orderId (resolved server-side and passed
// in as initialCompanyId / initialOrderId).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/lib/BackLink";
import { FormFooter } from "@/lib/PageLayout";
import { FormAlert, PendingButton } from "@/lib/ui";
import { SearchCombobox, type ComboboxOption } from "@/lib/Combobox";
import { TASK_PRIORITIES } from "@/lib/constants";
import { ymdToday } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { createServiceIssue } from "./actions";

type ServiceOrderOption = {
  id: string;
  title: string;
  locationId: string | null;
  lineItems: { id: string; name: string }[];
};

type ServiceLocationOption = { id: string; name: string; isDefault: boolean };

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
  disabled = false,
}: {
  label: string;
  placeholder: string;
  options: ComboboxOption[];
  selectedId: string;
  onPick: (option: ComboboxOption | null) => void;
  emptyText: string;
  disabled?: boolean;
}) {
  const picked = options.find((o) => o.id === selectedId) ?? null;
  const [query, setQuery] = useState(picked?.name ?? "");

  if (disabled) {
    return (
      <label className="block">
        <span className="field-label">{label} *</span>
        <input disabled className="input-klyne w-full" placeholder={placeholder} />
      </label>
    );
  }

  if (picked) {
    return (
      <PickedRow
        label={`${label} *`}
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
        required
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
  fullPage = false,
}: {
  companies: ServiceCompanyOption[];
  users: { id: string; name: string }[];
  defaultAssigneeId: string | null;
  initialCompanyId?: string | null;
  initialOrderId?: string | null;
  /** Force the form open on mount even with no prefill (used inline, e.g. OrderIssuesPanel). */
  startOpen?: boolean;
  fullPage?: boolean;
}) {
  const router = useRouter();
  const initialCompany = useMemo(() => {
    if (initialOrderId) return companies.find((c) => c.orders.some((o) => o.id === initialOrderId)) ?? null;
    if (initialCompanyId) return companies.find((c) => c.id === initialCompanyId) ?? null;
    return null;
  }, [companies, initialCompanyId, initialOrderId]);

  const [open, setOpen] = useState(startOpen || Boolean(initialCompany));
  const [companyId, setCompanyId] = useState(initialCompany?.id ?? "");
  const [orderId, setOrderId] = useState(initialCompany?.orders.find((o) => o.id === initialOrderId)?.id ?? "");
  const [lineItemId, setLineItemId] = useState("");
  const [locationId, setLocationId] = useState(() => {
    const order = initialCompany?.orders.find((o) => o.id === initialOrderId);
    if (order?.locationId) return order.locationId;
    return initialCompany?.locations.find((l) => l.isDefault)?.id ?? "";
  });
  const [error, setError] = useState<string | null>(null);
  // Bumping pickersKey remounts the search levels (their query text lives
  // locally); it deliberately leaves the title/description below untouched, so
  // changing the business after typing a title never wipes the title. formKey
  // resets the whole form after a successful submit.
  const [pickersKey, setPickersKey] = useState(0);
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
      (company?.orders ?? []).filter((o) => !o.locationId || o.locationId === locationId).map((o) => ({
        id: o.id,
        name: o.title,
        hint: `${o.lineItems.length} item${o.lineItems.length === 1 ? "" : "s"}`,
      })),
    [company, locationId]
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
    setPickersKey((k) => k + 1);
  }

  function pickLocation(next: ComboboxOption | null) {
    setLocationId(next?.id ?? "");
    setOrderId("");
    setLineItemId("");
    setPickersKey((k) => k + 1);
  }

  function pickOrder(next: ComboboxOption | null) {
    setOrderId(next?.id ?? "");
    const o = next ? company?.orders.find((x) => x.id === next.id) : null;
    if (o?.locationId) setLocationId(o.locationId);
    setLineItemId("");
    setPickersKey((k) => k + 1);
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
    if (!company || !locationOptions.some((l) => l.id === locationId) || !order || !itemOptions.some((i) => i.id === lineItemId)) {
      setError("Select a business, location, order, and specific order item before logging the issue.");
      return;
    }
    const result = await createServiceIssue(formData);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Issue logged." });
    if (fullPage) { router.push("/service"); router.refresh(); return; }
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
  const hasOrders = orderOptions.length > 0;
  const hasItems = (order?.lineItems.length ?? 0) > 0;

  return (
    <div className="card space-y-4">
      {!fullPage && <div className="flex items-center justify-between">
        {!fullPage && <h2 className="section-label">Log an issue</h2>}
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
      </div>}

      {error && <FormAlert>{error}</FormAlert>}

      <form key={formKey} action={handleSubmit} className="space-y-4">
        {/* ---- 1. Who is this about: business -> location -> order -> item ---- */}
        <section aria-labelledby="issue-order-heading" className="border-b border-border pb-4">
          <h2 id="issue-order-heading" className="font-medium">Order details</h2>
          <p className="mt-1 text-[13px] text-gray-dark">Select the business, location, order, and specific order item. All four fields are required.</p>
          <div key={pickersKey} className="mt-4 space-y-3">
            <SearchLevel
              label="Business"
              placeholder="Search businesses…"
              options={companyOptions}
              selectedId={companyId}
              onPick={pickCompany}
              emptyText="No business on file with that name."
            />
            <input type="hidden" name="companyId" value={companyId} />
            <SearchLevel
              label="Location"
              placeholder={company ? `Search ${company.name}'s locations…` : "Select a business first"}
              options={locationOptions}
              selectedId={locationId}
              onPick={pickLocation}
              disabled={!company || !hasLocations}
              emptyText="No location matches."
            />
            {company && !hasLocations && <p className="text-xs text-gray-dark">Add a location to this business before logging an issue.</p>}
            <input type="hidden" name="locationId" value={locationId} />
            <SearchLevel
              label="Order"
              placeholder={locationId ? "Search orders at this location…" : "Select a location first"}
              options={orderOptions}
              selectedId={orderId}
              onPick={pickOrder}
              disabled={!locationId || !hasOrders}
              emptyText="No order matches."
            />
            {company && locationId && !hasOrders && <p className="text-xs text-gray-dark">This location has no orders available. Select another location or create an order first.</p>}
            <input type="hidden" name="orderId" value={orderId} />
            <SearchLevel
              label="Specific order item"
              placeholder={order ? "Search items on this order…" : "Select an order first"}
              options={itemOptions}
              selectedId={lineItemId}
              onPick={pickItem}
              disabled={!order || !hasItems}
              emptyText="No item matches."
            />
            {order && !hasItems && <p className="text-xs text-gray-dark">Add an item to this order before logging an issue.</p>}
            <input type="hidden" name="lineItemId" value={lineItemId} />
          </div>
        </section>

        {/* ---- 2. The issue itself ---- */}
        <div className="space-y-3">
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
          <p className="text-xs text-gray-dark">Assignment starts with your team’s service default; change it here if someone else will handle the issue.</p>
        </div>

        <FormFooter>
          {fullPage && <BackLink href="/service" label="Cancel" className="btn"/>}
          {!startOpen && (
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          )}
          <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Logging…">
            Log issue
          </PendingButton>
        </FormFooter>
      </form>
    </div>
  );
}
