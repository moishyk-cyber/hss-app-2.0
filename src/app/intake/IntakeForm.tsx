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

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="flex items-start gap-3 border-b border-border px-6 py-5">
        <span className="font-heading mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-bold text-accent">
          {step}
        </span>
        <div>
          <h2 className="font-heading text-[16px] font-semibold text-ink">{title}</h2>
          {hint ? <p className="mt-1 text-[13px] text-gray-dark">{hint}</p> : null}
        </div>
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-[10px] border px-4 py-3 text-[13px] transition-colors ${
        checked
          ? "border-accent bg-accent-soft"
          : "border-border bg-surface transition-colors hover:bg-hover"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 accent-accent"
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-gray-dark">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function IntakeForm({
  companies,
  salespeople,
}: {
  companies: IntakeCompany[];
  salespeople: { id: string; name: string }[];
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [orderType, setOrderType] = useState<"project" | "order">("project");
  const [deliveryType, setDeliveryType] = useState<"curbside" | "inside">("curbside");
  const [installationNeeded, setInstallationNeeded] = useState("no");
  const [needsPricing, setNeedsPricing] = useState("yes");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, name: "", details: "", qty: "1" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, companyQuery]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  const goesToPipeline = orderType === "project" || needsPricing === "yes";

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addItem() {
    setItems((rows) => [...rows, { key: nextKey, name: "", details: "", qty: "1" }]);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  return (
    <form action={submitIntake} className="max-w-4xl space-y-5">
      {/* hidden mirrors of the branching state so the server action sees plain fields */}
      <input type="hidden" name="clientMode" value={clientMode} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="orderType" value={orderType} />

      <Section step={1} title="Client" hint="Who is this order for?">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Radio
            name="clientModeRadio"
            value="existing"
            checked={clientMode === "existing"}
            onChange={(v) => setClientMode(v as "existing" | "new")}
            label="Existing client"
            description="Pick a company we already work with"
          />
          <Radio
            name="clientModeRadio"
            value="new"
            checked={clientMode === "new"}
            onChange={(v) => setClientMode(v as "existing" | "new")}
            label="New client"
            description="Capture their details now"
          />
        </div>

        {clientMode === "existing" ? (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Search companies</span>
                <input
                  type="search"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  placeholder="Start typing a name…"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Company</span>
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
                  <option value="">— select a company —</option>
                  {filteredCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedCompany ? (
              <p className="text-xs text-gray">
                {selectedCompany.locationName ? `${selectedCompany.locationName} · ` : ""}
                {selectedCompany.deliveryAddress ?? "No delivery address on file"}
              </p>
            ) : null}

            {selectedCompany ? (
              <div className="rounded-[10px] border border-border bg-panel p-4">
                <p className="section-label mb-3">Contact</p>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <Radio
                    name="contactModeRadio"
                    value="existing"
                    checked={contactMode === "existing"}
                    onChange={(v) => setContactMode(v as "existing" | "new")}
                    label="Pick an existing contact"
                  />
                  <Radio
                    name="contactModeRadio"
                    value="new"
                    checked={contactMode === "new"}
                    onChange={(v) => setContactMode(v as "existing" | "new")}
                    label="Add a new contact"
                  />
                </div>

                {contactMode === "existing" ? (
                  selectedCompany.contacts.length > 0 ? (
                    <label className="block">
                      <span className={labelClass}>Contact at {selectedCompany.name}</span>
                      <select name="contactId" className={inputClass} defaultValue="">
                        <option value="">— none —</option>
                        {selectedCompany.contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                            {c.title ? ` (${c.title})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="banner-info">
                      No contacts on file for {selectedCompany.name} — switch to &ldquo;Add a new
                      contact&rdquo;.
                    </div>
                  )
                ) : (
                  <NewContactFields />
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Business name</span>
                <input name="newCompanyName" required className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Business address</span>
                <input name="newCompanyAddress" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Phone</span>
                <input name="newCompanyPhone" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Phone extension</span>
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
                <span className={labelClass}>Delivery address</span>
                <input name="newCompanyDeliveryAddress" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Name of location</span>
                <input name="newCompanyLocationName" className={inputClass} />
              </label>
            </div>
            <div className="rounded-[10px] border border-border bg-panel p-4">
              <p className="section-label mb-3">Primary contact</p>
              <NewContactFields />
            </div>
          </div>
        )}
      </Section>

      <Section
        step={2}
        title="Order type"
        hint="Projects need bids and measurements. Orders are straight equipment requests."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Radio
            name="orderTypeRadio"
            value="project"
            checked={orderType === "project"}
            onChange={(v) => setOrderType(v as "project" | "order")}
            label="Project"
            description="Bid / measurement work — full site details required"
          />
          <Radio
            name="orderTypeRadio"
            value="order"
            checked={orderType === "order"}
            onChange={(v) => setOrderType(v as "project" | "order")}
            label="Order"
            description="Simple equipment order"
          />
        </div>

        {orderType === "project" ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                Inside delivery: confirm the openings fit before ordering. Equipment that will not
                fit through the door comes back with a supplier restocking fee — tell the client up
                front.
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <span className={labelClass}>Installation needed?</span>
              <div className="flex gap-3">
                <Radio
                  name="installationNeeded"
                  value="yes"
                  checked={installationNeeded === "yes"}
                  onChange={setInstallationNeeded}
                  label="Yes"
                />
                <Radio
                  name="installationNeeded"
                  value="no"
                  checked={installationNeeded === "no"}
                  onChange={setInstallationNeeded}
                  label="No"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <span className={labelClass}>Needs pricing?</span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Radio
                name="needsPricing"
                value="yes"
                checked={needsPricing === "yes"}
                onChange={setNeedsPricing}
                label="Yes"
                description="Goes to the pipeline for quoting"
              />
              <Radio
                name="needsPricing"
                value="no"
                checked={needsPricing === "no"}
                onChange={setNeedsPricing}
                label="No"
                description="Pricing already known — create the order directly"
              />
            </div>
          </div>
        )}
      </Section>

      <Section step={3} title="Timing & ownership" hint="When it's needed and who owns it.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>When do you need the order?</span>
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
          <label className="block">
            <span className={labelClass}>Delivery address (if different)</span>
            <input name="deliveryAddress" className={inputClass} />
          </label>
        </div>
      </Section>

      <Section step={4} title="Items needed" hint="Everything the client is asking for.">
        <div className="space-y-3">
          {items.map((row, index) => (
            <div key={row.key} className="flex items-end gap-3">
              <label className="block flex-1">
                {index === 0 ? <span className={labelClass}>Item</span> : null}
                <input
                  name="itemName"
                  value={row.name}
                  onChange={(e) => updateItem(row.key, { name: e.target.value })}
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
                  placeholder="Brand, model, notes…"
                  className={inputClass}
                />
              </label>
              <label className="block w-20">
                {index === 0 ? <span className={labelClass}>Qty</span> : null}
                <input
                  name="itemQty"
                  type="number"
                  min="1"
                  value={row.qty}
                  onChange={(e) => updateItem(row.key, { qty: e.target.value })}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => removeItem(row.key)}
                disabled={items.length === 1}
                className="btn btn-danger transition-colors active:scale-[0.99] disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="btn mt-4 transition-colors active:scale-[0.99]"
        >
          + Add item
        </button>

        <label className="mt-6 block">
          <span className={labelClass}>Notes for the team</span>
          <textarea name="notes" rows={3} className={inputClass} />
        </label>
      </Section>

      <div className="card flex flex-wrap items-center gap-4 px-6 py-5">
        <PendingButton className="btn btn-primary active:scale-[0.99]" pendingText="Creating…">
          Submit intake
        </PendingButton>
        <p className="text-[13px] text-gray-dark">
          {goesToPipeline
            ? "Creates an opportunity in the sales pipeline with items marked Needs Pricing."
            : "Creates an order directly with items marked Approved."}
        </p>
      </div>
    </form>
  );
}

function NewContactFields() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Contact first name</span>
        <input name="newContactFirstName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact last name</span>
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
        <span className={labelClass}>Contact email</span>
        <input type="email" name="newContactEmail" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact phone</span>
        <input name="newContactPhone" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact extension</span>
        <input name="newContactPhoneExt" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact cell</span>
        <input name="newContactCellPhone" className={inputClass} />
      </label>
    </div>
  );
}
