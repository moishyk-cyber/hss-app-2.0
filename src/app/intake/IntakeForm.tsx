"use client";

import { useMemo, useState } from "react";
import { PendingButton } from "@/lib/ui";
import { submitIntake } from "./actions";

type IntakeContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
};

type IntakeCompany = {
  id: string;
  name: string;
  deliveryAddress: string | null;
  locationName: string | null;
  contacts: IntakeContact[];
};

type ItemRow = { key: number; name: string; details: string; qty: string };

const inputClass = "input-klyne w-full";
const labelClass = "field-label";

function Panel({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="section-label">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-gray">{hint}</p> : null}
        </div>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Compact two-way toggle. Value is carried by a sibling hidden input. */
function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-border bg-panel p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.98] ${
            value === o.value
              ? "bg-surface text-ink shadow-[0_1px_2px_rgba(28,33,32,0.08)]"
              : "text-gray-dark hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Real radio input (its value must reach the server action) rendered as a compact pill. */
function InlineRadio({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
        checked ? "border-accent bg-accent-soft text-ink" : "border-border bg-surface hover:bg-hover"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="h-3.5 w-3.5 accent-accent"
      />
      {label}
    </label>
  );
}

export function IntakeForm({
  companies,
  salespeople,
  initialCompanyId,
}: {
  companies: IntakeCompany[];
  salespeople: { id: string; name: string }[];
  initialCompanyId?: string;
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [orderType, setOrderType] = useState<"project" | "order">("project");
  const [deliveryType, setDeliveryType] = useState<"curbside" | "inside">("curbside");
  const [installationNeeded, setInstallationNeeded] = useState("no");
  const [needsPricing, setNeedsPricing] = useState("yes");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, name: "", details: "", qty: "1" },
  ]);
  const [nextKey, setNextKey] = useState(2);
  // Newly-added rows mount with autoFocus, which lands the caret in their name field.
  const [autoFocusKey, setAutoFocusKey] = useState(1);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, companyQuery]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;
  const goesToPipeline = orderType === "project" || needsPricing === "yes";

  const namedItemCount = items.filter((i) => i.name.trim() !== "").length;
  const clientLabel =
    clientMode === "new"
      ? newCompanyName.trim() || "New client"
      : (selectedCompany?.name ?? "No client selected");

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addItem() {
    setItems((rows) => [...rows, { key: nextKey, name: "", details: "", qty: "1" }]);
    setAutoFocusKey(nextKey);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  /** Enter inside an item row never submits — it adds the next row instead. */
  function onItemKeyDown(e: React.KeyboardEvent, isLastRow: boolean) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isLastRow) addItem();
  }

  return (
    <form action={submitIntake} className="pb-4">
      {/* hidden mirrors of the branching state so the server action sees plain fields */}
      <input type="hidden" name="clientMode" value={clientMode} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="orderType" value={orderType} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* ---------------- LEFT: who / when ---------------- */}
        <div className="space-y-4">
          <Panel
            title="Who"
            action={
              <Segmented
                ariaLabel="Client type"
                value={clientMode}
                onChange={(v) => setClientMode(v as "existing" | "new")}
                options={[
                  { value: "existing", label: "Existing" },
                  { value: "new", label: "New client" },
                ]}
              />
            }
          >
            {clientMode === "existing" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className={labelClass}>Find the business</span>
                  <input
                    type="search"
                    value={companyQuery}
                    onChange={(e) => setCompanyQuery(e.target.value)}
                    placeholder="Start typing a name…"
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>
                    Business
                    {companyQuery.trim() ? (
                      <span className="ml-1 font-normal text-gray">
                        ({filteredCompanies.length} match
                        {filteredCompanies.length === 1 ? "" : "es"})
                      </span>
                    ) : null}
                  </span>
                  <select
                    name="companyId"
                    required
                    value={companyId}
                    onChange={(e) => {
                      setCompanyId(e.target.value);
                      setContactMode("existing");
                    }}
                    className={inputClass}
                  >
                    <option value="">— select a business —</option>
                    {filteredCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedCompany ? (
                  <>
                    <p className="text-xs text-gray">
                      {selectedCompany.locationName ? `${selectedCompany.locationName} · ` : ""}
                      {selectedCompany.deliveryAddress ?? "No delivery address on file"}
                    </p>

                    <div className="rounded-[10px] border border-border bg-panel p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="section-label">Contact</span>
                        <Segmented
                          ariaLabel="Contact type"
                          value={contactMode}
                          onChange={(v) => setContactMode(v as "existing" | "new")}
                          options={[
                            { value: "existing", label: "Existing" },
                            { value: "new", label: "New" },
                          ]}
                        />
                      </div>

                      {contactMode === "existing" ? (
                        selectedCompany.contacts.length > 0 ? (
                          <select name="contactId" className={inputClass} defaultValue="">
                            <option value="">— none —</option>
                            {selectedCompany.contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                                {c.title ? ` (${c.title})` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-gray-dark">
                            No contacts on file — switch to “New” to add one.
                          </p>
                        )
                      ) : (
                        <NewContactFields />
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Business name</span>
                    <input
                      name="newCompanyName"
                      required
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Phone</span>
                    <input name="newCompanyPhone" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Extension</span>
                    <input name="newCompanyPhoneExt" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Cell phone</span>
                    <input name="newCompanyCellPhone" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Email</span>
                    <input type="email" name="newCompanyEmail" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Business address</span>
                    <input name="newCompanyAddress" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Delivery address</span>
                    <input name="newCompanyDeliveryAddress" className={inputClass} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Name of location</span>
                    <input name="newCompanyLocationName" className={inputClass} />
                  </label>
                </div>

                <div className="rounded-[10px] border border-border bg-panel p-3">
                  <p className="section-label mb-2">Primary contact</p>
                  <NewContactFields />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="When & who owns it">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>When do you need it?</span>
                <input type="date" name="neededByDate" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Salesperson</span>
                <select name="salespersonId" className={inputClass} defaultValue="">
                  <option value="">— unassigned —</option>
                  {salespeople.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Delivery address (if different)</span>
                <input name="deliveryAddress" className={inputClass} />
              </label>
            </div>
          </Panel>
        </div>

        {/* ---------------- RIGHT: items / type ---------------- */}
        <div className="space-y-4">
          <Panel
            title="Items needed"
            hint="Press Enter on the last row to add another."
            action={<span className="badge badge-gray">{namedItemCount}</span>}
          >
            <div className="space-y-2">
              {items.map((row, index) => {
                const isLastRow = index === items.length - 1;
                return (
                  <div key={row.key} className="flex items-end gap-2">
                    <label className="block flex-1">
                      {index === 0 ? <span className={labelClass}>Item</span> : null}
                      <input
                        name="itemName"
                        autoFocus={row.key === autoFocusKey}
                        value={row.name}
                        onChange={(e) => updateItem(row.key, { name: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        placeholder="e.g. Double convection oven"
                        className={inputClass}
                      />
                    </label>
                    <label className="block flex-1">
                      {index === 0 ? <span className={labelClass}>Details</span> : null}
                      <input
                        name="itemDetails"
                        value={row.details}
                        onChange={(e) => updateItem(row.key, { details: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        placeholder="Brand, model, notes…"
                        className={inputClass}
                      />
                    </label>
                    <label className="block w-16">
                      {index === 0 ? <span className={labelClass}>Qty</span> : null}
                      <input
                        name="itemQty"
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) => updateItem(row.key, { qty: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(row.key)}
                      disabled={items.length === 1}
                      aria-label="Remove item"
                      className="btn btn-danger btn-sm mb-0.5 transition-colors active:scale-[0.99] disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="btn btn-sm mt-3 transition-colors active:scale-[0.99]"
            >
              + Add item
            </button>

            <label className="mt-4 block">
              <span className={labelClass}>Notes for the team</span>
              <textarea name="notes" rows={2} className={inputClass} />
            </label>
          </Panel>

          <Panel
            title="Order type"
            action={
              <Segmented
                ariaLabel="Order type"
                value={orderType}
                onChange={(v) => setOrderType(v as "project" | "order")}
                options={[
                  { value: "project", label: "Project" },
                  { value: "order", label: "Order" },
                ]}
              />
            }
          >
            {orderType === "project" ? (
              <>
                {/* A project always goes out for pricing — keep the field honest and implicit. */}
                <input type="hidden" name="needsPricing" value="yes" />
                <p className="text-[13px] text-gray-dark">
                  Bid / measurement work. Projects always go out for pricing, so this becomes an
                  opportunity in the pipeline.
                </p>
              </>
            ) : (
              <div>
                <span className={labelClass}>Needs pricing?</span>
                <div className="flex flex-wrap gap-2">
                  <InlineRadio
                    name="needsPricing"
                    value="yes"
                    checked={needsPricing === "yes"}
                    onChange={setNeedsPricing}
                    label="Yes — send to pipeline"
                  />
                  <InlineRadio
                    name="needsPricing"
                    value="no"
                    checked={needsPricing === "no"}
                    onChange={setNeedsPricing}
                    label="No — priced already"
                  />
                </div>
              </div>
            )}
          </Panel>

          {orderType === "project" ? (
            <details open className="card">
              <summary className="cursor-pointer px-5 py-3 marker:text-gray">
                <span className="section-label">Project details</span>
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-border px-5 py-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Facility type</span>
                  <input name="facilityType" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Menu</span>
                  <input name="menu" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Dimensions of room</span>
                  <input name="roomDimensions" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Wall measurements</span>
                  <input name="wallMeasurements" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Delivery type</span>
                  <select
                    name="deliveryType"
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as "curbside" | "inside")}
                    className={inputClass}
                  >
                    <option value="curbside">Curbside</option>
                    <option value="inside">Inside</option>
                  </select>
                </label>
                {deliveryType === "inside" ? (
                  <label className="block">
                    <span className={labelClass}>How large are the openings?</span>
                    <input name="openingSize" className={inputClass} />
                  </label>
                ) : (
                  <div />
                )}
                {deliveryType === "inside" ? (
                  <div className="banner-warn sm:col-span-2">
                    Inside delivery: confirm the openings fit before ordering. Equipment that will
                    not fit through the door comes back with a supplier restocking fee — tell the
                    client up front.
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <span className={labelClass}>Installation needed?</span>
                  <div className="flex gap-2">
                    <InlineRadio
                      name="installationNeeded"
                      value="yes"
                      checked={installationNeeded === "yes"}
                      onChange={setInstallationNeeded}
                      label="Yes"
                    />
                    <InlineRadio
                      name="installationNeeded"
                      value="no"
                      checked={installationNeeded === "no"}
                      onChange={setInstallationNeeded}
                      label="No"
                    />
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {/* ---------------- sticky outcome bar ---------------- */}
      <div className="sticky bottom-0 z-10 mt-4">
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface/85 px-5 py-3.5 backdrop-blur">
          <p className="text-[13px] text-gray-dark">
            <span className="font-medium text-ink">
              {namedItemCount} item{namedItemCount === 1 ? "" : "s"}
            </span>
            <span className="mx-1.5 text-gray">·</span>
            {orderType === "project" ? "Project" : "Order"}
            <span className="mx-1.5 text-gray">·</span>
            <span className={selectedCompany || clientMode === "new" ? "" : "text-gray"}>
              {clientLabel}
            </span>
          </p>
          <PendingButton
            className="btn btn-primary active:scale-[0.99]"
            pendingText={goesToPipeline ? "Creating opportunity…" : "Creating order…"}
          >
            {goesToPipeline ? "Create opportunity" : "Create order"}
          </PendingButton>
        </div>
      </div>
    </form>
  );
}

function NewContactFields() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>First name</span>
        <input name="newContactFirstName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Last name</span>
        <input name="newContactLastName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Title</span>
        <select name="newContactTitle" className={inputClass} defaultValue="">
          <option value="">— none —</option>
          <option value="manager">Manager</option>
          <option value="purchasing">Purchasing</option>
          <option value="billing">Billing</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Email</span>
        <input type="email" name="newContactEmail" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Phone</span>
        <input name="newContactPhone" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Extension</span>
        <input name="newContactPhoneExt" className={inputClass} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Cell</span>
        <input name="newContactCellPhone" className={inputClass} />
      </label>
    </div>
  );
}
